/**
 * Browser smoke test: runs the REAL game entry point under a DOM shim backed by
 * skia canvases, drives 240 frames with synthetic key events, and reports any
 * runtime error. Catches what tsc cannot (missing canvas methods, bad state).
 */
import { createCanvas } from '@napi-rs/canvas';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../out/crops');

const listeners = new Map();
const makeEl = () => ({ style: {}, addEventListener() {} });
const gameCanvas = createCanvas(1280, 720);
// DOM shim: browsers expose .style on <canvas>; skia canvases do not
gameCanvas.style = {};

const docEl = makeEl();
globalThis.document = {
  documentElement: { style: {} },
  body: makeEl(),
  getElementById: () => gameCanvas,
  createElement: () => createCanvas(1, 1),
  addEventListener() {},
};
let vw = 1600, vh = 900;
globalThis.window = {
  innerWidth: vw, innerHeight: vh, devicePixelRatio: 2,
  addEventListener: (t, fn) => listeners.set(t, fn),
  removeEventListener: () => {},
};
globalThis.devicePixelRatio = 2;
const rafQueue = [];
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
let now = 0;
globalThis.performance = { now: () => now };

const errors = [];
process.on('uncaughtException', (e) => errors.push(e));

const mod = await import(pathToFileURL(path.resolve(here, '../out/browser-main.mjs')).href);
void mod;

const keydown = listeners.get('keydown');
const keyup = listeners.get('keyup');

function press(code) { keydown?.({ code, preventDefault() {} }); }
function release(code) { keyup?.({ code }); }

const script = [
  { at: 5, down: ['KeyD'] },
  { at: 30, up: ['KeyD'], press: ['KeyW'] },
  { at: 34, up: ['KeyW'] },
  { at: 45, press: ['Digit2'] },
  { at: 60, press: ['Digit1'] },
  { at: 78, down: ['KeyD'] },
  { at: 90, press: ['Digit4'] },
  { at: 120, press: ['Digit5'] },
  { at: 150, press: ['Digit3'] },
  { at: 170, up: ['KeyD'] },
  { at: 190, press: ['Escape'] },
  { at: 195, press: ['Escape'] },
];

for (let frame = 0; frame < 240; frame++) {
  for (const s of script) {
    if (s.at === frame) {
      for (const c of s.down ?? []) press(c);
      for (const c of s.up ?? []) release(c);
      for (const c of s.press ?? []) { press(c); release(c); }
    }
  }
  now += 16.67;
  const fn = rafQueue.shift();
  if (!fn) { errors.push(new Error(`rAF stalled at frame ${frame}`)); break; }
  try { fn(now); } catch (e) { errors.push(e); break; }
}

// one more render for a screenshot
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'smoke.png'), gameCanvas.toBuffer('image/png'));
const st = globalThis.window.__replica;
console.log(errors.length ? `FAILED with ${errors.length} error(s)` : 'OK: 240 frames, no runtime errors');
for (const e of errors.slice(0, 3)) console.log(e?.stack?.split('\n').slice(0, 4).join('\n'));
console.log('canvas', gameCanvas.width + 'x' + gameCanvas.height);
if (st) console.log('player hp', st.duel.player.hp, 'replica hp', st.duel.replica.hp, 'gen', st.traps.length);
process.exitCode = errors.length ? 1 : 0;
