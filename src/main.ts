import './styles.css';
import { createBloomPipeline, VIEW_H, VIEW_W, type GfxCtx, type BloomPipeline } from './gfx/ctx';
import { Duel, type BufferedInput } from './game/duel';
import { KeyboardInput } from './game/input';
import { WEAPON_ORDER } from './game/weapons';
import type { WeaponId } from './gfx/character';
import { makePoseState, renderDuel, syncPose, type FighterPoseState } from './gfx/render-duel';
import { checkTraps, rollLayout, applyTrapEvent, type Trap } from './game/traps';
import { TRAP_SEAMS } from './gfx/arena';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;

let renderScale = 1;
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const targetAspect = VIEW_W / VIEW_H;
  let w = vw;
  let h = vw / targetAspect;
  if (h > vh) {
    h = vh;
    w = vh * targetAspect;
  }
  const cssW = Math.floor(w);
  const cssH = Math.floor(h);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  renderScale = canvas.width / VIEW_W;
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);
resize();

const keyboard = new KeyboardInput();
keyboard.attach(window);

// ---------------------------------------------------------------------------
// Bloom pipeline: simulate + draw in a half-res buffer, upscale with glow.
// ---------------------------------------------------------------------------
const pipe: BloomPipeline = createBloomPipeline((w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const context = c.getContext('2d') as unknown as GfxCtx;
  return { canvas: c as never, ctx: context };
});

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
let generation = 1;
let duel = new Duel({ seed: 991 });
let traps: Trap[] = rollLayout(TRAP_SEAMS, 0x5eed);
let time = 0;
let titleIn = 0;
let hint = 0;
let paused = false;
let selectedNode: WeaponId = 1;
let last = performance.now();
let acc = 0;
let deathHold = 0;
const playerPose: FighterPoseState = makePoseState('player', 320, 604, 1);
const replicaPose: FighterPoseState = makePoseState('replica', 960, 604, -1);
const FIXED = 1 / 120;

function restart(): void {
  duel = new Duel({ seed: 991 + generation * 17 });
  playerPose.overlay = null;
  replicaPose.overlay = null;
  deathHold = 0;
  acc = 0;
}

function nextGeneration(): void {
  generation += 1;
  traps = rollLayout(TRAP_SEAMS, 0x5eed ^ (generation * 2654435761));
  duel = new Duel({ seed: 991 + generation * 17 });
  deathHold = 0;
  acc = 0;
}

function syncOverlay(s: FighterPoseState, ov: { name: string; age: number; dur: number } | null): void {
  s.overlay = ov ? { name: ov.name, age: ov.age, dur: ov.dur } : null;
}

function frame(now: number): void {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  time += dt;
  if (titleIn < 1) titleIn = Math.min(1, titleIn + dt / 2.4);
  else if (hint < 1) hint = Math.min(1, hint + dt / 3.4);

  const input = keyboard.read();
  if (input.pause) paused = !paused;
  if (input.restart) restart();
  if (input.weapon) selectedNode = input.weapon;

  if (!paused) {
    if (duel.finished) {
      deathHold += dt;
      if (deathHold > 2.2) nextGeneration();
    } else {
      const buffered: BufferedInput = {
        move: input.move,
        jumpPressed: input.jumpPressed,
        jumpHeld: input.jump,
        down: input.down,
        weapon: input.weapon,
      };
      acc += dt;
      let steps = 0;
      while (acc >= FIXED && steps < 10) {
        duel.update(FIXED, steps === 0 ? buffered : { ...buffered, weapon: null, jumpPressed: false });
        acc -= FIXED;
        steps += 1;
      }
      const ev = checkTraps(traps, { player: duel.player, replica: duel.replica }, dt);
      for (const e of ev.events) {
        const victim = e.victim === 'player' ? duel.player : duel.replica;
        applyTrapEvent(e, victim, duel.status[e.victim]);
        duel.shake = Math.max(duel.shake, 0.75);
        duel.spawnParticles(e.x, e.y - 20, 18, '#ffd178', 210);
        duel.impacts.push({
          id: 900000 + e.index,
          x: e.x,
          y: e.y - 30,
          kind: 'trap',
          age: 0,
          color: '#ffd178',
          power: 1.1,
        });
      }
      syncOverlay(playerPose, duel.overlay.player);
      syncOverlay(replicaPose, duel.overlay.replica);
      playerPose.charge = duel.charge.player;
      replicaPose.charge = duel.charge.replica;
      playerPose.guard = duel.guard.player;
      replicaPose.guard = duel.guard.replica;
      playerPose.hurt = duel.hurt.player;
      replicaPose.hurt = duel.hurt.replica;
      playerPose.ghost = duel.ghost.player;
      replicaPose.ghost = duel.ghost.replica;
    }
    playerPose.weapon = selectedNode;
    replicaPose.weapon = duel.lastWeapon.replica;
    syncPose(playerPose, duel.player, dt);
    syncPose(replicaPose, duel.replica, dt);
  }

  // ---- render into the half-res scene buffer -----------------------------
  const sc = pipe.sceneCtx;
  sc.setTransform(0.5, 0, 0, 0.5, 0, 0);
  renderDuel(sc, {
    duel,
    player: playerPose,
    replica: replicaPose,
    traps,
    time,
    generation,
    titleIn,
    paused,
    hint,
    arenaFlash: 0,
  });

  // ---- composite with bloom, then HUD at full res ------------------------
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05030d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;

  const b = pipe.bloomCtx;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-over';
  b.globalAlpha = 1;
  b.filter = 'blur(2.6px) brightness(1.08) saturate(1.15)';
  b.drawImage(pipe.scene, 0, 0, pipe.bloomW, pipe.bloomH);
  b.filter = 'none';

  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(pipe.scene, 0, 0, VIEW_W, VIEW_H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.42;
  ctx.drawImage(pipe.bloom, 0, 0, VIEW_W, VIEW_H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// dev handle (never referenced by gameplay)
Object.defineProperty(window, '__replica', {
  configurable: true,
  get: () => ({ duel, traps, generation, WEAPON_ORDER }),
});
