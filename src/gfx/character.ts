import type { GfxCtx } from './ctx';
import { factionColors, glowDisc, type Faction } from './ctx';
import type { Pose } from './anim';
import { clamp01, lerp, TAU } from './math';

export type WeaponId = 1 | 2 | 3 | 4 | 5;

/** Joint layout in character units (y up, +x = facing forward). */
export interface Rig {
  hip: [number, number];
  shoulder: [number, number];
  neck: [number, number];
  head: [number, number];
  frontKnee: [number, number];
  frontFoot: [number, number];
  backKnee: [number, number];
  backFoot: [number, number];
  frontElbow: [number, number];
  frontHand: [number, number];
  backElbow: [number, number];
  backHand: [number, number];
  tip: [number, number];
  headTilt: number;
}

const THIGH = 0.44;
const SHIN = 0.42;
const UPPER_ARM = 0.3;
const FOREARM = 0.27;
const TORSO = 0.56;
const NECK = 0.1;
const HEAD_R = 0.165;
/** Poses are authored around a ~1.02 hip height; legs now measure 0.86. */
const HIP_SCALE = 0.86 / 1.02;

export function computeRig(p: Pose): Rig {
  const hip: [number, number] = [p.hipX + p.lean * 0.05, p.hipY * HIP_SCALE - p.crouch * 0.1];
  const torsoLen = TORSO * p.torso;
  const shoulder: [number, number] = [
    hip[0] + Math.sin(p.lean) * torsoLen,
    hip[1] + Math.cos(p.lean) * torsoLen,
  ];
  const neck: [number, number] = [shoulder[0] + Math.sin(p.lean) * NECK, shoulder[1] + Math.cos(p.lean) * NECK];
  const tilt = p.lean + p.headTilt;
  const head: [number, number] = [neck[0] + Math.sin(tilt) * HEAD_R * 0.9, neck[1] + Math.cos(tilt) * HEAD_R * 0.9];

  const leg = (thigh: number, kneeBend: number): { knee: [number, number]; foot: [number, number] } => {
    const knee: [number, number] = [hip[0] + Math.sin(thigh) * THIGH, hip[1] - Math.cos(thigh) * THIGH];
    const shin = thigh - kneeBend;
    const foot: [number, number] = [knee[0] + Math.sin(shin) * SHIN, knee[1] - Math.cos(shin) * SHIN];
    return { knee, foot };
  };

  const arm = (a: number, bend: number): { elbow: [number, number]; hand: [number, number] } => {
    const elbow: [number, number] = [shoulder[0] + Math.sin(a) * UPPER_ARM, shoulder[1] - Math.cos(a) * UPPER_ARM];
    const fore = a + bend;
    const hand: [number, number] = [elbow[0] + Math.sin(fore) * FOREARM, elbow[1] - Math.cos(fore) * FOREARM];
    return { elbow, hand };
  };

  const front = leg(p.frontThigh, p.frontKnee);
  const back = leg(p.backThigh, p.backKnee);
  const fa = arm(p.frontArm, p.frontArmBend);
  const ba = arm(p.backArm, p.backArmBend);
  const bladeLen = 1.02;
  const tip: [number, number] = [
    fa.hand[0] + Math.sin(p.weaponAngle) * bladeLen,
    fa.hand[1] - Math.cos(p.weaponAngle) * bladeLen,
  ];

  return {
    hip,
    shoulder,
    neck,
    head,
    frontKnee: front.knee,
    frontFoot: front.foot,
    backKnee: back.knee,
    backFoot: back.foot,
    frontElbow: fa.elbow,
    frontHand: fa.hand,
    backElbow: ba.elbow,
    backHand: ba.hand,
    tip,
    headTilt: tilt,
  };
}

export interface FighterDrawOptions {
  pose: Pose;
  facing: number;
  x: number;
  y: number;
  scale: number;
  faction: Faction;
  time: number;
  weapon?: WeaponId;
  alpha?: number;
  charge?: number;
  ghost?: number;
  sword?: boolean;
  /** when true the lowest foot is planted on the floor (no floating) */
  grounded?: boolean;
}

type V2 = [number, number];

/** Tapered limb: quad body with rounded caps, plus an inner highlight. */
function limb(
  ctx: GfxCtx,
  a: V2,
  b: V2,
  wA: number,
  wB: number,
  fill: string | CanvasGradientLike,
  stroke: string,
  edge: string | null,
  weight = 1,
): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  ctx.beginPath();
  ctx.moveTo(a[0] + nx * wA, a[1] + ny * wA);
  ctx.lineTo(b[0] + nx * wB, b[1] + ny * wB);
  ctx.arc(b[0], b[1], wB, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true);
  ctx.lineTo(a[0] - nx * wA, a[1] - ny * wA);
  ctx.arc(a[0], a[1], wA, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true);
  ctx.closePath();
  ctx.fillStyle = fill as never;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = weight;
  ctx.stroke();

  if (edge) {
    ctx.beginPath();
    ctx.moveTo(a[0] + nx * wA * 0.55, a[1] + ny * wA * 0.55);
    ctx.lineTo(b[0] + nx * wB * 0.5, b[1] + ny * wB * 0.5);
    ctx.strokeStyle = edge;
    ctx.lineWidth = weight * 0.8;
    ctx.stroke();
  }
}

