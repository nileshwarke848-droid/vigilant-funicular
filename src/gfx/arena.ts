import type { GfxCtx } from './ctx';
import { FLOOR_Y, glowDisc, PALETTE, VIEW_H, VIEW_W } from './ctx';
import { clamp01, lerp, mulberry32, pulse, TAU } from './math';

export interface PlatformRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** one-way pass-through from below */
  oneWay: boolean;
}

export const PLATFORMS: PlatformRect[] = [
  { x: -40, y: FLOOR_Y, w: VIEW_W + 80, h: VIEW_H - FLOOR_Y + 40, oneWay: false },
  // mid shelves flanking the pit
  // side shelves: reachable with a single jump from the floor (~150px apex)
  { x: 148, y: FLOOR_Y - 118, w: 244, h: 16, oneWay: true },
  { x: VIEW_W - 392, y: FLOOR_Y - 118, w: 244, h: 16, oneWay: true },
  // high lintel: only reachable by jumping from a side shelf
  { x: VIEW_W / 2 - 152, y: FLOOR_Y - 232, w: 304, h: 16, oneWay: true },
];

/** Thin glow seams hiding trap tiles (aligned to the ground + platforms). */
export interface TrapSeam {
  x: number;
  y: number;
  w: number;
  index: number;
}

export const TRAP_SEAMS: TrapSeam[] = [
  { x: 244, y: FLOOR_Y, w: 80, index: 0 },
  { x: 610, y: FLOOR_Y, w: 88, index: 1 },
  { x: 962, y: FLOOR_Y, w: 80, index: 2 },
  { x: 210, y: FLOOR_Y - 118, w: 74, index: 3 },
  { x: VIEW_W - 296, y: FLOOR_Y - 118, w: 74, index: 4 },
  { x: VIEW_W / 2 - 50, y: FLOOR_Y - 232, w: 100, index: 5 },
];

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
}

interface Ambush {
  x: number;
  y: number;
  h: number;
  seed: number;
}

const stars: Star[] = (() => {
  const rnd = mulberry32(1337);
  const out: Star[] = [];
  for (let i = 0; i < 170; i++) {
    out.push({
      x: rnd() * VIEW_W,
      y: rnd() * (FLOOR_Y - 80),
      r: 0.4 + rnd() * 1.5,
      a: 0.15 + rnd() * 0.7,
      tw: rnd() * TAU,
    });
  }
  return out;
})();

const skyline: Ambush[] = (() => {
  const rnd = mulberry32(90210);
  const out: Ambush[] = [];
  let x = -60;
  while (x < VIEW_W + 60) {
    const w = 26 + rnd() * 66;
    const h = 80 + rnd() * 300;
    out.push({ x, y: FLOOR_Y, h, seed: rnd() * 10 });
    x += w + 6 + rnd() * 26;
  }
  return out;
})();

const pillars = [130, 430, 760, 1112];

const dust: Array<{ x: number; y: number; s: number; v: number; ph: number }> = (() => {
  const rnd = mulberry32(4242);
  const out = [];
  for (let i = 0; i < 46; i++) {
    out.push({
      x: rnd() * VIEW_W,
      y: 60 + rnd() * (FLOOR_Y - 40),
      s: 0.6 + rnd() * 1.8,
      v: 4 + rnd() * 14,
      ph: rnd() * TAU,
    });
  }
  return out;
})();

