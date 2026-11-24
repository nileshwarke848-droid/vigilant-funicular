import { PHYS, stepPhysics, type Body } from '../src/game/physics';
import { FLOOR_Y } from '../src/gfx/ctx';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}
function near(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}
function FloorY() {
  return FLOOR_Y;
}
const mk = (x = 300, y = FLOOR_Y): Body => ({ x, y, vx: 0, vy: 0, grounded: true, facing: 1, width: 46, height: 96 });
const st = () => ({ coyote: 0, buffer: 0, dropTimer: 0, jumpCut: false });
const DT = 1 / 120;

console.log('physics');
{
  const b = mk();
  const s = st();
  for (let i = 0; i < 120; i++) stepPhysics(b, { move: 1, jump: false, jumpHeld: false, down: false }, [], DT, s);
  check('walk speed converges to configured value', near(b.vx, PHYS.walkSpeed, 12), `vx=${b.vx.toFixed(1)}`);
}
{
  const b = mk();
  const s = st();
  const r = stepPhysics(b, { move: 0, jump: true, jumpHeld: true, down: false }, [], DT, s);
  check('jump fires from ground', r.jumped && b.vy < 0);
  let minY = FloorY();
  for (let i = 0; i < 240; i++) {
    stepPhysics(b, { move: 0, jump: false, jumpHeld: true, down: false }, [], DT, s);
    minY = Math.min(minY, b.y);
  }
  const height = FLOOR_Y - minY;
  check('jump apex is playable (~150px)', height > 120 && height < 200, `height=${height.toFixed(0)}`);
  check('lands back on floor', b.grounded && near(b.y, FLOOR_Y, 0.01));
}
{
  // coyote time: walk off a ledge, jump within the window
  const platform = { x: 260, y: 520, w: 100, h: 16, oneWay: false };
  const b = mk(380, 520);
  const s = st();
  let jumpedLate = false;
  for (let i = 0; i < 8; i++) {
    const r = stepPhysics(b, { move: 1, jump: false, jumpHeld: false, down: false }, [platform], DT, s);
    void r;
  }
  const r = stepPhysics(b, { move: 1, jump: true, jumpHeld: true, down: false }, [platform], DT, s);
  jumpedLate = r.jumped;
  check('coyote time allows a late jump off a ledge', jumpedLate);
}
{
  // one-way platform: pass through from below, land on top from above
  // jump from directly under a one-way shelf: pass through, then land on it
  const platform = { x: 200, y: FLOOR_Y - 118, w: 200, h: 16, oneWay: true };
  const b = mk(300, FLOOR_Y);
  const s = st();
  stepPhysics(b, { move: 0, jump: true, jumpHeld: true, down: false }, [platform], DT, s);
  let landedOnTop = false;
  let passedThrough = false;
  for (let i = 0; i < 300; i++) {
    stepPhysics(b, { move: 0, jump: false, jumpHeld: true, down: false }, [platform], DT, s);
    if (b.y < platform.y - 2) passedThrough = true;
    if (b.grounded && near(b.y, platform.y, 0.01)) landedOnTop = true;
  }
  check('one-way platform is passable from below', passedThrough);
  check('one-way platform is solid from above', landedOnTop);
}
{
  // drop-through
  const platform = { x: 200, y: 500, w: 200, h: 16, oneWay: true };
  const b = mk(300, 500);
  const s = st();
  stepPhysics(b, { move: 0, jump: false, jumpHeld: false, down: false }, [platform], DT, s);
  const r = stepPhysics(b, { move: 0, jump: true, jumpHeld: true, down: true }, [platform], DT, s);
  check('down+jump drops through a one-way platform', r.droppedThrough);
}
{
  // variable jump height: early release is shorter
  const full = mk();
  const sf = st();
  stepPhysics(full, { move: 0, jump: true, jumpHeld: true, down: false }, [], DT, sf);
  let minFull = full.y;
  for (let i = 0; i < 90; i++) {
    stepPhysics(full, { move: 0, jump: false, jumpHeld: true, down: false }, [], DT, sf);
    minFull = Math.min(minFull, full.y);
  }
  const tap = mk();
  const stt = st();
  stepPhysics(tap, { move: 0, jump: true, jumpHeld: true, down: false }, [], DT, stt);
  let minTap = tap.y;
  for (let i = 0; i < 90; i++) {
    stepPhysics(tap, { move: 0, jump: false, jumpHeld: false, down: false }, [], DT, stt);
    minTap = Math.min(minTap, tap.y);
  }
  const hFull = FLOOR_Y - minFull;
  const hTap = FLOOR_Y - minTap;
  check('releasing jump early gives a shorter hop', hTap < hFull * 0.8, `${hTap.toFixed(0)} vs ${hFull.toFixed(0)}`);
}
{
  // walls
  const b = mk(100);
  const s = st();
  for (let i = 0; i < 200; i++) stepPhysics(b, { move: -1, jump: false, jumpHeld: false, down: false }, [], DT, s);
  check('cannot walk off the left wall', b.x >= 55.9);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('\nall physics checks passed');
}