// Structural gradient stand-in for TS (CanvasGradient is not in the env type).
type CanvasGradientLike = unknown;

function ribbonStrand(
  ctx: GfxCtx,
  root: V2,
  angle: number,
  len: number,
  width: number,
  colorMid: string,
  colorTip: string,
  wave: number,
): void {
  const steps = 7;
  const left: V2[] = [];
  const right: V2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = angle + Math.sin(t * 2.6 + wave) * (0.18 + t * 0.22);
    const px = root[0] + Math.cos(ang) * len * t + Math.sin(t * 5 + wave) * len * 0.05;
    const py = root[1] + Math.sin(ang) * len * t + Math.cos(t * 4 + wave) * len * 0.04 + t * t * len * 0.18;
    const w = width * (1 - t * 0.92) * (0.6 + 0.6 * Math.sin(t * Math.PI));
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    left.push([px + nx * w, py + ny * w]);
    right.push([px - nx * w, py - ny * w]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i <= steps; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = steps; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  const g = ctx.createLinearGradient(root[0], root[1], root[0] + Math.cos(angle) * len, root[1] + Math.sin(angle) * len);
  g.addColorStop(0, colorMid);
  g.addColorStop(0.7, colorMid);
  g.addColorStop(1, colorTip);
  ctx.fillStyle = g;
  ctx.fill();
}

/** Dark disc with a rim: reads as a joint plate and hides limb seams. */
function jointCap(ctx: GfxCtx, at: V2, r: number, fill: string, stroke: string): void {
  ctx.beginPath();
  ctx.arc(at[0], at[1], r * 0.92, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke !== 'none') {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(0.8, r * 0.16);
    ctx.stroke();
  }
}

function drawBoot(ctx: GfxCtx, foot: V2, s: number, facingDir: number, color: string, alpha: number): void {
  ctx.save();
  ctx.translate(foot[0], foot[1]);
  ctx.scale(facingDir, 1);
  ctx.globalAlpha *= alpha;
  const fw = s * 0.15;
  ctx.beginPath();
  ctx.moveTo(-s * 0.05, -s * 0.035);
  ctx.lineTo(fw * 0.55, -s * 0.045);
  ctx.lineTo(fw, -s * 0.015);
  ctx.lineTo(fw * 0.94, s * 0.02);
  ctx.lineTo(-s * 0.055, s * 0.02);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -s * 0.05, 0, s * 0.03);
  g.addColorStop(0, 'rgba(64,55,104,1)');
  g.addColorStop(1, 'rgba(18,15,34,1)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(1, s * 0.024);
  ctx.stroke();
  // toe cap accent
  ctx.beginPath();
  ctx.moveTo(fw * 0.5, -s * 0.04);
  ctx.lineTo(fw, -s * 0.012);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, s * 0.022);
  ctx.stroke();
  ctx.restore();
}

function kneeGuard(ctx: GfxCtx, at: V2, s: number, color: string, alpha: number): void {
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.moveTo(-s * 0.075, -s * 0.02);
  ctx.quadraticCurveTo(0, -s * 0.085, s * 0.08, -s * 0.015);
  ctx.quadraticCurveTo(s * 0.05, s * 0.07, -s * 0.03, s * 0.06);
  ctx.closePath();
  ctx.fillStyle = 'rgba(60,51,100,1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(0.9, s * 0.02);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, s * 0.018);
  ctx.beginPath();
  ctx.moveTo(-s * 0.06, -s * 0.01);
  ctx.quadraticCurveTo(0, -s * 0.065, s * 0.065, -s * 0.005);
  ctx.stroke();
  ctx.restore();
}

