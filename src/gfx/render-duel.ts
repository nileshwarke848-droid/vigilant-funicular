import { drawFighter, drawPortrait } from './character';
import type { WeaponId } from './character';
import { FIGHTER_SCALE, FLOOR_Y, factionColors, glowDisc, PALETTE, VIEW_H, VIEW_W, type GfxCtx } from './ctx';
import { ANIM, blendPose, locomotionPose, overlayBlendWeight, sampleTrack, type Pose, POSES } from './anim';
import {
  drawArena,
  drawBackdrop,
  drawBolt,
  drawBurst,
  drawChainRune,
  drawGuardWard,
  drawHitSparkLine,
  drawPhaseTrail,
  drawScanlines,
  drawSlashArc,
  drawTrapTelegraph,
  drawVignette,
  TRAP_SEAMS,
} from './arena';
import { clamp01, damp, easeOutCubic, lerp, TAU } from './math';
import type { Duel } from '../game/duel';
import { WEAPONS, WEAPON_ORDER } from '../game/weapons';
import { TRAP_DEFS, type Trap } from '../game/traps';

export interface FighterPoseState {
  faction: 'player' | 'replica';
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facing: 1 | -1;
  weapon: WeaponId;
  pose: Pose;
  overlay: { name: string; age: number; dur: number } | null;
  phase: number;
  idle: number;
  landing: number;
  ghost: number;
  charge: number;
  hurt: number;
  flash: number;
  guard: number;
  hp: number;
}

const OVERLAY_POSES: Record<string, Array<{ at: number; pose: Pose }>> = {
  slash: [
    { at: 0, pose: POSES.slashWind },
    { at: 0.13, pose: POSES.slashWind },
    { at: 0.22, pose: POSES.slashCut },
    { at: 0.52, pose: POSES.slashCut },
  ],
  cast: [
    { at: 0, pose: POSES.castWind },
    { at: 0.19, pose: POSES.castWind },
    { at: 0.3, pose: POSES.castRelease },
    { at: 1.2, pose: POSES.castWind },
  ],
  guard: [
    { at: 0, pose: POSES.guard },
    { at: 0.16, pose: POSES.guard },
    { at: 0.3, pose: POSES.guard },
  ],
  hurt: [
    { at: 0, pose: POSES.hurt },
    { at: 0.18, pose: POSES.hurt },
    { at: 0.34, pose: POSES.idleA },
  ],
  phase: [
    { at: 0, pose: POSES.phase },
    { at: 0.16, pose: POSES.phase },
    { at: 0.36, pose: POSES.idleA },
  ],
  dead: [
    { at: 0, pose: POSES.hurt },
    { at: 0.28, pose: POSES.dead },
    { at: 0.9, pose: POSES.dead },
  ],
};

export function makePoseState(f: 'player' | 'replica', x: number, y: number, facing: 1 | -1): FighterPoseState {
  return {
    faction: f,
    x,
    y,
    vx: 0,
    vy: 0,
    grounded: true,
    facing,
    weapon: 1,
    pose: POSES.idleA,
    overlay: null,
    phase: Math.random() * TAU,
    idle: Math.random() * 10,
    landing: 0,
    ghost: 0,
    charge: 0,
    hurt: 0,
    flash: 0,
    guard: 0,
    hp: 1,
  };
}

export function syncPose(s: FighterPoseState, src: {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facing: 1 | -1;
  hp: number;
}, dt: number): void {
  s.x = src.x;
  s.y = src.y;
  s.vx = src.vx;
  s.vy = src.vy;
  s.facing = src.facing;
  s.hp = src.hp;
  const wasGrounded = s.grounded;
  s.grounded = src.grounded;
  if (!wasGrounded && src.grounded) s.landing = Math.min(1, Math.abs(s.vy) / 900 + 0.25);
  s.phase += dt * ANIM.gaitHz * TAU * clamp01(Math.abs(src.vx) / 300 + 0.1);
  s.idle += dt * ANIM.breathHz * TAU;
  s.landing = damp(s.landing, 0, ANIM.squashRecover, dt);

  const dying = src.hp <= 0;
  const loco = dying
    ? POSES.dead
    : locomotionPose({
        vx: src.vx,
        vy: src.vy,
        grounded: src.grounded,
        phase: s.phase,
        idleBreath: s.idle,
        landing: s.landing,
        facing: s.facing,
      });
  let p = loco;
  if (s.overlay) {
    const keys = OVERLAY_POSES[s.overlay.name] ?? OVERLAY_POSES.slash;
    const k = sampleTrack<Pose>({ keys }, s.overlay.age);
    if (k) p = blendPose(loco, k.pose, overlayBlendWeight(1, s.overlay.age, s.overlay.dur));
  }
  p.hipY -= s.landing * 0.14;
  p.lean += clamp01(Math.abs(src.vx) / 520) * 0.06;
  p.cape += 0.1 * Math.sin(s.idle * 1.4);
  s.pose = p;
}

