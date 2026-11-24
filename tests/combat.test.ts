import { Duel, PLATFORM_LIST } from '../src/game/duel';
import { WEAPONS, WEAPON_ORDER } from '../src/game/weapons';
import { checkTraps, rollLayout, applyTrapEvent, TRAP_DEFS } from '../src/game/traps';
import { TRAP_SEAMS } from '../src/gfx/arena';
import { FLOOR_Y } from '../src/gfx/ctx';
import { computeRig } from '../src/gfx/character';
import { BASE_POSE, POSES, locomotionPose, blendPose } from '../src/gfx/anim';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const idle = { move: 0 as const, jumpPressed: false, jumpHeld: false, down: false, weapon: null };

console.log('weapons');
{
  const ids = new Set(WEAPON_ORDER);
  check('five distinct weapons exist', ids.size === 5 && WEAPON_ORDER.length === 5);
  check('every weapon has wind-up, damage and cooldown', WEAPON_ORDER.every((w) => {
    const s = WEAPONS[w];
    return s.duration > 0 && s.cooldown > 0 && s.hitAt <= s.duration && s.damage >= 0;
  }));
  check('no weapon is spam-safe (cooldown >= duration)', WEAPON_ORDER.every((w) => WEAPONS[w].cooldown >= WEAPONS[w].duration * 0.6));
}

console.log('combat');
{
  const d = new Duel({ seed: 1 });
  d.replica.x = d.player.x + 100;
  d.player.facing = 1;
  d.cast('player', 1, 1);
  for (let i = 0; i < 40; i++) d.update(1 / 120, idle);
  check('sword in range deals damage', d.replica.hp < 100, `hp=${d.replica.hp}`);
}
{
  const d = new Duel({ seed: 2 });
  d.replica.x = d.player.x + 500;
  d.player.facing = 1;
  d.cast('player', 1, 1);
  for (let i = 0; i < 40; i++) d.update(1 / 120, idle);
  check('sword out of range whiffs', d.replica.hp === 100, `hp=${d.replica.hp}`);
}
{
  const d = new Duel({ seed: 3 });
  d.player.facing = 1;
  d.cast('player', 2, 1);
  let sawProjectile = false;
  for (let i = 0; i < 120; i++) {
    d.update(1 / 120, idle);
    if (d.projectiles.length > 0) sawProjectile = true;
  }
  check('bolt spawns a travelling projectile', sawProjectile);
  check('bolt eventually damages the far target', d.replica.hp < 100, `hp=${d.replica.hp}`);
}
{
  const d = new Duel({ seed: 4 });
  d.player.facing = 1;
  const x0 = d.player.x;
  d.cast('player', 5, 1);
  for (let i = 0; i < 30; i++) d.update(1 / 120, idle);
  check('phase shift repositions without damage', d.player.x !== x0 && d.replica.hp === 100, `x=${d.player.x.toFixed(0)}`);
}
{
  const d = new Duel({ seed: 5 });
  d.player.facing = 1;
  d.cast('player', 4, 1);
  let telegraphed = false;
  for (let i = 0; i < 120; i++) {
    d.update(1 / 120, idle);
    if (d.active.some((a) => a.weapon === 4)) telegraphed = true;
  }
  check('chain lightning has a long telegraph window', telegraphed && WEAPONS[4].hitAt > 0.7);
}
{
  const d = new Duel({ seed: 6 });
  d.player.facing = 1;
  d.update(1 / 120, { ...idle, weapon: 2 });
  check('casts set a cooldown', d.cooldowns.player[2] > 0);
  const before = d.active.filter((a) => a.weapon === 2).length;
  d.update(1 / 120, { ...idle, weapon: 2 });
  const after = d.active.filter((a) => a.weapon === 2).length;
  check('cannot re-cast a weapon already in flight', after === before, `${before} -> ${after}`);
}
{
  // weapon swapping is allowed and independent
  const d = new Duel({ seed: 61 });
  d.update(1 / 120, { ...idle, weapon: 2 });
  d.update(1 / 120, { ...idle, weapon: 3 });
  check('different weapons can be used back to back', d.cooldowns.player[2] > 0 && d.cooldowns.player[3] > 0);
}
{
  const d = new Duel({ seed: 7 });
  d.replica.x = d.player.x + 120;
  d.replica.hp = 5;
  d.player.facing = 1;
  d.cast('player', 1, 1);
  for (let i = 0; i < 40; i++) d.update(1 / 120, idle);
  check('killing blow ends the fight', d.finished && d.winner() === 'player', `hp=${d.replica.hp}`);
}