export function drawFighter(ctx: GfxCtx, o: FighterDrawOptions): void {
  const p = o.pose;
  const colors = factionColors(o.faction);
  const s = o.scale;
  const alpha = o.alpha ?? 1;
  const weapon = o.weapon ?? 1;
  const ghost = o.ghost ?? 0;
  const charge = o.charge ?? 0;
  const rig = computeRig(p);
  const T = (pt: [number, number]): V2 => [pt[0] * s, -pt[1] * s];
  const dir = o.facing >= 0 ? 1 : -1;

  // foot planting: lift/drop the whole figure so the support foot touches the floor
  let plantOffset = 0;
  if (o.grounded) {
    const lowest = Math.min(rig.frontFoot[1], rig.backFoot[1]);
    plantOffset = -lowest * s;
  }

  ctx.save();
  ctx.translate(o.x, o.y + plantOffset);
  ctx.scale(o.facing, 1);
  ctx.globalAlpha = alpha * (1 - ghost * 0.4);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // --- shadow --------------------------------------------------------------
  ctx.save();
  ctx.globalAlpha *= 0.55;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.ellipse(0, 1, s * 0.52, s * 0.1, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  const hipPx = T(rig.hip);
  const shoulderPx = T(rig.shoulder);
  const neckPx = T(rig.neck);
  const headPx = T(rig.head);

  // --- cape strands (behind) ----------------------------------------------
  const capeBase: V2 = [shoulderPx[0] - s * 0.1, shoulderPx[1] + s * 0.1];
  const capeAng = Math.PI * 0.62 + p.cape * 0.42;
  // outer mantle: broad, hangs off the shoulder blades
  ribbonStrand(ctx, capeBase, capeAng, s * (0.72 + p.cape * 0.25), s * 0.19, 'rgba(30,25,58,0.96)', 'rgba(0,0,0,0)', Math.sin(o.time * 3.4) * 0.5);
  // inner fold catches the faction light
  ribbonStrand(
    ctx,
    [capeBase[0] + s * 0.05, capeBase[1] + s * 0.05],
    capeAng - 0.16,
    s * (0.55 + p.cape * 0.18),
    s * 0.11,
    colors.deep,
    'rgba(0,0,0,0)',
    Math.sin(o.time * 3.4 + 1.4) * 0.7,
  );

  // --- back leg ------------------------------------------------------------
  jointCap(ctx, hipPx, s * 0.115, 'rgba(26,22,50,1)', 'rgba(5,5,14,1)');
  limb(ctx, hipPx, T(rig.backKnee), s * 0.115, s * 0.095, 'rgba(30,26,58,1)', 'rgba(6,6,16,1)', colors.deep);
  jointCap(ctx, T(rig.backKnee), s * 0.095, 'rgba(26,22,50,1)', 'rgba(5,5,14,1)');
  limb(ctx, T(rig.backKnee), T(rig.backFoot), s * 0.09, s * 0.064, 'rgba(24,21,48,1)', 'rgba(6,6,16,1)', colors.deep);
  drawBoot(ctx, T(rig.backFoot), s, 1, colors.deep, 0.75);

  // --- back arm ------------------------------------------------------------
  jointCap(ctx, shoulderPx, s * 0.095, 'rgba(26,22,50,1)', 'rgba(5,5,14,1)');
  limb(ctx, shoulderPx, T(rig.backElbow), s * 0.098, s * 0.08, 'rgba(30,26,58,1)', 'rgba(6,6,16,1)', colors.deep);
  jointCap(ctx, T(rig.backElbow), s * 0.08, 'rgba(26,22,50,1)', 'rgba(5,5,14,1)');
  limb(ctx, T(rig.backElbow), T(rig.backHand), s * 0.078, s * 0.06, 'rgba(24,21,48,1)', 'rgba(6,6,16,1)', colors.deep);
  ctx.beginPath();
  ctx.arc(T(rig.backHand)[0], T(rig.backHand)[1], s * 0.055, 0, TAU);
  ctx.fillStyle = 'rgba(40,34,68,1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();

  // --- scarf ---------------------------------------------------------------
  const scarfAng = Math.PI * 0.45 + p.scarfA * 0.4;
  ribbonStrand(ctx, [neckPx[0] - s * 0.04, neckPx[1] + s * 0.03], scarfAng, s * (1.2 + p.scarfB * 0.5), s * 0.1, colors.main, 'rgba(255,255,255,0.9)', Math.sin(o.time * 4.1) * 1.1);
  ribbonStrand(
    ctx,
    [neckPx[0] - s * 0.01, neckPx[1] + s * 0.05],
    scarfAng - 0.2,
    s * (0.72 + p.scarfA * 0.3),
    s * 0.055,
    colors.deep,
    colors.main,
    Math.sin(o.time * 4.1 + 2) * 1.2,
  );

  // --- front leg -----------------------------------------------------------
  const legGrad = ctx.createLinearGradient(hipPx[0], hipPx[1], T(rig.frontFoot)[0], T(rig.frontFoot)[1]);
  legGrad.addColorStop(0, 'rgba(96,84,142,1)');
  legGrad.addColorStop(0.55, 'rgba(58,48,98,1)');
  legGrad.addColorStop(1, 'rgba(32,26,60,1)');
  jointCap(ctx, hipPx, s * 0.135, 'rgba(40,34,70,1)', 'rgba(5,5,14,1)');
  limb(ctx, hipPx, T(rig.frontKnee), s * 0.135, s * 0.105, legGrad, 'rgba(5,5,14,1)', colors.main);
  limb(
    ctx,
    T(rig.frontKnee),
    T(rig.frontFoot),
    s * 0.098,
    s * 0.068,
    legGrad,
    'rgba(5,5,14,1)',
    colors.main,
  );
  jointCap(ctx, T(rig.frontKnee), s * 0.105, 'rgba(38,32,66,1)', 'rgba(5,5,14,1)');
  kneeGuard(ctx, T(rig.frontKnee), s, colors.main, 1);
  drawBoot(ctx, T(rig.frontFoot), s, 1, colors.main, 1);

  // --- hip / belt ----------------------------------------------------------
  ctx.save();
  const beltAng = p.lean;
  ctx.translate(hipPx[0], hipPx[1]);
  ctx.rotate(beltAng);
  ctx.beginPath();
  ctx.roundRect(-s * 0.14, -s * 0.07, s * 0.29, s * 0.15, s * 0.05);
  ctx.fillStyle = 'rgba(30,26,56,1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,6,16,1)';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.stroke();
  // side skirt plates
  ctx.beginPath();
  ctx.moveTo(s * 0.1, -s * 0.05);
  ctx.lineTo(s * 0.21, s * 0.1);
  ctx.lineTo(s * 0.08, s * 0.16);
  ctx.closePath();
  ctx.fillStyle = 'rgba(24,20,46,1)';
  ctx.fill();
  ctx.strokeStyle = colors.deep;
  ctx.lineWidth = Math.max(0.8, s * 0.022);
  ctx.stroke();
  ctx.restore();

  // --- torso ---------------------------------------------------------------
  drawTorso(ctx, rig, s, colors, o.time, charge);

  // --- pauldron ------------------------------------------------------------
  drawPauldron(ctx, shoulderPx, p.lean, s, colors);

  // --- front arm + sword ---------------------------------------------------
  const faGrad = ctx.createLinearGradient(shoulderPx[0], shoulderPx[1], T(rig.frontHand)[0], T(rig.frontHand)[1]);
  faGrad.addColorStop(0, 'rgba(104,90,150,1)');
  faGrad.addColorStop(1, 'rgba(44,37,78,1)');
  jointCap(ctx, shoulderPx, s * 0.112, 'rgba(44,37,78,1)', 'rgba(5,5,14,1)');
  limb(ctx, shoulderPx, T(rig.frontElbow), s * 0.112, s * 0.09, faGrad, 'rgba(5,5,14,1)', colors.main);
  jointCap(ctx, T(rig.frontElbow), s * 0.09, 'rgba(44,37,78,1)', 'rgba(5,5,14,1)');
  limb(ctx, T(rig.frontElbow), T(rig.frontHand), s * 0.088, s * 0.064, faGrad, 'rgba(5,5,14,1)', 'rgba(255,255,255,0.4)');
  // elbow guard
  ctx.beginPath();
  ctx.ellipse(T(rig.frontElbow)[0], T(rig.frontElbow)[1], s * 0.055, s * 0.05, 0.4, 0, TAU);
  ctx.fillStyle = 'rgba(44,37,78,1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(0.8, s * 0.018);
  ctx.stroke();

  const handPx = T(rig.frontHand);
  ctx.beginPath();
  ctx.arc(handPx[0], handPx[1], s * 0.058, 0, TAU);
  ctx.fillStyle = 'rgba(52,44,88,1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();

  if (o.sword !== false) drawKatana(ctx, handPx, T(rig.tip), s, colors, charge, o.time);

  // --- head ----------------------------------------------------------------
  drawHead(ctx, headPx, rig.headTilt, s, colors, o.time, weapon);

  // --- weapon accoutrements ------------------------------------------------
  drawAccent(ctx, weapon, handPx, headPx, s, colors, o.time, charge);

  if (charge > 0.02 || ghost > 0.02) {
    const chest = T([
      (rig.shoulder[0] + rig.hip[0]) / 2,
      (rig.shoulder[1] + rig.hip[1]) / 2,
    ]);
    glowDisc(ctx, chest[0], chest[1], s * (0.6 + charge * 0.8), colors.main, colors.faint, 0.3 * (charge + ghost * 0.6));
  }

  ctx.restore();
  void dir;
}

function drawTorso(
  ctx: GfxCtx,
  rig: Rig,
  s: number,
  colors: { main: string; deep: string; faint: string },
  time: number,
  charge: number,
): void {
  const hip: V2 = [rig.hip[0] * s, -rig.hip[1] * s];
  const sh: V2 = [rig.shoulder[0] * s, -rig.shoulder[1] * s];
  const dx = sh[0] - hip[0];
  const dy = sh[1] - hip[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const wHip = s * 0.145;
  const wChest = s * 0.215;
  const wWaist = s * 0.12;

  // abdomen (dark underlayer)
  ctx.beginPath();
  ctx.moveTo(hip[0] + nx * wHip, hip[1] + ny * wHip);
  ctx.quadraticCurveTo(hip[0] + dx * 0.42 + nx * wWaist, hip[1] + dy * 0.42 + ny * wWaist, sh[0] + nx * wChest * 0.9, sh[1] + ny * wChest * 0.9);
  ctx.lineTo(sh[0] - nx * wChest * 0.9, sh[1] - ny * wChest * 0.9);
  ctx.quadraticCurveTo(hip[0] + dx * 0.42 - nx * wWaist, hip[1] + dy * 0.42 - ny * wWaist, hip[0] - nx * wHip, hip[1] - ny * wHip);
  ctx.closePath();
  const ag = ctx.createLinearGradient(hip[0], hip[1], sh[0], sh[1]);
  ag.addColorStop(0, 'rgba(30,25,56,1)');
  ag.addColorStop(1, 'rgba(44,37,78,1)');
  ctx.fillStyle = ag;
  ctx.fill();

  // chest plate
  const chestTop = 0.78;
  ctx.beginPath();
  ctx.moveTo(hip[0] + dx * 0.14 + nx * wHip * 0.95, hip[1] + dy * 0.14 + ny * wHip * 0.95);
  ctx.quadraticCurveTo(hip[0] + dx * 0.4 + nx * wWaist * 1.35, hip[1] + dy * 0.4 + ny * wWaist * 1.35, hip[0] + dx * chestTop + nx * wChest, hip[1] + dy * chestTop + ny * wChest);
  ctx.quadraticCurveTo(sh[0] + nx * wChest * 0.25, sh[1] + ny * wChest * 0.25, sh[0] - nx * wChest * 0.92, sh[1] - ny * wChest * 0.92);
  ctx.quadraticCurveTo(hip[0] + dx * 0.42 - nx * wWaist * 1.2, hip[1] + dy * 0.42 - ny * wWaist * 1.2, hip[0] + dx * 0.12 - nx * wHip, hip[1] + dy * 0.12 - ny * wHip);
  ctx.closePath();
  const cg = ctx.createLinearGradient(hip[0] - nx * wChest, hip[1], sh[0] + nx * wChest, sh[1]);
  cg.addColorStop(0, 'rgba(50,42,84,1)');
  cg.addColorStop(0.5, 'rgba(92,78,142,1)');
  cg.addColorStop(1, 'rgba(140,120,204,1)');
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(1.2, s * 0.032);
  ctx.stroke();

  // rim light along the leading edge
  ctx.beginPath();
  ctx.moveTo(hip[0] + dx * 0.16 + nx * wHip, hip[1] + dy * 0.16 + ny * wHip);
  ctx.quadraticCurveTo(hip[0] + dx * 0.44 + nx * wWaist * 1.35, hip[1] + dy * 0.44 + ny * wWaist * 1.35, sh[0] + nx * wChest * 0.98, sh[1] + ny * wChest * 0.98);
  ctx.strokeStyle = 'rgba(230,255,252,0.75)';
  ctx.lineWidth = Math.max(1.2, s * 0.026);
  ctx.stroke();

  // collar
  ctx.beginPath();
  ctx.moveTo(sh[0] + nx * wChest * 0.95, sh[1] + ny * wChest * 0.95);
  ctx.quadraticCurveTo(sh[0] + dx * 0.02, sh[1] + dy * 0.02 - s * 0.05, sh[0] - nx * wChest * 0.95, sh[1] - ny * wChest * 0.95);
  ctx.strokeStyle = colors.main;
  ctx.lineWidth = Math.max(1.2, s * 0.034);
  ctx.stroke();

  // chest seam + core
  const coreX = hip[0] + dx * 0.62;
  const coreY = hip[1] + dy * 0.62;
  ctx.beginPath();
  ctx.moveTo(coreX + nx * wChest * 0.62, coreY + ny * wChest * 0.62);
  ctx.lineTo(coreX + nx * wChest * 0.1, coreY + ny * wChest * 0.1);
  ctx.lineTo(coreX - nx * wChest * 0.35, coreY - ny * wChest * 0.35);
  ctx.strokeStyle = colors.deep;
  ctx.lineWidth = Math.max(1.4, s * 0.036);
  ctx.stroke();

  const pulse = 0.6 + 0.4 * Math.sin(time * 2.4);
  ctx.save();
  ctx.globalAlpha *= 0.75 + pulse * 0.25;
  glowDisc(ctx, coreX, coreY, s * (0.07 + charge * 0.14), '#ffffff', colors.main, 0.55);
  ctx.restore();

  // abdominal segment lines
  ctx.strokeStyle = 'rgba(90,80,140,0.45)';
  ctx.lineWidth = Math.max(0.8, s * 0.018);
  for (let i = 1; i <= 2; i++) {
    const u = 0.14 + i * 0.16;
    const bx = hip[0] + dx * u;
    const by = hip[1] + dy * u;
    ctx.beginPath();
    ctx.moveTo(bx + nx * wWaist * 1.05, by + ny * wWaist * 1.05);
    ctx.lineTo(bx - nx * wWaist * 1.0, by - ny * wWaist * 1.0);
    ctx.stroke();
  }
}

function drawPauldron(ctx: GfxCtx, at: V2, lean: number, s: number, colors: { main: string; deep: string }): void {
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.rotate(lean * 0.8);
  // layered plate
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, s * 0.02);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.16, s * 0.02, -s * 0.17);
  ctx.quadraticCurveTo(s * 0.24, -s * 0.15, s * 0.19, s * 0.04);
  ctx.quadraticCurveTo(s * 0.0, s * 0.1, -s * 0.18, s * 0.02);
  ctx.closePath();
  const g = ctx.createLinearGradient(-s * 0.2, -s * 0.16, s * 0.2, s * 0.06);
  g.addColorStop(0, 'rgba(96,84,156,1)');
  g.addColorStop(1, 'rgba(34,28,62,1)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(1.1, s * 0.03);
  ctx.stroke();
  // rim
  ctx.beginPath();
  ctx.moveTo(-s * 0.17, s * 0.0);
  ctx.quadraticCurveTo(-s * 0.18, -s * 0.15, s * 0.02, -s * 0.16);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(0.9, s * 0.02);
  ctx.stroke();
  // crest notch
  ctx.beginPath();
  ctx.moveTo(-s * 0.02, -s * 0.17);
  ctx.lineTo(s * 0.03, -s * 0.26);
  ctx.lineTo(s * 0.08, -s * 0.16);
  ctx.closePath();
  ctx.fillStyle = colors.deep;
  ctx.fill();
  ctx.strokeStyle = colors.main;
  ctx.lineWidth = Math.max(0.8, s * 0.02);
  ctx.stroke();
  ctx.restore();
}

function drawKatana(
  ctx: GfxCtx,
  hand: V2,
  tip: V2,
  s: number,
  colors: { main: string; deep: string },
  charge: number,
  time: number,
): void {
  const ang = Math.atan2(tip[1] - hand[1], tip[0] - hand[0]);
  const len = Math.hypot(tip[0] - hand[0], tip[1] - hand[1]);
  ctx.save();
  ctx.translate(hand[0], hand[1]);
  ctx.rotate(ang);

  // grip
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.035);
  ctx.lineTo(0, -s * 0.028);
  ctx.lineTo(0, s * 0.028);
  ctx.lineTo(-s * 0.2, s * 0.035);
  ctx.closePath();
  ctx.fillStyle = 'rgba(12,10,24,1)';
  ctx.fill();
  ctx.strokeStyle = colors.deep;
  ctx.lineWidth = Math.max(0.8, s * 0.018);
  ctx.stroke();

  // tsuba
  ctx.beginPath();
  ctx.ellipse(s * 0.015, 0, s * 0.022, s * 0.075, 0, 0, TAU);
  ctx.fillStyle = 'rgba(40,34,66,1)';
  ctx.fill();
  ctx.strokeStyle = colors.main;
  ctx.lineWidth = Math.max(1, s * 0.022);
  ctx.stroke();

  // blade
  const curve = s * 0.02;
  ctx.beginPath();
  ctx.moveTo(s * 0.03, -s * 0.022);
  ctx.quadraticCurveTo(len * 0.6, -s * 0.026 - curve, len, -s * 0.003);
  ctx.lineTo(len * 0.995, s * 0.002);
  ctx.quadraticCurveTo(len * 0.6, s * 0.009 + curve, s * 0.03, s * 0.021);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -s * 0.04, 0, s * 0.04);
  bg.addColorStop(0, 'rgba(255,255,255,0.4)');
  bg.addColorStop(0.45, 'rgba(160,180,225,0.2)');
  bg.addColorStop(1, 'rgba(110,130,190,0.14)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(225,240,255,0.7)';
  ctx.lineWidth = Math.max(0.7, s * 0.015);
  ctx.stroke();

  // glowing edge
  const eg = ctx.createLinearGradient(0, 0, len, 0);
  eg.addColorStop(0, 'rgba(255,255,255,0.5)');
  eg.addColorStop(0.5, '#ffffff');
  eg.addColorStop(1, colors.main);
  ctx.beginPath();
  ctx.moveTo(s * 0.05, -s * 0.019);
  ctx.quadraticCurveTo(len * 0.6, -s * 0.021 - curve, len * 0.99, -s * 0.002);
  ctx.strokeStyle = eg;
  ctx.lineWidth = Math.max(0.9, s * 0.02);
  ctx.stroke();

  // glint that sweeps down the blade
  const glint = ((time * 0.9) % 1) * len;
  ctx.save();
  ctx.globalAlpha *= 0.5;
  glowDisc(ctx, glint, -s * 0.02, s * 0.09, '#ffffff', colors.main, 0.8);
  ctx.restore();

  if (charge > 0.02) {
    glowDisc(ctx, len * 0.98, 0, s * 0.34 * charge, 'rgba(255,255,255,0.95)', colors.main, 0.55 * charge);
  }
  ctx.restore();
}

