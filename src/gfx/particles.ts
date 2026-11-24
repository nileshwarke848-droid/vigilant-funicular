import type { GfxCtx } from './ctx';
import { glowDisc } from './ctx';
import { clamp01, TAU } from './math';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  drag: number;
  gravity: number;
  color: string;
  /** 0 spark dot, 1 streak, 2 smoke puff */
  kind: 0 | 1 | 2;
}

const CAP = 420;

export class Particles {
  readonly pool: Particle[] = [];

  constructor() {
    for (let i = 0; i < CAP; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        drag: 0.9,
        gravity: 0,
        color: '#fff',
        kind: 0,
      });
    }
  }

  spawn(p: Omit<Particle, 'active' | 'life' | 'maxLife'> & { life: number }): void {
    for (const slot of this.pool) {
      if (!slot.active) {
        slot.active = true;
        slot.x = p.x;
        slot.y = p.y;
        slot.vx = p.vx;
        slot.vy = p.vy;
        slot.life = p.life;
        slot.maxLife = p.life;
        slot.size = p.size;
        slot.drag = p.drag;
        slot.gravity = p.gravity;
        slot.color = p.color;
        slot.kind = p.kind;
        return;
      }
    }
  }

  burst(opts: {
    x: number;
    y: number;
    count: number;
    color: string;
    speed: number;
    spread?: number;
    angle?: number;
    life?: number;
    size?: number;
    gravity?: number;
    kind?: 0 | 1 | 2;
  }): void {
    const spread = opts.spread ?? TAU;
    const base = opts.angle ?? 0;
    for (let i = 0; i < opts.count; i++) {
      const a = base + (Math.random() - 0.5) * spread;
      const sp = opts.speed * (0.35 + Math.random() * 0.9);
      this.spawn({
        x: opts.x,
        y: opts.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8),
        size: (opts.size ?? 2.5) * (0.5 + Math.random()),
        drag: 0.86,
        gravity: opts.gravity ?? 0,
        color: opts.color,
        kind: opts.kind ?? 0,
      });
    }
  }

  dust(x: number, y: number, count: number, color: string, power = 1): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 26 * power,
        y: y - Math.random() * 4,
        vx: (Math.random() - 0.5) * 80 * power,
        vy: -Math.random() * 40 * power,
        life: 0.35 + Math.random() * 0.4,
        size: 2 + Math.random() * 3.4 * power,
        drag: 0.9,
        gravity: 30,
        color,
        kind: 2,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravity * dt;
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: GfxCtx): void {
    ctx.save();
    for (const p of this.pool) {
      if (!p.active) continue;
      const k = clamp01(p.life / p.maxLife);
      if (p.kind === 2) {
        ctx.globalAlpha = k * 0.35;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2.4 - k * 1.2), 0, TAU);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else if (p.kind === 1) {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.7);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else {
        ctx.globalAlpha = k;
        if (p.size > 2.4) {
          glowDisc(ctx, p.x, p.y, p.size * 2.6 * k + 1, p.color, p.color, k);
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
  }
}