export interface RenderInput {
  duel: Duel;
  player: FighterPoseState;
  replica: FighterPoseState;
  traps: Trap[];
  time: number;
  generation: number;
  titleIn: number;
  paused: boolean;
  hint: number;
  arenaFlash: number;
}

export function renderDuel(ctx: GfxCtx, r: RenderInput): void {
  const { duel, player, replica, time } = r;
  const shake = duel.shake;
  const sx = (Math.random() - 0.5) * 16 * shake;
  const sy = (Math.random() - 0.5) * 11 * shake;

  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#06040e');
  g.addColorStop(0.5, '#0c0820');
  g.addColorStop(1, '#180f33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  // frame the fight band a little higher than centre
  ctx.translate(sx, sy - 34);
  // subtle camera push toward whichever fighter is advancing
  const camX = (player.x + replica.x) / 2;
  const camShift = clamp01(Math.abs(camX - VIEW_W / 2) / (VIEW_W / 2)) * 26;
  ctx.translate(-Math.sign(camX - VIEW_W / 2) * camShift, 0);

  drawBackdrop(ctx, time, clamp01((player.x - VIEW_W / 2) / 800));
  drawArena(ctx, time, r.traps.map((t) => (t.armed ? Math.max(t.reveal * 0.6, t.firing) : 0)));
  drawTrapStates(ctx, r.traps, time);

  // pools of light around both fighters
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, col, k] of [
    [player.x, '120,255,240', 0.2],
    [replica.x, '255,120,180', 0.18],
  ] as Array<[number, string, number]>) {
    const pool = ctx.createRadialGradient(x, FLOOR_Y + 6, 4, x, FLOOR_Y + 6, 240);
    pool.addColorStop(0, `rgba(${col},${k})`);
    pool.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = pool;
    ctx.fillRect(x - 250, FLOOR_Y - 30, 500, 120);
  }
  ctx.restore();

  // replica first (behind), then player
  drawFighterWithFx(ctx, replica, time, false);
  drawFighterWithFx(ctx, player, time, true);

  drawDuelFx(ctx, duel, time);

  ctx.restore();

  if (duel.flash.player > 0.02) {
    ctx.save();
    ctx.globalAlpha = duel.flash.player * 0.22;
    ctx.fillStyle = '#dffdfa';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }
  drawVignette(ctx, r.duel.player.hp < 35 ? 0.45 : 0);
  drawHud(ctx, r, player, replica);
  drawScanlines(ctx);

  if (r.titleIn < 1) {
    const k = r.titleIn;
    ctx.save();
    ctx.globalAlpha = easeOutCubic(clamp01(k * 2)) * (1 - clamp01((k - 0.6) / 0.4));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4f1ff';
    ctx.font = '800 78px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('REPLICA', VIEW_W / 2, VIEW_H * 0.4);
    ctx.font = '500 17px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,190,240,0.8)';
    ctx.fillText('IT LEARNS AS YOU MOVE', VIEW_W / 2, VIEW_H * 0.4 + 40);
    ctx.restore();
  }

  if (r.paused) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,3,12,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4f1ff';
    ctx.font = '700 44px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 12);
    ctx.font = '500 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,190,240,0.7)';
    ctx.fillText('ESC / P TO RESUME', VIEW_W / 2, VIEW_H / 2 + 28);
    ctx.restore();
  }

  if (duel.finished) {
    const won = duel.winner() === 'player';
    ctx.save();
    ctx.fillStyle = won ? 'rgba(4,16,14,0.55)' : 'rgba(16,4,10,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? '#9ef7ef' : '#ff9fc4';
    ctx.font = '800 60px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(won ? 'IT SHATTERS' : 'YOU SHATTER', VIEW_W / 2, VIEW_H * 0.42);
    ctx.font = '500 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(230,224,255,0.8)';
    ctx.fillText(won ? 'it reforms, a little colder' : 'it remembers this', VIEW_W / 2, VIEW_H * 0.42 + 34);
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,190,240,0.65)';
    ctx.fillText('PRESS R TO FIGHT AGAIN', VIEW_W / 2, VIEW_H * 0.42 + 74);
    ctx.restore();
  }
}