function drawHead(
  ctx: GfxCtx,
  at: V2,
  tilt: number,
  s: number,
  colors: { main: string; deep: string; faint: string },
  time: number,
  weapon: WeaponId,
): void {
  ctx.save();
  ctx.translate(at[0], at[1]);
  ctx.rotate(tilt);
  const r = s * 0.185;

  // neck
  ctx.beginPath();
  ctx.moveTo(-r * 0.34, r * 0.9);
  ctx.lineTo(r * 0.34, r * 0.9);
  ctx.lineTo(r * 0.28, r * 1.5);
  ctx.lineTo(-r * 0.28, r * 1.5);
  ctx.closePath();
  ctx.fillStyle = 'rgba(26,22,50,1)';
  ctx.fill();

  // swept horn crest (behind dome)
  ctx.beginPath();
  ctx.moveTo(-r * 0.15, -r * 0.7);
  ctx.quadraticCurveTo(-r * 1.6, -r * 1.75, -r * 2.9, -r * 0.7);
  ctx.quadraticCurveTo(-r * 1.4, -r * 0.78, -r * 0.55, -r * 0.12);
  ctx.closePath();
  const crestG = ctx.createLinearGradient(-r * 2.6, -r, 0, 0);
  crestG.addColorStop(0, 'rgba(12,9,26,1)');
  crestG.addColorStop(0.55, colors.deep);
  crestG.addColorStop(1, colors.main);
  ctx.fillStyle = crestG;
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(0.9, s * 0.022);
  ctx.stroke();

  // dome / faceplate
  ctx.beginPath();
  ctx.moveTo(-r * 0.86, r * 0.25);
  ctx.quadraticCurveTo(-r * 0.95, -r * 0.95, r * 0.15, -r * 1.05);
  ctx.quadraticCurveTo(r * 1.05, -r * 0.9, r * 1.02, r * 0.1);
  ctx.quadraticCurveTo(r * 0.9, r * 0.85, r * 0.1, r * 0.95);
  ctx.quadraticCurveTo(-r * 0.7, r * 0.9, -r * 0.86, r * 0.25);
  ctx.closePath();
  const hg = ctx.createLinearGradient(-r * 0.8, -r, r, r);
  hg.addColorStop(0, 'rgba(48,42,84,1)');
  hg.addColorStop(0.55, 'rgba(26,22,50,1)');
  hg.addColorStop(1, 'rgba(26,22,50,1)');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(1.1, s * 0.028);
  ctx.stroke();

  // top rim highlight
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.1);
  ctx.quadraticCurveTo(-r * 0.82, -r * 0.92, r * 0.16, -r * 0.98);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = Math.max(0.8, s * 0.018);
  ctx.stroke();

  // visor — a narrow slit, angled down toward the back
  ctx.beginPath();
  ctx.moveTo(r * 0.12, -r * 0.34);
  ctx.quadraticCurveTo(r * 0.7, -r * 0.36, r * 0.97, -r * 0.12);
  ctx.quadraticCurveTo(r * 0.78, -r * 0.06, r * 0.1, -r * 0.16);
  ctx.closePath();
  const vg = ctx.createLinearGradient(0, -r * 0.4, r, 0);
  vg.addColorStop(0, colors.deep);
  vg.addColorStop(0.55, colors.main);
  vg.addColorStop(1, '#ffffff');
  ctx.fillStyle = vg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(5,5,14,1)';
  ctx.lineWidth = Math.max(0.8, s * 0.02);
  ctx.stroke();

  // cheek vent slit
  ctx.beginPath();
  ctx.moveTo(r * 0.1, r * 0.18);
  ctx.lineTo(r * 0.56, r * 0.1);
  ctx.strokeStyle = 'rgba(5,5,14,0.9)';
  ctx.lineWidth = Math.max(1, s * 0.022);
  ctx.stroke();

  // jaw plate / vent
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, r * 0.42);
  ctx.lineTo(r * 0.62, r * 0.34);
  ctx.lineTo(r * 0.5, r * 0.72);
  ctx.lineTo(-r * 0.05, r * 0.78);
  ctx.closePath();
  ctx.fillStyle = 'rgba(18,16,36,1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,110,170,0.5)';
  ctx.lineWidth = Math.max(0.7, s * 0.014);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.0, r * 0.54);
  ctx.lineTo(r * 0.54, r * 0.44);
  ctx.strokeStyle = 'rgba(200,190,240,0.35)';
  ctx.stroke();

  // cheek rune
  ctx.beginPath();
  ctx.arc(-r * 0.4, r * 0.2, r * 0.1, 0, TAU);
  ctx.fillStyle = colors.deep;
  ctx.fill();

  // eye glow spill
  const pulse = 0.6 + 0.4 * Math.sin(time * 2.6);
  glowDisc(ctx, r * 0.5, -r * 0.16, r * 0.82 * pulse, 'rgba(255,255,255,0.35)', colors.main, 0.22);

  if (weapon === 4) {
    ctx.save();
    ctx.globalAlpha *= 0.85;
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = Math.max(0.7, s * 0.016);
    ctx.beginPath();
    ctx.arc(0, -r * 1.9, r * 0.2, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawAccent(
  ctx: GfxCtx,
  weapon: WeaponId,
  hand: V2,
  head: V2,
  s: number,
  colors: { main: string; deep: string; faint: string },
  time: number,
  charge: number,
): void {
  ctx.save();
  if (weapon === 2) {
    const bob = Math.sin(time * 3.4) * s * 0.05;
    const ox = hand[0] + s * 0.14;
    const oy = hand[1] - s * 0.34 + bob;
    glowDisc(ctx, ox, oy, s * 0.24, 'rgba(255,255,255,0.95)', colors.main, 0.75);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(0.8, s * 0.018);
    ctx.beginPath();
    ctx.arc(ox, oy, s * 0.32, time * 1.2, time * 1.2 + Math.PI * 1.2);
    ctx.stroke();
  } else if (weapon === 3) {
    ctx.translate(head[0] - s * 0.34, head[1] + s * 1.0);
    ctx.rotate(Math.sin(time * 1.1) * 0.1);
    ctx.globalAlpha *= 0.55 + 0.25 * Math.sin(time * 2.4);
    ctx.strokeStyle = colors.main;
    ctx.lineWidth = Math.max(1, s * 0.024);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * TAU;
      const x = Math.cos(a) * s * 0.2;
      const y = Math.sin(a) * s * 0.2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + time * 0.5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * s * 0.28, Math.sin(a) * s * 0.28, s * 0.03, 0, TAU);
      ctx.fillStyle = colors.main;
      ctx.fill();
    }
  } else if (weapon === 4) {
    for (let i = 0; i < 3; i++) {
      const a = time * 2.1 + (i / 3) * TAU;
      const rr = s * (0.28 + 0.05 * Math.sin(time * 3 + i));
      glowDisc(ctx, head[0] - s * 0.5 + Math.cos(a) * rr, head[1] + s * 1.2 + Math.sin(a) * rr * 0.35, s * 0.055, 'rgba(255,255,255,0.9)', colors.main, 0.6);
    }
  } else if (weapon === 5) {
    const shimmer = 0.35 + 0.2 * Math.sin(time * 5.3);
    ctx.globalAlpha = shimmer;
    for (const off of [-0.5, -0.72]) {
      ctx.beginPath();
      ctx.moveTo(head[0] + off * s, head[1] + s * 0.5);
      ctx.quadraticCurveTo(head[0] + (off - 0.5) * s, head[1] + s * 1.2, head[0] + (off - 0.1) * s, head[1] + s * 1.75);
      ctx.strokeStyle = colors.main;
      ctx.lineWidth = Math.max(1, s * 0.026);
      ctx.stroke();
    }
  }
  void charge;
  ctx.restore();
}

