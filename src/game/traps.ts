import type { Faction } from '../gfx/ctx';
import { FLOOR_Y } from '../gfx/ctx';
import { clamp, mulberry32 } from '../gfx/math';
import type { TrapSeam } from '../gfx/arena';
import { PLATFORMS } from '../gfx/arena';

export type TrapKind = 'spike' | 'flare' | 'snare' | 'gravity' | 'collapse' | 'hex';

export interface Trap {
  index: number;
  kind: TrapKind;
  seam: TrapSeam;
  armed: boolean;
  cooldown: number;
  reveal: number;
  /** active state progress 0..1 while it fires */
  firing: number;
  /** how long the effect lasts */
  fireDur: number;
  triggeredBy: Faction | null;
  triggeredAt: number;
}

export interface TrapEvent {
  kind: TrapKind;
  index: number;
  x: number;
  y: number;
  victim: Faction;
  damage: number;
  launchVy?: number;
  launchVx?: number;
  root?: number;
  invert?: number;
  pull?: number;
  collapse?: number;
}

export const TRAP_DEFS: Record<TrapKind, { damage: number; fireDur: number; color: string; name: string }> = {
  spike: { damage: 14, fireDur: 0.55, color: '#ffd178', name: 'SPIKE VENT' },
  flare: { damage: 10, fireDur: 0.5, color: '#ff9a5c', name: 'FLARE JET' },
  snare: { damage: 0, fireDur: 0.9, color: '#c7a6ff', name: 'SNARE' },
  gravity: { damage: 0, fireDur: 1.3, color: '#8fd8ff', name: 'GRAVITY WELL' },
  collapse: { damage: 8, fireDur: 2.0, color: '#ffd178', name: 'COLLAPSE' },
  hex: { damage: 0, fireDur: 1.1, color: '#ff8ae0', name: 'HEX PLATE' },
};

export const TRAP_REARM = 7.5;

/** Per-fighter status effects that traps can inflict (symmetric, both sides). */
export interface Status {
  root: number;
  invert: number;
  pull: number;
  pullX: number;
  foldCollapse: number;
}

export function newStatus(): Status {
  return { root: 0, invert: 0, pull: 0, pullX: 0, foldCollapse: 0 };
}

export function tickStatus(s: Status, dt: number): void {
  s.root = Math.max(0, s.root - dt);
  s.invert = Math.max(0, s.invert - dt);
  s.pull = Math.max(0, s.pull - dt);
  s.foldCollapse = Math.max(0, s.foldCollapse - dt);
}

export interface Body2 {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  hp: number;
}

/** Builds a fresh armed-tile layout; called on every generation change. */
export function rollLayout(seams: TrapSeam[], seed: number): Trap[] {
  const rnd = mulberry32(seed);
  const kinds: TrapKind[] = ['spike', 'flare', 'snare', 'gravity', 'collapse', 'hex'];
  // shuffle
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return seams.map((s, i) => ({
    index: s.index,
    kind: kinds[i % kinds.length],
    seam: s,
    armed: i < 3,
    cooldown: 0,
    reveal: 0,
    firing: 0,
    fireDur: TRAP_DEFS[kinds[i % kinds.length]].fireDur,
    triggeredBy: null,
    triggeredAt: -1,
  }));
}

export interface TrapCheckResult {
  events: TrapEvent[];
}

/**
 * Symmetric trigger test: whichever body is standing on an armed seam when its
 * cooldown is ready sets it off. No player-only or replica-only bias.
 */
export function checkTraps(traps: Trap[], bodies: Record<Faction, Body2>, dt: number): TrapCheckResult {
  const events: TrapEvent[] = [];
  for (const t of traps) {
    t.cooldown = Math.max(0, t.cooldown - dt);
    t.reveal = Math.min(1, t.reveal + dt * 1.5);
    if (t.firing > 0) t.firing = Math.max(0, t.firing - dt / Math.max(0.001, t.fireDur));
    if (!t.armed || t.cooldown > 0) continue;

    const sx = t.seam.x;
    const sw = t.seam.w;
    const sy = t.seam.y;

    for (const f of ['player', 'replica'] as Faction[]) {
      const b = bodies[f];
      const onTile = b.x > sx - 12 && b.x < sx + sw + 12 && Math.abs(b.y - sy) < 4 && b.grounded;
      if (!onTile) continue;
      t.cooldown = TRAP_REARM;
      t.firing = 1;
      t.triggeredBy = f;
      t.triggeredAt = 0;
      t.reveal = 1;
      const def = TRAP_DEFS[t.kind];
      const ev: TrapEvent = {
        kind: t.kind,
        index: t.index,
        x: sx + sw / 2,
        y: sy,
        victim: f,
        damage: def.damage,
      };
      if (t.kind === 'spike') {
        ev.launchVy = -620;
        ev.launchVx = 0;
      } else if (t.kind === 'flare') {
        ev.launchVx = b.x < 640 ? 260 : -260;
        ev.launchVy = -240;
      } else if (t.kind === 'snare') {
        ev.root = 0.65;
      } else if (t.kind === 'gravity') {
        ev.pull = 1.2;
      } else if (t.kind === 'collapse') {
        ev.collapse = 2.0;
      } else if (t.kind === 'hex') {
        ev.invert = 1.0;
      }
      events.push(ev);
      break;
    }
  }
  return { events };
}

/** Applies a trap event to a body. Symmetric: identical for both factions. */
export function applyTrapEvent(ev: TrapEvent, body: Body2, status?: Status): void {
  body.hp = Math.max(0, body.hp - ev.damage);
  if (ev.launchVy !== undefined) {
    body.vy = ev.launchVy;
    body.grounded = false;
  }
  if (ev.launchVx !== undefined) body.vx = ev.launchVx;
  if (!status) return;
  if (ev.root) status.root = Math.max(status.root, ev.root);
  if (ev.invert) status.invert = Math.max(status.invert, ev.invert);
  if (ev.pull) {
    status.pull = Math.max(status.pull, ev.pull);
    status.pullX = ev.x;
  }
  if (ev.collapse) status.foldCollapse = Math.max(status.foldCollapse, ev.collapse);
}

export function plateForSeam(seamY: number): number {
  if (seamY === FLOOR_Y) return 0;
  return seamY;
}

export function platformContains(x: number, y: number): boolean {
  for (const p of PLATFORMS) {
    if (y === p.y && x > p.x && x < p.x + p.w) return true;
  }
  return y >= FLOOR_Y;
}

export function snapToPlate(x: number): number {
  return clamp(x, 60, 1220);
}
