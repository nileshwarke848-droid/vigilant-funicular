import type { WeaponId } from '../gfx/character';
import type { Faction } from '../gfx/ctx';
import { FLOOR_Y } from '../gfx/ctx';
import { clamp, TAU } from '../gfx/math';
import { PHYS, stepPhysics, type Body, type Platform, type Tuning } from './physics';
import { WEAPONS } from './weapons';
import { newStatus, tickStatus, type Status } from './traps';

export type HitId = number;

export interface Projectile {
  id: number;
  owner: Faction;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  reflected: boolean;
}

export interface ActiveWeapon {
  owner: Faction;
  weapon: WeaponId;
  age: number;
  hitDone: boolean;
  x: number; // cast origin
  y: number;
  facing: 1 | -1;
  runeX?: number;
  phaseTo?: number;
}

export interface Impact {
  id: number;
  x: number;
  y: number;
  kind: 'slash' | 'bolt' | 'parry' | 'chain' | 'trap' | 'phase' | 'hurt';
  age: number;
  color: string;
  power: number;
  owner?: Faction;
  facing?: 1 | -1;
}

export interface DuelAmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'spark' | 'dust';
}

export interface BufferedInput {
  weapon: WeaponId | null;
  jumpPressed: boolean;
  jumpHeld: boolean;
  move: -1 | 0 | 1;
  down: boolean;
}

export interface DuelOptions {
  playerSpec?: Partial<Record<WeaponId, Partial<{ cooldown: number; damage: number }>>>;
  seed?: number;
}

let nextId = 1;

export class Duel {
  player: Body & { hp: number; face: 1 | -1 };
  replica: Body & { hp: number; face: 1 | -1 };
  tuningPlayer: Tuning = {};
  tuningReplica: Tuning = { walkSpeed: 290, accel: 2300, airAccel: 1300, jumpVel: 810 };

  cooldowns: Record<Faction, Record<WeaponId, number>>;
  active: ActiveWeapon[] = [];
  projectiles: Projectile[] = [];
  impacts: Impact[] = [];
  particles: DuelAmbientParticle[] = [];
  overlay: Record<Faction, { name: string; age: number; dur: number } | null>;
  lastWeapon: Record<Faction, WeaponId>;
  flash: Record<Faction, number>;
  hurt: Record<Faction, number>;
  ghost: Record<Faction, number>;
  charge: Record<Faction, number>;
  guard: Record<Faction, number>;
  shake = 0;
  hitStop = 0;
  elapsed = 0;
  slowmo = 0;
  /** seconds of invulnerability after taking a hit */
  iFrames = 0.22;
  status: Record<Faction, Status> = { player: newStatus(), replica: newStatus() };
  private stPlayer = { coyote: 0, buffer: 0, dropTimer: 0 };
  private stReplica = { coyote: 0, buffer: 0, dropTimer: 0 };
  private rng: () => number;
  private impactSeed = 7;