function drawFighterWithFx(ctx: GfxCtx, s: FighterPoseState, time: number, front: boolean): void {
  const col = factionColors(s.faction);
  if (s.ghost > 0.02) {
    ctx.save();
    ctx.globalAlpha = s.ghost * 0.35;
    drawFighter(ctx, {
      pose: s.pose,
      facing: s.facing,
      x: s.x - 30 * s.facing,
      y: s.y,
      scale: FIGHTER_SCALE,
      faction: s.faction,
      time,
      weapon: 1,
      sword: true,
    });
    ctx.restore();
  }
  glowDisc(ctx, s.x, s.y - 12, 150, col.faint, 'rgba(0,0,0,0)', 0.6);
  drawFighter(ctx, {
    pose: s.pose,
    facing: s.facing,
    x: s.x,
    y: s.y,
    scale: 58,
    faction: s.faction,
    time,
    weapon: s.weapon,
    sword: true,
    charge: s.charge,
    alpha: s.hurt > 0.02 ? 0.85 : 1,
    grounded: s.grounded,
  });
  if (s.hurt > 0.02) {
    ctx.save();
    ctx.globalAlpha = s.hurt * 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y - 62, 30, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (s.guard > 0.05) {
    const gcol = s.faction === 'player' ? '#ffd98a' : '#ffb3e6';
    drawGuardWard(ctx, s.x, s.y - 58, 60, time, clamp01(s.guard) * 0.85, gcol);
  }
  // foot contact shadow
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = col.main;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, 30, 5.5, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + 1, 30, 6, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  void front;
}

function drawDuelFx(ctx: GfxCtx, duel: Duel, time: number): void {
  for (const im of duel.impacts) {
    const prog = clamp01(im.age / 0.42);
    if (im.kind === 'slash') {
      drawSlashArc(ctx, im.x, im.y, im.facing ?? 1, prog, 62, im.color);
    } else if (im.kind === 'bolt' || im.kind === 'parry') {
      drawBurst(ctx, im.x, im.y, prog, im.color, im.power * 1.5);
      drawHitSparkLine(ctx, im.x, im.y, -0.4, 130, prog, im.color);
    } else if (im.kind === 'chain') {
      const h = 380;
      ctx.save();
      ctx.globalAlpha = 1 - prog;
      ctx.beginPath();
      let xx = im.x;
      let yy = FLOOR_Y;
      ctx.moveTo(xx, yy);
      while (yy > FLOOR_Y - h) {
        yy -= 26;
        xx = im.x + Math.sin(yy * 0.35 + time * 40) * 22 * (1 - prog);
        ctx.lineTo(xx, yy);
      }
      ctx.strokeStyle = im.color;
      ctx.lineWidth = 7 * (1 - prog) + 2;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      drawBurst(ctx, im.x, FLOOR_Y - 8, prog, im.color, im.power);
      ctx.restore();
    } else if (im.kind === 'phase') {
      ctx.save();
      ctx.globalAlpha = 1 - prog;
      ctx.strokeStyle = im.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(im.x, im.y, 20 + prog * 60, 8 + prog * 26, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else if (im.kind === 'trap') {
      ctx.save();
      ctx.globalAlpha = (1 - prog) * 0.9;
      ctx.strokeStyle = im.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(im.x, im.y + 8, 44, 12, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }
  // swing arcs and cast glows driven by live active windows
  for (const a of duel.active) {
    const body = a.owner === 'player' ? duel.player : duel.replica;
    const col = a.owner === 'player' ? '#9ef7ef' : '#ff9fc4';
    if (a.weapon === 1 && a.age > 0.1 && a.age < 0.4) {
      const k = clamp01((a.age - 0.1) / 0.3);
      drawSlashArc(ctx, body.x + 16 * body.facing, body.y - 58, body.facing, k, 74, col);
    }
    if (a.weapon === 4 && a.age < WEAPONS[4].hitAt) {
      const k = clamp01(a.age / WEAPONS[4].hitAt);
      glowDisc(ctx, (a.runeX ?? body.x) , FLOOR_Y - 6, 30 + k * 26, '#ffffff', col, 0.35 + k * 0.4);
    }
  }
  for (const pr of duel.projectiles) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    if (pr.vx < 0) ctx.scale(-1, 1);
    drawBolt(ctx, 0, 0, time, pr.owner === 'player' ? '#8fe9ff' : '#ff9fc4');
    ctx.restore();
  }
  // chain rune telegraph
  for (const a of duel.active) {
    if (a.weapon !== 4) continue;
    const prog = clamp01(a.age / (WEAPONS[4].hitAt * 1.04));
    if (a.age < WEAPONS[4].hitAt) {
      drawChainRune(ctx, a.runeX ?? a.x, FLOOR_Y, 340, prog, time, a.owner === 'player' ? '#b9a6ff' : '#ffb3e6');
    }
  }
  // particles
  for (const p of duel.particles) {
    const k = clamp01(p.life / p.max);
    if (p.kind === 'dust') {
      ctx.globalAlpha = k * 0.35;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (2.4 - k), 0, TAU);
      ctx.fill();
    } else {
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTrapStates(ctx: GfxCtx, traps: Trap[], time: number): void {
  for (const t of traps) {
    const cx = t.seam.x + t.seam.w / 2;
    const y = t.seam.y;
    if (!t.armed && t.cooldown <= 0) continue;
    if (t.firing > 0) {
      const k = t.firing;
      const def = TRAP_DEFS[t.kind];
      if (t.kind === 'spike') {
        for (let i = 0; i < 5; i++) {
          const px = t.seam.x + 10 + i * ((t.seam.w - 20) / 4);
          const h = 30 * Math.sin(k * Math.PI);
          ctx.beginPath();
          ctx.moveTo(px - 6, y);
          ctx.lineTo(px, y - h);
          ctx.lineTo(px + 6, y);
          ctx.closePath();
          ctx.fillStyle = def.color;
          ctx.globalAlpha = k;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (t.kind === 'flare') {
        const g = ctx.createLinearGradient(0, y, 0, y - 200);
        g.addColorStop(0, `rgba(255,154,92,${0.75 * k})`);
        g.addColorStop(1, 'rgba(255,154,92,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 26, y - 200, 52, 200);
      } else if (t.kind === 'gravity') {
        ctx.save();
        ctx.globalAlpha = 0.5 * k;
        for (let ring = 0; ring < 3; ring++) {
          const rr = ((time * 60 + ring * 22) % 66) * 1.2;
          ctx.beginPath();
          ctx.ellipse(cx, y, rr, rr * 0.22, 0, 0, TAU);
          ctx.strokeStyle = def.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
      } else if (t.kind === 'hex') {
        ctx.save();
        ctx.translate(cx, y - 8);
        ctx.rotate(time * 3);
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = k;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * TAU;
          const px = Math.cos(a) * 22;
          const py = Math.sin(a) * 22;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      } else if (t.kind === 'collapse') {
        ctx.fillStyle = '#05030d';
        ctx.globalAlpha = 0.94;
        ctx.fillRect(t.seam.x, y - 2, t.seam.w, 6);
        ctx.globalAlpha = 1;
      } else if (t.kind === 'snare') {
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = k;
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(cx, y - 4, 8 + i * 7, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    if (t.armed) {
      drawTrapTelegraph(ctx, t.seam, 0.35 + 0.25 * t.reveal, t.kind === 'flare' ? 1 : t.kind === 'gravity' ? 3 : t.kind === 'hex' ? 5 : 0, TRAP_DEFS[t.kind].color);
    }
  }
}

function drawHud(ctx: GfxCtx, r: RenderInput, player: FighterPoseState, replica: FighterPoseState): void {
  const { time } = r;
  ctx.save();
  drawHpPlate(ctx, 78, 44, 452, player.hp / 100, 'player', 'YOU', r.player.weapon);
  drawHpPlate(ctx, VIEW_W - 78 - 452, 44, 452, replica.hp / 100, 'replica', 'REPLICA', r.replica.weapon);

  ctx.save();
  ctx.translate(VIEW_W / 2, 66);
  ctx.rotate(time * 0.3);
  ctx.strokeStyle = 'rgba(220,210,255,0.3)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * TAU;
    const px = Math.cos(a) * 22;
    const py = Math.sin(a) * 22;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(230,224,255,0.75)';
  ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`GEN ${r.generation}`, VIEW_W / 2, 110);

  // weapon rack
  for (let i = 0; i < WEAPON_ORDER.length; i++) {
    const w = WEAPON_ORDER[i];
    const spec = WEAPONS[w];
    const active = r.player.weapon === w;
    const cd = r.duel.cooldowns.player[w];
    const ready = cd <= 0;
    const x = 78 + 40 + i * 70;
    const y = 132;
    ctx.beginPath();
    ctx.roundRect(x - 27, y - 15, 58, 30, 6);
    ctx.fillStyle = active ? 'rgba(83,245,228,0.18)' : 'rgba(14,10,30,0.75)';
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(83,245,228,0.95)' : ready ? 'rgba(130,116,190,0.45)' : 'rgba(90,80,130,0.25)';
    ctx.lineWidth = active ? 1.8 : 1;
    ctx.stroke();
    ctx.fillStyle = ready ? (active ? '#e7fffc' : 'rgba(200,190,240,0.7)') : 'rgba(120,110,160,0.45)';
    ctx.font = `${active ? '700' : '500'} 10px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(`${i + 1} ${spec.name}`, x + 1, y + 1);
    if (!ready) {
      const k = cd / spec.cooldown;
      ctx.beginPath();
      ctx.roundRect(x - 27, y + 9, 58 * (1 - k), 4, 2);
      ctx.fillStyle = 'rgba(120,220,220,0.55)';
      ctx.fill();
    }
  }

  drawPortrait(ctx, 46, 58, 58, 'player', 1, time);
  drawPortrait(ctx, VIEW_W - 46, 58, 58, 'replica', -1, time);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(190,180,230,0.42)';
  ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('MOTION BUILD — ARTS ONLY  ·  A/D MOVE  ·  W JUMP  ·  1-5 WEAPONS  ·  ESC PAUSE', 30, VIEW_H - 26);
  ctx.textAlign = 'right';
  ctx.fillText('REPLICA © 2026', VIEW_W - 30, VIEW_H - 26);

  if (r.hint < 1 && r.titleIn >= 1) {
    ctx.save();
    ctx.globalAlpha = 1 - r.hint;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(230,224,255,0.4)';
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('SHE IS NOT ANIMATED. SHE IS WATCHING.', VIEW_W / 2, 168);
    ctx.restore();
  }
  ctx.restore();
}

function drawHpPlate(ctx: GfxCtx, x: number, y: number, w: number, hp: number, faction: 'player' | 'replica', label: string, weapon: WeaponId): void {
  const c = factionColors(faction);
  const h = 18;
  ctx.save();
  const skew = faction === 'player' ? -12 : 12;
  ctx.beginPath();
  ctx.moveTo(x + (faction === 'player' ? 0 : skew), y);
  ctx.lineTo(x + w + skew, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(10,8,24,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,140,230,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const pad = 3;
  const fw = Math.max(0, (w - pad * 2) * clamp01(hp));
  if (fw > 1) {
    ctx.beginPath();
    ctx.moveTo(x + pad + (faction === 'player' ? 0 : skew), y + pad);
    ctx.lineTo(x + pad + fw + (faction === 'player' ? 0 : skew), y + pad);
    ctx.lineTo(x + pad + fw - (faction === 'player' ? 6 : -6), y + h - pad);
    ctx.lineTo(x + pad, y + h - pad);
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, c.deep);
    g.addColorStop(0.5, c.main);
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(6,4,16,0.5)';
  for (let i = 1; i < 10; i++) ctx.fillRect(x + (w / 10) * i, y + 2, 1.4, h - 4);

  ctx.fillStyle = c.main;
  ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = faction === 'player' ? 'left' : 'right';
  ctx.fillText(label, faction === 'player' ? x : x + w, y - 8);
  if (faction === 'player') {
    ctx.fillStyle = 'rgba(220,212,255,0.4)';
    ctx.font = '500 10px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(WEAPONS[weapon].name, x + 46, y - 8);
  }
  ctx.restore();
}

export { TRAP_SEAMS, PALETTE };