/** Big helmet bust for HUD portrait frames. */
export function drawPortrait(
  ctx: GfxCtx,
  x: number,
  y: number,
  size: number,
  faction: Faction,
  facing: number,
  time: number,
): void {
  const colors = factionColors(faction);
  ctx.save();
  ctx.translate(x, y + size * 0.3);
  ctx.scale(facing, 1);

  ctx.beginPath();
  ctx.arc(0, 0, size * 0.52, 0, TAU);
  ctx.fillStyle = 'rgba(7,5,18,0.95)';
  ctx.fill();
  ctx.strokeStyle = colors.main;
  ctx.lineWidth = Math.max(1.2, size * 0.022);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.455, 0, TAU);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.45, 0, TAU);
  ctx.clip();

  // shoulders
  ctx.beginPath();
  ctx.moveTo(-size * 0.5, size * 0.62);
  ctx.quadraticCurveTo(-size * 0.34, size * 0.12, 0, size * 0.1);
  ctx.quadraticCurveTo(size * 0.34, size * 0.12, size * 0.5, size * 0.62);
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, 0, 0, size * 0.6);
  sg.addColorStop(0, 'rgba(46,40,80,1)');
  sg.addColorStop(1, 'rgba(12,10,26,1)');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.strokeStyle = colors.main;
  ctx.lineWidth = Math.max(1, size * 0.016);
  ctx.stroke();

  ctx.translate(0, size * 0.06);
  drawHead(ctx, [0, 0], -0.03, size * 1.12, colors, time, 1);
  ctx.restore();
  ctx.restore();
}