  constructor(opts: DuelOptions = {}) {
    this.player = { x: 320, y: FLOOR_Y, vx: 0, vy: 0, grounded: true, facing: 1, width: 46, height: 96, hp: 100, face: 1 };
    this.replica = { x: 960, y: FLOOR_Y, vx: 0, vy: 0, grounded: true, facing: -1, width: 46, height: 96, hp: 100, face: -1 };
    this.cooldowns = { player: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, replica: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    this.overlay = { player: null, replica: null };
    this.lastWeapon = { player: 1, replica: 1 };
    this.flash = { player: 0, replica: 0 };
    this.hurt = { player: 0, replica: 0 };
    this.ghost = { player: 0, replica: 0 };
    this.charge = { player: 0, replica: 0 };
    this.guard = { player: 0, replica: 0 };
    let s = opts.seed ?? 12345;
    this.rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    if (opts.playerSpec) {
      for (const [k, v] of Object.entries(opts.playerSpec)) {
        if (!v) continue;
        if (v.cooldown !== undefined) WEAPONS[Number(k) as WeaponId].cooldown = v.cooldown;
      }
    }
  }

  get finished(): boolean {
    return this.player.hp <= 0 || this.replica.hp <= 0;
  }

  winner(): Faction | null {
    if (this.player.hp <= 0) return 'replica';
    if (this.replica.hp <= 0) return 'player';
    return null;
  }

  // ---------------------------------------------------------------------------
  update(dtRaw: number, input: BufferedInput): void {
    this.elapsed += dtRaw;
    // hit stop + light slow motion sold through dt scaling
    let dt = dtRaw;
    if (this.hitStop > 0) {
      this.hitStop -= dtRaw;
      dt = dtRaw * 0.12;
    } else if (this.slowmo > 0) {
      this.slowmo = Math.max(0, this.slowmo - dtRaw);
      dt *= 0.55;
    }
    this.shake = Math.max(0, this.shake - dtRaw * 2.4);

    for (const f of ['player', 'replica'] as Faction[]) {
      this.flash[f] = Math.max(0, this.flash[f] - dtRaw * 5);
      this.hurt[f] = Math.max(0, this.hurt[f] - dtRaw * 3.4);
      this.ghost[f] = Math.max(0, this.ghost[f] - dtRaw * 4);
      this.charge[f] = Math.max(0, this.charge[f] - dtRaw * 3);
      this.guard[f] = Math.max(0, this.guard[f] - dtRaw * 4);
      if (this.overlay[f]) {
        this.overlay[f]!.age += dtRaw;
        if (this.overlay[f]!.age > this.overlay[f]!.dur) this.overlay[f] = null;
      }
      for (const w of [1, 2, 3, 4, 5] as WeaponId[]) {
        this.cooldowns[f][w] = Math.max(0, this.cooldowns[f][w] - dtRaw);
      }
    }

    for (const f of ['player', 'replica'] as Faction[]) tickStatus(this.status[f], dtRaw);

    // player physics -----------------------------------------------------------
    const rooted = this.status.player.root > 0;
    const inverted = this.status.player.invert > 0 ? -1 : 1;
    const pIn = {
      move: (rooted ? 0 : input.move * inverted) as -1 | 0 | 1,
      jump: input.jumpPressed,
      jumpHeld: input.jumpHeld,
      down: input.down,
    };
    const pr = stepPhysics(this.player, pIn, PLATFORM_LIST, dt, this.stPlayer, this.tuningPlayer);
    if (input.move !== 0) this.player.facing = input.move;
    this.player.face = this.player.facing;
    if (pr.jumped) this.spawnParticles(this.player.x, this.player.y, 5, '#7ff6ec', 60);
    if (pr.landed && pr.landingSpeed > 200) this.spawnParticles(this.player.x, this.player.y, 6, 'rgba(160,140,255,0.7)', 70);

    // weapon input -------------------------------------------------------------
    if (input.weapon && this.cooldowns.player[input.weapon] <= 0 && !this.active.some((a) => a.owner === 'player' && a.weapon === input.weapon)) {
      this.cast('player', input.weapon, this.replica.x - this.player.x > 0 ? 1 : -1);
    }

    this.updateActive(dt);
    this.updateProjectiles(dt);
    this.updateImpacts(dtRaw);
    this.updateParticles(dtRaw);

    this.stepReplicaAI(dt, input);

    if (Math.abs(this.player.x - this.replica.x) < 40 && this.elapsed > 1) {
      // soft push apart
      const dir = this.player.x < this.replica.x ? -1 : 1;
      this.player.x += dir * 30 * dt;
      this.replica.x -= dir * 30 * dt;
    }
  }

  // ---------------------------------------------------------------------------
  private updateActive(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      const spec = WEAPONS[a.weapon];
      a.age += dt;
      const body = a.owner === 'player' ? this.player : this.replica;
      const foe = a.owner === 'player' ? this.replica : this.player;
      const color = a.owner === 'player' ? '#9ef7ef' : '#ff9fc4';

      if (a.weapon === 2 && !a.hitDone && a.age >= spec.hitAt) {
        a.hitDone = true;
        this.projectiles.push({
          id: nextId++,
          owner: a.owner,
          x: body.x + 36 * body.facing,
          y: body.y - 64,
          vx: 760 * body.facing,
          vy: 0,
          life: 2.2,
          reflected: false,
        });
        this.charge[a.owner] = 0.9;
        this.spawnParticles(body.x + 40 * body.facing, body.y - 64, 6, color, 130);
      }

      if (a.weapon === 1 && !a.hitDone && a.age >= spec.hitAt) {
        a.hitDone = true;
        const dx = (foe.x - body.x) * body.facing;
        const dy = foe.y - body.y;
        const thisFx = a.owner === 'player' ? 'player' : 'replica';
        if (dx > -10 && dx < spec.range && Math.abs(dy) < 120) {
          this.applyHit(a.owner, foe, spec.damage, 'slash', color);
        } else {
          this.impacts.push({
            id: nextId++,
            x: body.x + 84 * body.facing,
            y: body.y - 64,
            kind: 'slash',
            age: 0,
            color,
            power: 0.6,
            owner: thisFx,
            facing: body.facing,
          });
          this.shake = Math.max(this.shake, 0.18);
        }
        this.spawnParticles(body.x + 60 * body.facing, body.y - 60, 5, color, 110);
      }

      if (a.weapon === 4 && !a.hitDone && a.age >= spec.hitAt) {
        a.hitDone = true;
        const rx = a.runeX ?? body.x + 64 * body.facing;
        const hittable = Math.abs(foe.x - rx) < 54;
        this.impacts.push({ id: nextId++, x: rx, y: FLOOR_Y - 120, kind: 'chain', age: 0, color, power: 1.4 });
        this.shake = Math.max(this.shake, 0.55);
        this.flash[a.owner] = 0.45;
        this.spawnParticles(rx, FLOOR_Y - 20, 18, color, 240);
        if (hittable) this.applyHit(a.owner, foe, spec.damage, 'chain', color);
      }

      if (a.weapon === 3) {
        this.guard[a.owner] = Math.max(this.guard[a.owner], a.age < 0.2 ? 1 : 0.4);
      }

      if (a.weapon === 5 && !a.hitDone && a.age >= spec.hitAt) {
        a.hitDone = true;
        const to = clamp(body.x + 170 * body.facing, 56, 1224);
        const blocked = Math.abs(to - foe.x) < 66;
        if (!blocked) {
          this.ghost[a.owner] = 1;
          this.impacts.push({ id: nextId++, x: body.x, y: body.y - 62, kind: 'phase', age: 0, color, power: 0.8 });
          this.impacts.push({ id: nextId++, x: to, y: body.y - 62, kind: 'phase', age: 0, color, power: 0.8 });
          body.x = to;
          this.spawnParticles(body.x, body.y - 40, 12, color, 150);
        } else {
          // blocked blink: shorter hop instead
          const shortTo = clamp(body.x + 90 * body.facing, 56, 1224);
          this.ghost[a.owner] = 0.7;
          this.impacts.push({ id: nextId++, x: body.x, y: body.y - 62, kind: 'phase', age: 0, color, power: 0.6 });
          body.x = shortTo;
        }
      }

      if (a.age >= spec.duration) this.active.splice(i, 1);
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      // sub-step so fast bolts cannot tunnel through a body
      const steps = 3;
      let consumed = false;
      for (let k = 0; k < steps && !consumed; k++) {
        pr.x += (pr.vx * dt) / steps;
        const foe = pr.owner === 'player' ? this.replica : this.player;
        const color = pr.owner === 'player' ? '#8fe9ff' : '#ff9fc4';
        if (Math.abs(pr.x - foe.x) < 42 && Math.abs(pr.y - (foe.y - 62)) < 78) {
          const def: Faction = pr.owner === 'player' ? 'replica' : 'player';
          const guarding = this.guard[def] > 0.3 && Math.abs(foe.facing) === 1;
          if (guarding && this.rng() < 0.65) {
            pr.owner = def;
            pr.vx = -pr.vx * 1.25;
            pr.life = 1.6;
            this.flash[def] = 1;
            this.shake = Math.max(this.shake, 0.55);
            this.impacts.push({ id: nextId++, x: pr.x, y: pr.y, kind: 'parry', age: 0, color: '#ffd98a', power: 1.25 });
            this.spawnParticles(pr.x, pr.y, 18, '#ffd98a', 240);
            this.hitStop = 0.07;
            consumed = true;
            break;
          }
          const victim = def === 'player' ? this.player : this.replica;
          victim.hp = Math.max(0, victim.hp - 9);
          this.flash[def] = 1;
          this.hurt[def] = 1;
          this.impacts.push({ id: nextId++, x: pr.x, y: pr.y, kind: 'bolt', age: 0, color, power: 0.95 });
          this.hitStop = 0.05;
          this.shake = Math.max(this.shake, 0.34);
          this.spawnParticles(pr.x, pr.y, 13, color, 170);
          this.overlay[def] = { name: 'hurt', age: 0, dur: 0.34 };
          if (victim.hp <= 0) {
            this.slowmo = 1.1;
            this.overlay[def] = { name: 'dead', age: 0, dur: 0.6 };
          }
          this.projectiles.splice(i, 1);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      pr.life -= dt;
      if (this.rng() < dt * 42) this.spawnParticles(pr.x, pr.y, 1, pr.owner === 'player' ? '#8fe9ff' : '#ff9fc4', 40);
      if (pr.x < 24 || pr.x > 1256 || pr.life <= 0) {
        this.impacts.push({ id: nextId++, x: pr.x, y: pr.y, kind: 'bolt', age: 0, color: pr.owner === 'player' ? '#8fe9ff' : '#ff9fc4', power: 0.65 });
        this.spawnParticles(pr.x, pr.y, 6, pr.owner === 'player' ? '#8fe9ff' : '#ff9fc4', 100);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateImpacts(dt: number): void {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const im = this.impacts[i];
      im.age += dt;
      if (im.age > 0.5) this.impacts.splice(i, 1);
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 260 * dt;
      p.vx *= 0.98;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // ---------------------------------------------------------------------------
  cast(owner: Faction, weapon: WeaponId, facing: 1 | -1): void {
    const spec = WEAPONS[weapon];
    const body = owner === 'player' ? this.player : this.replica;
    this.cooldowns[owner][weapon] = spec.cooldown;
    const ov = weapon === 1 ? 'slash' : weapon === 2 || weapon === 4 ? 'cast' : weapon === 3 ? 'guard' : 'phase';
    this.overlay[owner] = { name: ov, age: 0, dur: spec.duration };
    this.lastWeapon[owner] = weapon;
    this.charge[owner] = weapon === 2 || weapon === 4 ? 0.8 : owner === 'player' ? 0.55 : 0.4;

    const a: ActiveWeapon = {
      owner,
      weapon,
      age: 0,
      hitDone: false,
      x: body.x,
      y: body.y,
      facing,
    };
    if (weapon === 4) {
      const foe = owner === 'player' ? this.replica : this.player;
      a.runeX = clamp(foe.x + foe.vx * 0.28, 70, 1210);
      this.impacts.push({ id: nextId++, x: a.runeX, y: FLOOR_Y - 8, kind: 'trap', age: 0, color: '#b9a6ff', power: 0.3 });
    }
    if (weapon === 5) a.phaseTo = clamp(body.x + 170 * facing, 56, 1224);
    this.active.push(a);
    if (weapon === 3) this.guard[owner] = 1;
  }

  applyHit(attacker: Faction, victim: Body, damage: number, kind: 'slash' | 'chain', color: string): void {
    const v = victim as Body & { hp: number };
    if (v.hp <= 0) return;
    v.hp = Math.max(0, v.hp - damage);
    this.flash[attacker] = Math.min(1, this.flash[attacker] + 0.45);
    this.hurt[attacker === 'player' ? 'replica' : 'player'] = 1;
    this.hitStop = 0.07;
    this.shake = Math.max(this.shake, kind === 'chain' ? 0.8 : 0.55);
    const dir = attacker === 'player' ? 1 : -1;
    v.x = clamp(v.x + 26 * dir, 56, 1224);
    v.vx = 300 * dir;
    this.impacts.push({ id: nextId++, x: v.x + 20 * dir, y: v.y - 62, kind, age: 0, color, power: kind === 'chain' ? 1.5 : 1.1 });
    this.spawnParticles(v.x + 16 * dir, v.y - 62, kind === 'chain' ? 24 : 16, color, kind === 'chain' ? 260 : 200);
    this.overlay[attacker === 'player' ? 'replica' : 'player'] = { name: 'hurt', age: 0, dur: 0.34 };
    if (v.hp <= 0) {
      this.slowmo = 1.1;
      this.shake = 1;
      this.overlay[attacker === 'player' ? 'replica' : 'player'] = { name: 'dead', age: 0, dur: 0.6 };
    }
  }

  spawnParticles(x: number, y: number, n: number, color: string, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * TAU;
      const sp = speed * (0.25 + this.rng() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life: 0.3 + this.rng() * 0.45,
        max: 0.75,
        color,
        size: 1.2 + this.rng() * 2.2,
        kind: this.rng() < 0.7 ? 'spark' : 'dust',
      });
    }
  }

  // ---------------------------------------------------------------------------
  private stepReplicaAI(dt: number, playerInput: BufferedInput): void {
    const r = this.replica;
    const p = this.player;
    const dx = p.x - r.x;
    const adx = Math.abs(dx);
    const dir: 1 | -1 = dx > 0 ? 1 : -1;
    r.facing = dir;
    r.face = dir;

    // simple, evocative sparring partner (no learning here — arts build)
    let move: -1 | 0 | 1 = 0;
    let jump = false;
    let jumpHeld = false;

    if (this.finished) {
      move = 0;
    } else if (adx > 300) {
      move = dir;
    } else if (adx < 90) {
      move = -dir as -1 | 1;
    } else if (this.rng() < dt * 0.5) {
      move = this.rng() < 0.5 ? -dir as -1 | 1 : dir;
    }

    if (this.rng() < dt * (adx > 380 ? 0.3 : 0.12)) jump = true;
    jumpHeld = jump;

    if (this.cooldowns.replica[1] <= 0 && adx < 128 && Math.abs(p.y - r.y) < 80 && this.rng() < dt * 2.4) {
      this.cast('replica', 1, dir);
    } else if (this.cooldowns.replica[2] <= 0 && adx > 280 && adx < 760 && this.rng() < dt * 1.1) {
      this.cast('replica', 2, dir);
    } else if (this.cooldowns.replica[4] <= 0 && adx > 200 && this.rng() < dt * 0.45) {
      this.cast('replica', 4, dir);
    } else if (this.cooldowns.replica[3] <= 0 && playerInput.weapon === 2 && this.rng() < 0.35) {
      this.cast('replica', 3, dir);
    } else if (this.cooldowns.replica[5] <= 0 && dx < 120 && this.rng() < dt * 0.9) {
      this.cast('replica', 5, (-dir) as 1 | -1);
    }

    const pulled = this.status.replica.pull > 0;
    const rMove = (this.status.replica.root > 0 ? 0 : pulled ? (Math.sign(this.status.replica.pullX - r.x) as -1 | 0 | 1) : move) as -1 | 0 | 1;
    const rr = stepPhysics(r, { move: rMove, jump: jump && this.status.replica.root <= 0, jumpHeld, down: false }, PLATFORM_LIST, dt, this.stReplica, this.tuningReplica);
    if (rr.jumped) this.spawnParticles(r.x, r.y, 4, '#ffb9d6', 60);
    if (rr.landed && rr.landingSpeed > 200) this.spawnParticles(r.x, r.y, 5, 'rgba(255,160,200,0.6)', 60);
  }

  clearParticles(): void {
    this.particles.length = 0;
    this.impacts.length = 0;
  }

  get impactSeedValue(): number {
    return this.impactSeed++;
  }
}

// platform geometry mirrors src/gfx/arena.ts PLATFORMS; kept in sync by test.
export const PLATFORM_LIST: Platform[] = [
  { x: 148, y: FLOOR_Y - 118, w: 244, h: 16, oneWay: true },
  { x: 1280 - 392, y: FLOOR_Y - 118, w: 244, h: 16, oneWay: true },
  { x: 1280 / 2 - 152, y: FLOOR_Y - 232, w: 304, h: 16, oneWay: true },
];

export const PHYS_REF = PHYS;