/** Background layers. `par` 0..1 is the parallax factor from fighter camera drift. */
export function drawBackdrop(ctx: GfxCtx, t: number, par: number): void {
  // deep sky
  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  sky.addColorStop(0, '#05030d');
  sky.addColorStop(0.5, '#0a0620');
  sky.addColorStop(1, '#120a2c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // dual nebula wash, one per faction
  const neb1 = ctx.createRadialGradient(270, 300, 10, 270, 300, 560);
  neb1.addColorStop(0, 'rgba(30,190,180,0.16)');
  neb1.addColorStop(1, 'rgba(0,0,0,0)');
  const neb2 = ctx.createRadialGradient(1010, 250, 10, 1010, 250, 620);
  neb2.addColorStop(0, 'rgba(210,40,120,0.14)');
  neb2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = neb1;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = neb2;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // stars
  for (const s of stars) {
    const a = s.a * (0.55 + 0.45 * Math.sin(t * 1.4 + s.tw));
    ctx.globalAlpha = a;
    ctx.fillStyle = '#dfe8ff';
    ctx.beginPath();
    ctx.arc(s.x - par * 10, s.y, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // enormous moon/crown behind the arena
  glowDisc(ctx, VIEW_W * 0.5, 268, 300, 'rgba(120,90,220,0.16)', 'rgba(60,40,140,0.08)', 1);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(VIEW_W * 0.5, 318, 138, 0, TAU);
  const moon = ctx.createRadialGradient(VIEW_W * 0.5 - 40, 280, 8, VIEW_W * 0.5, 318, 150);
  moon.addColorStop(0, 'rgba(210,196,255,0.28)');
  moon.addColorStop(0.7, 'rgba(120,96,210,0.16)');
  moon.addColorStop(1, 'rgba(40,24,90,0.0)');
  ctx.fillStyle = moon;
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,170,255,0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // far skyline
  const kl = ctx.createLinearGradient(0, FLOOR_Y - 330, 0, FLOOR_Y);
  kl.addColorStop(0, 'rgba(16,10,38,0.86)');
  kl.addColorStop(1, 'rgba(9,6,24,0.96)');
  ctx.fillStyle = kl;
  for (const b of skyline) {
    const bx = b.x - par * 34;
    ctx.fillRect(bx, b.y - b.h, 46 + (b.seed % 3) * 18, b.h);
  }
  // distant windows
  const rnd = mulberry32(777);
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (const b of skyline) {
    for (let i = 0; i < 7; i++) {
      const wx = b.x - par * 34 + 8 + rnd() * 34;
      const wy = b.y - b.h + 18 + rnd() * (b.h - 30);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(83,245,228,0.16)' : 'rgba(255,79,154,0.12)';
      ctx.fillRect(wx, wy, 3, 5);
    }
  }
  ctx.restore();

  // arena pillars with banners
  for (let i = 0; i < pillars.length; i++) {
    const px = pillars[i] - par * 16;
    const top = 96 + (i % 2) * 22;
    const g = ctx.createLinearGradient(px, 0, px + 30, 0);
    g.addColorStop(0, 'rgba(22,16,46,0.9)');
    g.addColorStop(0.5, 'rgba(34,24,68,0.9)');
    g.addColorStop(1, 'rgba(16,10,36,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(px, top, 30, FLOOR_Y - top);
    ctx.strokeStyle = 'rgba(120,90,220,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, top + 0.5, 29, FLOOR_Y - top);

    // glowing rune band
    ctx.fillStyle = i % 2 === 0 ? 'rgba(83,245,228,0.22)' : 'rgba(255,79,154,0.2)';
    ctx.fillRect(px + 4, top + 40 + (i % 2) * 60, 22, 3);

    // banner
    const bx = px + 6;
    const bannerH = 120 + (i % 2) * 50;
    const ban = ctx.createLinearGradient(bx, top + 20, bx, top + 20 + bannerH);
    ban.addColorStop(0, i % 2 === 0 ? 'rgba(26,120,116,0.5)' : 'rgba(120,26,70,0.5)');
    ban.addColorStop(1, 'rgba(10,6,24,0.1)');
    ctx.fillStyle = ban;
    ctx.beginPath();
    ctx.moveTo(bx, top + 20);
    ctx.lineTo(bx + 18, top + 20);
    ctx.lineTo(bx + 18, top + 20 + bannerH);
    ctx.lineTo(bx + 9, top + 20 + bannerH - 14);
    ctx.lineTo(bx, top + 20 + bannerH);
    ctx.closePath();
    ctx.fill();
  }

  // light shafts
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const sx = 300 + i * 340;
    const sway = Math.sin(t * 0.35 + i * 1.7) * 26;
    const beam = ctx.createLinearGradient(sx, 0, sx + sway, FLOOR_Y);
    beam.addColorStop(0, i === 1 ? 'rgba(255,79,154,0.09)' : 'rgba(83,245,228,0.08)');
    beam.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(sx - 30, 0);
    ctx.lineTo(sx + 30, 0);
    ctx.lineTo(sx + sway + 150, FLOOR_Y);
    ctx.lineTo(sx + sway - 150, FLOOR_Y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // aurora ribbons
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const y0 = 150 + i * 62;
    const amp = 26 + i * 12;
    ctx.beginPath();
    ctx.moveTo(-60, y0);
    for (let x = -60; x <= VIEW_W + 60; x += 40) {
      const yy = y0 + Math.sin(x * 0.006 + t * (0.13 + i * 0.05) + i * 1.8) * amp;
      ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = i === 0 ? 'rgba(83,245,228,0.028)' : i === 1 ? 'rgba(255,79,154,0.022)' : 'rgba(184,166,255,0.026)';
    ctx.lineWidth = 22 + i * 10;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();

  // slow fog bank over the stage lip
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const fx = ((t * (7 + i * 3) + i * 420) % (VIEW_W + 700)) - 350;
    const fy = FLOOR_Y - 40 - i * 6;
    const fog = ctx.createRadialGradient(fx, fy, 4, fx, fy, 230 + i * 30);
    fog.addColorStop(0, i % 2 === 0 ? 'rgba(70,110,140,0.035)' : 'rgba(110,70,140,0.035)');
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(fx - 280, fy - 90, 560, 180);
  }
  ctx.restore();

  // ember motes
  for (const d of dust) {
    const y = ((d.y - t * d.v) % (FLOOR_Y - 20) + FLOOR_Y - 20) % (FLOOR_Y - 20) + 20;
    const x = d.x + Math.sin(t * 0.6 + d.ph) * 14;
    ctx.globalAlpha = 0.18 + 0.14 * Math.sin(t * 2 + d.ph);
    ctx.fillStyle = d.ph % 2 > 1 ? PALETTE.player : PALETTE.replica;
    ctx.beginPath();
    ctx.arc(x, y, d.s, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // floor haze
  const haze = ctx.createLinearGradient(0, FLOOR_Y - 150, 0, FLOOR_Y);
  haze.addColorStop(0, 'rgba(18,10,44,0)');
  haze.addColorStop(1, 'rgba(24,12,54,0.55)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, FLOOR_Y - 150, VIEW_W, 150);

  // warm practicals washing the stage
  const wash = ctx.createLinearGradient(0, FLOOR_Y - 260, 0, FLOOR_Y + 40);
  wash.addColorStop(0, 'rgba(255,180,110,0)');
  wash.addColorStop(0.7, 'rgba(255,170,120,0.05)');
  wash.addColorStop(1, 'rgba(255,150,100,0.09)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, FLOOR_Y - 260, VIEW_W, 300);
}

/** Draw the arena geometry, including trap seams. */
export function drawArena(ctx: GfxCtx, t: number, seamsLit: number[]): void {
  const floorTop = FLOOR_Y;

  // --- floor slab ----------------------------------------------------------
  const stone = ctx.createLinearGradient(0, floorTop, 0, VIEW_H);
  stone.addColorStop(0, '#4b3d6d');
  stone.addColorStop(0.08, '#332a52');
  stone.addColorStop(0.35, '#221b3b');
  stone.addColorStop(1, '#0a0817');
  ctx.fillStyle = stone;
  ctx.fillRect(-40, floorTop, VIEW_W + 80, VIEW_H - floorTop + 40);

  // flagstone grid
  ctx.save();
  ctx.strokeStyle = 'rgba(10,8,22,0.55)';
  ctx.lineWidth = 1.2;
  for (let row = 0; row < 4; row++) {
    const y = floorTop + 10 + row * 12;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.lineTo(VIEW_W + 40, y);
    ctx.stroke();
    const off = row % 2 === 0 ? 0 : 46;
    for (let x = -20 + off; x < VIEW_W + 40; x += 92) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 12);
      ctx.stroke();
    }
  }
  ctx.restore();

  // top rim, thick and bright so the stage line reads at a glance
  const lip = ctx.createLinearGradient(0, floorTop - 2, 0, floorTop + 12);
  lip.addColorStop(0, 'rgba(214,199,255,0.95)');
  lip.addColorStop(0.55, 'rgba(150,128,235,0.5)');
  lip.addColorStop(1, 'rgba(120,100,200,0)');
  ctx.fillStyle = lip;
  ctx.fillRect(-40, floorTop - 2, VIEW_W + 80, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(-40, floorTop - 1.5, VIEW_W + 80, 2.5);

  // wet sheen streaks on the slab
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = 90 + i * 268;
    const g = ctx.createLinearGradient(x, floorTop + 4, x + 60, VIEW_H);
    g.addColorStop(0, 'rgba(150,130,240,0.16)');
    g.addColorStop(1, 'rgba(150,130,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, floorTop + 3);
    ctx.lineTo(x + 26, floorTop + 3);
    ctx.lineTo(x + 76, VIEW_H);
    ctx.lineTo(x + 40, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // trap seams on main floor
  for (const s of TRAP_SEAMS) {
    if (s.y !== FLOOR_Y) continue;
    drawSeam(ctx, s.x, s.y, s.w, seamsLit[s.index] ?? 0, t, s.index);
  }

  // --- platforms -----------------------------------------------------------
  for (let i = 1; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i];
    drawPlatform(ctx, p, t);
    for (const s of TRAP_SEAMS) {
      if (s.y === p.y && s.x >= p.x - 2 && s.x <= p.x + p.w + 2) {
        drawSeam(ctx, s.x, s.y, s.w, seamsLit[s.index] ?? 0, t, s.index);
      }
    }
  }

  // braces under the shelves
  ctx.strokeStyle = 'rgba(74,56,124,0.55)';
  ctx.lineWidth = 5;
  for (let i = 1; i < PLATFORMS.length; i++) {
    const p = PLATFORMS[i];
    for (const bx of [p.x + 30, p.x + p.w - 30]) {
      ctx.beginPath();
      ctx.moveTo(bx, p.y + p.h);
      ctx.lineTo(bx, p.y + p.h + 30);
      ctx.lineTo(bx + (bx < VIEW_W / 2 ? -26 : 26), p.y + p.h + 70);
      ctx.stroke();
    }
  }

  // --- braziers: warm practicals that give the stage depth -----------------
  drawBrazier(ctx, 96, FLOOR_Y, t, 0.9);
  drawBrazier(ctx, VIEW_W - 96, FLOOR_Y, t, 2.1);
  drawBrazier(ctx, PLATFORMS[3].x + 20, PLATFORMS[3].y, t, 3.4);
  drawBrazier(ctx, PLATFORMS[3].x + PLATFORMS[3].w - 20, PLATFORMS[3].y, t, 4.9);
}

function drawBrazier(ctx: GfxCtx, x: number, y: number, t: number, seed: number): void {
  const flick = 0.75 + 0.25 * Math.sin(t * 9 + seed * 3) + 0.12 * Math.sin(t * 23 + seed);
  ctx.save();
  // post
  ctx.strokeStyle = 'rgba(30,24,52,1)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 54);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,72,140,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 1.5, y);
  ctx.lineTo(x - 1.5, y - 52);
  ctx.stroke();
  // bowl
  ctx.beginPath();
  ctx.moveTo(x - 17, y - 58);
  ctx.lineTo(x + 17, y - 58);
  ctx.lineTo(x + 10, y - 44);
  ctx.lineTo(x - 10, y - 44);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, y - 60, 0, y - 44);
  bg.addColorStop(0, 'rgba(70,56,110,1)');
  bg.addColorStop(1, 'rgba(26,20,46,1)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,209,120,0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // flame
  const fh = 30 * flick + 16;
  const fg = ctx.createLinearGradient(0, y - 58, 0, y - 58 - fh);
  fg.addColorStop(0, 'rgba(255,225,160,0.95)');
  fg.addColorStop(0.45, 'rgba(255,170,80,0.75)');
  fg.addColorStop(1, 'rgba(255,110,60,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(x - 11, y - 58);
  ctx.quadraticCurveTo(x - 6, y - 58 - fh * 0.5, x, y - 58 - fh);
  ctx.quadraticCurveTo(x + 6, y - 58 - fh * 0.5, x + 11, y - 58);
  ctx.closePath();
  ctx.fill();
  // light pool
  ctx.globalCompositeOperation = 'lighter';
  glowDisc(ctx, x, y - 62, 190 * flick, 'rgba(255,190,120,0.22)', 'rgba(255,150,70,0)', 1);
  ctx.restore();
}

function drawPlatform(ctx: GfxCtx, p: PlatformRect, t: number): void {
  const thick = 22;
  // body
  const g = ctx.createLinearGradient(0, p.y, 0, p.y + thick);
  g.addColorStop(0, 'rgba(88,70,132,0.99)');
  g.addColorStop(0.35, 'rgba(50,39,86,0.98)');
  g.addColorStop(1, 'rgba(16,12,32,0.9)');
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + p.w, p.y);
  ctx.lineTo(p.x + p.w - 8, p.y + thick);
  ctx.lineTo(p.x + 8, p.y + thick);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(8,6,18,0.9)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // lit lip
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(p.x + 2, p.y, p.w - 4, 2);
  ctx.fillStyle = 'rgba(170,148,255,0.5)';
  ctx.fillRect(p.x + 3, p.y + 2, p.w - 6, 2);

  // rune strip underneath
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = 'rgba(83,245,228,0.55)';
  ctx.lineWidth = 1.2;
  for (let x = p.x + 22; x < p.x + p.w - 18; x += 26) {
    const a = 0.12 + 0.14 * pulse(t, 3.2, x * 0.01);
    ctx.globalAlpha = a * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, p.y + thick - 8);
    ctx.lineTo(x + 5, p.y + thick - 3);
    ctx.lineTo(x, p.y + thick + 2);
    ctx.lineTo(x - 5, p.y + thick - 3);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  // drip glints
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 2 + p.x);
  ctx.fillStyle = '#cfe6ff';
  for (let i = 0; i < 3; i++) {
    const x = p.x + 30 + i * (p.w - 60) / 2;
    ctx.fillRect(x, p.y + thick + 2 + (i % 2) * 3, 1.6, 4 + (i % 2) * 4);
  }
  ctx.restore();
}

/** A hairline seam — the only hint a trap tile exists. `lit` 0..1 after reveal. */
function drawSeam(ctx: GfxCtx, x: number, y: number, w: number, lit: number, t: number, index: number): void {
  const base = 0.16 + 0.08 * pulse(t, 5.5, index * 0.37);
  ctx.save();
  ctx.globalAlpha = base + lit * 0.5;
  ctx.strokeStyle = lit > 0.02 ? PALETTE.gold : 'rgba(160,140,255,0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 0.5);
  ctx.lineTo(x + w, y + 0.5);
  ctx.stroke();

  // corner ticks
  ctx.beginPath();
  ctx.moveTo(x, y + 2);
  ctx.lineTo(x, y + 7);
  ctx.moveTo(x + w, y + 2);
  ctx.lineTo(x + w, y + 7);
  ctx.stroke();
  ctx.restore();

  if (lit > 0.02) {
    glowDisc(ctx, x + w / 2, y + 4, w * 0.6, 'rgba(255,209,120,0.5)', 'rgba(255,160,60,0)', lit * 0.35);
  }
}

// ---------------------------------------------------------------------------
// FX primitives used by fighters, weapons and the demo director.
// ---------------------------------------------------------------------------

export function drawSlashArc(
  ctx: GfxCtx,
  x: number,
  y: number,
  facing: number,
  prog: number,
  scale: number,
  color: string,
): void {
  const p = clamp01(prog);
  const a0 = lerp(-2.5, -0.35, Math.min(1, p * 1.9)) + (facing < 0 ? Math.PI : 0);
  const sweep = lerp(2.6, 0.55, p) * facing;
  const r = scale * 1.22;
  const alpha = (1 - p) * (p < 0.15 ? p / 0.15 : 1);
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 3; i++) {
    const rr = r - i * scale * 0.11;
    ctx.beginPath();
    if (facing > 0) ctx.arc(0, 0, rr, a0 + i * 0.09 * facing, a0 + sweep, false);
    else ctx.arc(0, 0, rr, a0 + sweep, a0 + i * 0.09 * facing, false);
    ctx.strokeStyle = i === 0 ? color : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = Math.max(1, scale * (0.16 - i * 0.045) * (1 - p * 0.4));
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  // sparks at the lead edge
  const leadA = a0 + sweep;
  const leadX = Math.cos(leadA) * r;
  const leadY = Math.sin(leadA) * r;
  glowDisc(ctx, leadX, leadY, scale * 0.3, 'rgba(255,255,255,0.9)', color, alpha * 0.7);
  ctx.restore();
}

export function drawBolt(ctx: GfxCtx, x: number, y: number, t: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  const flick = 0.85 + 0.15 * Math.sin(t * 44);
  glowDisc(ctx, 0, 0, 26 * flick, 'rgba(255,255,255,0.95)', color, 0.9);
  ctx.beginPath();
  ctx.arc(0, 0, 7 * flick, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  // tail
  const g = ctx.createLinearGradient(-34, 0, 0, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-38, -5);
  ctx.lineTo(0, -8);
  ctx.lineTo(0, 8);
  ctx.lineTo(-38, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawChainRune(ctx: GfxCtx, x: number, yTop: number, h: number, prog: number, t: number, color: string): void {
  const p = clamp01(prog);
  ctx.save();
  // charge rune on the floor
  const r = 34;
  ctx.beginPath();
  ctx.ellipse(x, yTop, r, r * 0.28, 0, 0, TAU);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35 + 0.5 * Math.sin(p * Math.PI);
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = t * 2.2 + (i / 4) * TAU;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.72, yTop + Math.sin(a) * r * 0.2, 3, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  }
  // strike
  if (p > 0.86) {
    const k = (p - 0.86) / 0.14;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    let yy = yTop;
    let xx = x;
    ctx.moveTo(xx, yy);
    while (yy > yTop - h) {
      yy -= 22 * (0.6 + Math.random());
      xx = x + (Math.random() - 0.5) * 20 * (1 - k * 0.5);
      ctx.lineTo(xx, yy);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 5 + 6 * (1 - k);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();
    glowDisc(ctx, x, yTop - 4, 60, 'rgba(255,255,255,0.8)', color, 1 - k);
  }
  ctx.restore();
}

export function drawGuardWard(ctx: GfxCtx, x: number, y: number, r: number, t: number, alpha: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.rotate(t * 1.6);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * TAU;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r * 1.15;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawPhaseTrail(ctx: GfxCtx, x0: number, x1: number, y: number, prog: number, color: string): void {
  const p = clamp01(prog);
  const alpha = (1 - p) * 0.75;
  if (alpha < 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(x0, y, x1, y);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, color);
  ctx.strokeStyle = g;
  ctx.lineWidth = 10 * (1 - p * 0.6);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const u = i / 5;
    const px = lerp(x0, x1, u);
    ctx.globalAlpha = alpha * (1 - u) * 0.8;
    ctx.beginPath();
    ctx.arc(px, y + Math.sin(u * 9 + p * 6) * 14, 2.4, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }
  ctx.restore();
}

/** Impact burst: expanding ring + shards. */
export function drawBurst(ctx: GfxCtx, x: number, y: number, prog: number, color: string, power = 1): void {
  const p = clamp01(prog);
  const alpha = 1 - p;
  ctx.save();
  ctx.globalAlpha = alpha;
  const r = lerp(6, 54 * power, p);
  ctx.strokeStyle = color;
  ctx.lineWidth = lerp(5, 0.5, p);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = lerp(2, 0.3, p);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, TAU);
  ctx.stroke();
  const rnd = mulberry32(Math.floor(x * 13 + y * 7 + 1));
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU;
    const d = r * (0.5 + rnd() * 0.9);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.2 * (1 - p), 0, TAU);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.9)' : color;
    ctx.fill();
  }
  glowDisc(ctx, x, y, r * 0.9, 'rgba(255,255,255,0.55)', color, alpha * 0.5);
  ctx.restore();
}

export function drawHitSparkLine(ctx: GfxCtx, x: number, y: number, angle: number, len: number, prog: number, color: string): void {
  const p = clamp01(prog);
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3 * (1 - p);
  ctx.beginPath();
  ctx.moveTo(-len * 0.5 * (1 - p), 0);
  ctx.lineTo(len * 0.5 * (1 + p), 0);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 7 * (1 - p) * 0.4;
  ctx.stroke();
  ctx.restore();
}

export function drawTrapTelegraph(
  ctx: GfxCtx,
  seam: TrapSeam,
  prog: number,
  kind: number,
  color: string,
): void {
  const p = clamp01(prog);
  const y = seam.y;
  const cx = seam.x + seam.w / 2;
  ctx.save();
  ctx.globalAlpha = 0.4 + 0.6 * Math.sin(p * Math.PI);
  const w = seam.w * (0.4 + p * 0.6);
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, y, w, 3, 2);
  ctx.fillStyle = color;
  ctx.fill();

  if (kind === 1) {
    // flare shimmer
    const g = ctx.createLinearGradient(0, y, 0, y - 90);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha *= 0.35;
    ctx.fillStyle = g;
    ctx.fillRect(cx - w / 2, y - 90, w, 90);
  } else if (kind === 3) {
    // gravity ring
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha *= 0.8;
    ctx.beginPath();
    ctx.ellipse(cx, y, 70 * p, 20 * p, 0, 0, TAU);
    ctx.stroke();
  } else if (kind === 5) {
    // hex glyph
    ctx.translate(cx, y - 6);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * TAU + p;
      const px = Math.cos(a) * 16;
      const py = Math.sin(a) * 16;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawVignette(ctx: GfxCtx, warn: number): void {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.86);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (warn > 0.01) {
    const r = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.8);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, `rgba(255,40,90,${0.28 * warn})`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

export function drawScanlines(ctx: GfxCtx): void {
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let y = 0; y < VIEW_H; y += 3) ctx.fillRect(0, y, VIEW_W, 1);
  ctx.restore();
}
