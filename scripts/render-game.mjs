/**
 * Renders the actual in-game pipeline (half-res scene + real bloom upscale) so
 * QA sees exactly what a browser player sees.
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { PlayFixture } from '../out/play.mjs';

const W = 1280, H = 720, FPS = 60;
const scene = createCanvas(W / 2, H / 2);
const sctx = scene.getContext('2d');
const bloom = createCanvas(W / 4, H / 4);
const bctx = bloom.getContext('2d');
const out = createCanvas(W, H);
const octx = out.getContext('2d');

function composite() {
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.globalCompositeOperation = 'source-over';
  bctx.globalAlpha = 1;
  bctx.filter = 'blur(2.6px) brightness(1.08) saturate(1.15)';
  bctx.drawImage(scene, 0, 0, W / 4, H / 4);
  bctx.filter = 'none';

  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.globalCompositeOperation = 'source-over';
  octx.globalAlpha = 1;
  octx.fillStyle = '#05030d';
  octx.fillRect(0, 0, W, H);
  octx.imageSmoothingEnabled = true;
  octx.drawImage(scene, 0, 0, W, H);
  octx.globalCompositeOperation = 'lighter';
  octx.globalAlpha = 0.42;
  octx.drawImage(bloom, 0, 0, W, H);
  octx.globalAlpha = 1;
  octx.globalCompositeOperation = 'source-over';
}

const fx = new PlayFixture();
const plan = [
  { t: 0.2, move: 1 }, { t: 1.0, jumpPressed: true }, { t: 1.05, jumpHeld: true },
  { t: 1.4, jumpHeld: false, jumpPressed: false, move: 1 },
  { t: 1.9, move: 0, weapon: 2 }, { t: 2.55, weapon: 1 }, { t: 3.15, weapon: 4 },
  { t: 4.85, weapon: 5 }, { t: 5.55, weapon: 3 }, { t: 6.3, move: 1 },
];
let move = 0, jumpPressed = false, jumpHeld = false, weapon = null, pi = 0;
const beats = [1.1, 2.06, 2.72, 3.6, 4.95, 5.95, 7.4, 8.6];
const goals = beats.map((t) => Math.round(t * FPS));
const last = goals[goals.length - 1];
const shots = new Map();
for (let f = 0; f <= last; f++) {
  const t = f / FPS;
  while (pi < plan.length && t >= plan[pi].t) {
    const p = plan[pi++];
    if (p.move !== undefined) move = p.move;
    if (p.jumpPressed !== undefined) jumpPressed = p.jumpPressed;
    if (p.jumpHeld !== undefined) jumpHeld = p.jumpHeld;
    if (p.weapon) { weapon = p.weapon; fx.weapon = p.weapon; }
  }
  const gi = goals.indexOf(f);
  if (gi >= 0) {
    sctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    sctx.fillStyle = '#05030d';
    sctx.fillRect(0, 0, W, H);
    fx.render(sctx);
    composite();
    const one = createCanvas(W, H);
    one.getContext('2d').drawImage(out, 0, 0);
    shots.set(beats[gi], one);
  }
  fx.step(1 / FPS, { move, jumpPressed, jumpHeld, down: false, weapon });
  weapon = null; jumpPressed = false;
}
await mkdir('out/crops', { recursive: true });
const sheet = createCanvas(W / 2 * 2, H / 2 * 4);
const sh = sheet.getContext('2d');
sh.fillStyle = '#000'; sh.fillRect(0, 0, sheet.width, sheet.height);
beats.forEach((t, i) => {
  const c = shots.get(t);
  const gx = (i % 2) * W / 2, gy = Math.floor(i / 2) * H / 2;
  sh.drawImage(c, gx, gy, W / 2, H / 2);
  sh.fillStyle = 'rgba(255,255,255,0.85)'; sh.font = '12px sans-serif'; sh.fillText(t.toFixed(2) + 's', gx + 6, gy + 14);
});
await writeFile('out/crops/game-bloom.png', sheet.toBuffer('image/png'));
// full-res single hero frame with bloom
const hero = shots.get(3.6);
await writeFile('out/crops/hero-bloom.png', hero.toBuffer('image/png'));
console.log('wrote game-bloom.png');