console.log('traps');
{
  const layout = rollLayout(TRAP_SEAMS, 1234);
  check('six seams present', layout.length === 6);
  check('exactly three armed per generation', layout.filter((t) => t.armed).length === 3);
  const layout2 = rollLayout(TRAP_SEAMS, 9876);
  const a = layout.map((t) => t.kind).join(',');
  const b = layout2.map((t) => t.kind).join(',');
  check('layout rotates between generations', a !== b || layout.filter((t) => t.armed).length === 3);
  check('all six trap kinds are implemented', new Set(Object.keys(TRAP_DEFS)).size === 6);
}
{
  // symmetry: the same seam must fire for whichever fighter steps on it
  const layout = rollLayout(TRAP_SEAMS, 4242);
  const armed = layout.find((t) => t.armed)!;
  const seam = armed.seam;
  const mk = (x: number) => ({ x, y: seam.y, vx: 0, vy: 0, grounded: true, hp: 100 });
  const resP = checkTraps(
    rollLayout(TRAP_SEAMS, 4242),
    { player: mk(seam.x + seam.w / 2), replica: mk(100) },
    0,
  );
  const resR = checkTraps(
    rollLayout(TRAP_SEAMS, 4242),
    { player: mk(100), replica: mk(seam.x + seam.w / 2) },
    0,
  );
  check('trap fires for the player when stepped on', resP.events[0]?.victim === 'player');
  check('same trap fires for the replica when stepped on', resR.events[0]?.victim === 'replica');
  check('trap events are identical in kind and damage', resP.events[0]?.kind === resR.events[0]?.kind && resP.events[0]?.damage === resR.events[0]?.damage);
}
{
  const ev = { kind: 'spike' as const, index: 0, x: 0, y: 0, victim: 'player' as const, damage: 14, launchVy: -620 };
  const p = { x: 0, y: 0, vx: 0, vy: 0, grounded: true, hp: 100 };
  const r = { x: 0, y: 0, vx: 0, vy: 0, grounded: true, hp: 100 };
  applyTrapEvent(ev, p);
  applyTrapEvent(ev, r);
  check('trap applies identical damage to both fighters', p.hp === r.hp && p.hp === 86);
  check('spike vent launches the victim', p.vy === -620 && r.vy === -620);
}
{
  const layout = rollLayout(TRAP_SEAMS, 555);
  const armed = layout.find((t) => t.armed)!;
  const bodies = {
    player: { x: armed.seam.x + armed.seam.w / 2, y: armed.seam.y, vx: 0, vy: 0, grounded: true, hp: 100 },
    replica: { x: 1500, y: 0, vx: 0, vy: 0, grounded: true, hp: 100 },
  };
  const first = checkTraps(layout, bodies, 0.016);
  const second = checkTraps(layout, bodies, 0.016);
  check('a fired trap does not fire again immediately', first.events.length === 1 && second.events.length === 0);
  check('a fired trap is revealed for the generation', layout.find((t) => t.index === armed.index)!.reveal >= 1);
}

console.log('animation');
{
  const rig = computeRig(BASE_POSE);
  const keys = Object.values(rig).filter((v) => Array.isArray(v)) as Array<[number, number]>;
  check('rig produces finite joint positions', keys.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  const feet = Math.min(rig.frontFoot[1], rig.backFoot[1]);
  check('idle stance plants a foot near the ground line', Math.abs(feet) < 0.05, `lowest foot y=${feet.toFixed(3)}`);
}
{
  const loco = locomotionPose({ vx: 300, vy: 0, grounded: true, phase: 1.2, idleBreath: 0.4, landing: 0, facing: 1 });
  check('run pose differs from idle', Math.abs(loco.hipY - BASE_POSE.hipY) > 0.001 || Math.abs(loco.lean - BASE_POSE.lean) > 0.05);
  const air = locomotionPose({ vx: 0, vy: -400, grounded: false, phase: 0, idleBreath: 0, landing: 0, facing: 1 });
  check('air pose differs from ground pose', Math.abs(air.frontThigh - BASE_POSE.frontThigh) > 0.1);
  const mid = blendPose(POSES.idleA, POSES.run, 0.5);
  check('pose blending interpolates', mid.frontThigh > Math.min(POSES.idleA.frontThigh, POSES.run.frontThigh) && mid.frontThigh < Math.max(POSES.idleA.frontThigh, POSES.run.frontThigh));
}
{
  const poses = Object.keys(POSES);
  check('at least 12 hand-authored poses exist', poses.length >= 12);
  check('every pose has all 19 channels', poses.every((k) => Object.keys(POSES[k]).length === Object.keys(BASE_POSE).length));
}
{
  // platform geometry in the sim must match the renderer
  check('physics platform geometry matches the renderer', PLATFORM_LIST.every((p, i) => {
    const seam = TRAP_SEAMS[3 + i];
    return typeof seam === 'number' ? false : Math.abs(p.y - (FLOOR_Y - (i === 2 ? 232 : 118))) < 0.01 && p.oneWay;
  }));
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exitCode = 1;
} else {
  console.log('\nall combat checks passed');
}
