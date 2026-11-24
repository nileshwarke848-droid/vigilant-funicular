import { damp, easeOutCubic, easeOutQuint, lerp, TAU } from './math';

export interface Ease {
  kind: 'easeOutCubic' | 'easeOutQuint' | 'linear';
  duration: number;
}

/**
 * A keyed pose track: an ordered list of poses with eased transitions.
 * Used for one-shot animation overlays (attack wind-ups, recoils, deaths).
 */
export interface Track<T extends object> {
  keys: Array<{ at: number; pose: T }>;
}

export function track<T extends object>(): Track<T> {
  return { keys: [] };
}

/** Sample a track at local time t (seconds since trigger). Returns null when finished. */
export function sampleTrack<T extends object>(
  tr: { readonly keys: ReadonlyArray<{ readonly at: number; readonly pose: T }> },
  t: number,
): { pose: T; done: boolean } | null {
  if (tr.keys.length === 0) return null;
  let total = 0;
  for (const k of tr.keys) total = Math.max(total, k.at);
  if (t < 0) return { pose: tr.keys[0].pose, done: false };
  if (t >= total) return { pose: tr.keys[tr.keys.length - 1].pose, done: true };

  let prev = tr.keys[0];
  let next = tr.keys[tr.keys.length - 1];
  for (let i = 0; i < tr.keys.length; i++) {
    if (tr.keys[i].at <= t) {
      prev = tr.keys[i];
      next = tr.keys[Math.min(tr.keys.length - 1, i + 1)];
    }
  }
  const span = Math.max(0.0001, next.at - prev.at);
  const u = easeOutCubic((t - prev.at) / span);
  const pose = {} as T;
  for (const key of Object.keys(prev.pose) as (keyof T)[]) {
    const a = prev.pose[key] as unknown as number;
    const b = next.pose[key] as unknown as number;
    (pose as Record<string, number>)[key as string] = lerp(a, b, u);
  }
  return { pose, done: false };
}

/**
 * Joint layout of the vector fighter. Units are "stage pixels" at scale 1.
 * Character is 1.78 units tall; drawn with hip at the fighter's feet-height.
 */
export interface Pose {
  hipX: number;
  hipY: number;
  lean: number;
  headTilt: number;
  frontKnee: number;
  backKnee: number;
  frontThigh: number;
  backThigh: number;
  torso: number; // torso length multiplier
  frontArm: number;
  frontArmBend: number;
  backArm: number;
  backArmBend: number;
  weaponAngle: number;
  cape: number;
  crouch: number;
  scarfA: number;
  scarfB: number;
}

export const BASE_POSE: Pose = {
  hipX: 0,
  hipY: 1.02,
  lean: 0.12,
  headTilt: 0,
  frontKnee: 0.12,
  backKnee: -0.18,
  frontThigh: 0.18,
  backThigh: -0.28,
  torso: 1,
  frontArm: 0.28,
  frontArmBend: 0.6,
  backArm: -0.2,
  backArmBend: 0.8,
  weaponAngle: -0.5,
  cape: 0.2,
  crouch: 0,
  scarfA: 0.4,
  scarfB: 0.7,
};

export function pose(overrides: Partial<Pose>): Pose {
  return { ...BASE_POSE, ...overrides };
}

// --- Shared pose vocabulary -------------------------------------------------

export const POSES: Record<string, Pose> = {
  idleA: pose({
    hipY: 1.04,
    lean: 0.1,
    headTilt: 0.02,
    frontThigh: 0.16,
    frontKnee: 0.14,
    backThigh: -0.24,
    backKnee: -0.2,
    frontArm: 0.42,
    frontArmBend: 0.9,
    backArm: 0.1,
    backArmBend: 0.7,
    weaponAngle: 1.15,
    cape: 0.16,
  }),
  idleB: pose({
    hipY: 0.99,
    lean: 0.13,
    headTilt: -0.04,
    frontThigh: 0.2,
    frontKnee: 0.16,
    backThigh: -0.3,
    backKnee: -0.24,
    frontArm: 0.4,
    frontArmBend: 0.95,
    backArm: 0.06,
    backArmBend: 0.75,
    weaponAngle: 1.05,
    cape: 0.22,
  }),
  run: pose({
    hipY: 1.0,
    lean: 0.34,
    frontThigh: 0.85,
    frontKnee: 0.12,
    backThigh: -0.75,
    backKnee: -0.9,
    frontArm: 0.85,
    frontArmBend: 1.25,
    backArm: -0.7,
    backArmBend: 1.1,
    weaponAngle: 1.9,
    cape: 0.75,
    scarfA: 0.85,
    scarfB: 1.05,
  }),
  runBack: pose({
    hipY: 1.04,
    lean: -0.12,
    frontThigh: -0.45,
    frontKnee: 0.05,
    backThigh: 0.35,
    backKnee: -0.5,
    frontArm: 0.35,
    frontArmBend: 1.0,
    backArm: 0.3,
    backArmBend: 0.9,
    weaponAngle: 0.7,
    cape: -0.35,
    scarfA: -0.2,
    scarfB: 0.1,
  }),
  airRise: pose({
    hipY: 1.05,
    lean: 0.2,
    frontThigh: 0.75,
    frontKnee: 0.35,
    backThigh: -0.85,
    backKnee: -1.15,
    frontArm: 0.7,
    frontArmBend: 0.9,
    backArm: -0.5,
    backArmBend: 0.8,
    weaponAngle: 1.5,
    cape: 0.95,
    scarfA: 1.0,
    scarfB: 1.3,
  }),
  airFall: pose({
    hipY: 1.06,
    lean: 0.08,
    frontThigh: 0.35,
    frontKnee: 0.45,
    backThigh: -0.3,
    backKnee: -0.55,
    frontArm: 0.5,
    frontArmBend: 0.55,
    backArm: -0.2,
    backArmBend: 1.2,
    weaponAngle: 1.0,
    cape: 0.5,
    scarfA: 0.65,
    scarfB: 0.9,
  }),
  crouch: pose({
    hipY: 0.74,
    lean: 0.3,
    frontThigh: 1.15,
    frontKnee: 0.45,
    backThigh: -0.9,
    backKnee: -1.35,
    frontArm: 0.8,
    frontArmBend: 1.5,
    backArm: 0.2,
    backArmBend: 1.3,
    weaponAngle: 1.6,
    cape: -0.1,
    crouch: 0.3,
  }),
  slashWind: pose({
    hipY: 1.0,
    lean: -0.08,
    frontThigh: 0.55,
    frontKnee: 0.2,
    backThigh: -0.7,
    backKnee: -0.45,
    frontArm: 2.5,
    frontArmBend: 0.15,
    backArm: 0.9,
    backArmBend: 1.2,
    weaponAngle: 2.3,
    cape: 0.35,
    scarfA: 0.9,
    scarfB: 1.2,
  }),
  slashCut: pose({
    hipY: 0.9,
    lean: 0.55,
    frontThigh: 0.95,
    frontKnee: 0.25,
    backThigh: -0.9,
    backKnee: -0.3,
    frontArm: -0.7,
    frontArmBend: 0.05,
    backArm: -0.5,
    backArmBend: 0.6,
    weaponAngle: -1.35,
    cape: 0.8,
    scarfA: 1.1,
    scarfB: 1.4,
  }),
  castWind: pose({
    hipY: 1.06,
    lean: -0.14,
    frontThigh: 0.3,
    frontKnee: 0.12,
    backThigh: -0.42,
    backKnee: -0.3,
    frontArm: 1.4,
    frontArmBend: 0.5,
    backArm: 0.5,
    backArmBend: 1.5,
    weaponAngle: 1.2,
    cape: -0.2,
    scarfA: -0.1,
    scarfB: 0.3,
  }),
  castRelease: pose({
    hipY: 0.99,
    lean: 0.3,
    frontThigh: 0.6,
    frontKnee: 0.18,
    backThigh: -0.65,
    backKnee: -0.5,
    frontArm: 0.05,
    frontArmBend: 0.05,
    backArm: -0.2,
    backArmBend: 1.4,
    weaponAngle: 0.1,
    cape: 0.6,
    scarfA: 0.7,
    scarfB: 1.1,
  }),
  guard: pose({
    hipY: 0.94,
    lean: 0.22,
    frontThigh: 0.45,
    frontKnee: 0.25,
    backThigh: -0.55,
    backKnee: -0.6,
    frontArm: 1.85,
    frontArmBend: 1.65,
    backArm: 1.4,
    backArmBend: 1.5,
    weaponAngle: 1.75,
    cape: 0.25,
    scarfA: 0.55,
    scarfB: 0.85,
  }),
  hurt: pose({
    hipY: 1.02,
    lean: -0.42,
    headTilt: 0.35,
    frontThigh: 0.1,
    frontKnee: 0.05,
    backThigh: -0.35,
    backKnee: -0.15,
    frontArm: -1.1,
    frontArmBend: 0.4,
    backArm: -1.4,
    backArmBend: 0.5,
    weaponAngle: -2.2,
    cape: -0.6,
    scarfA: -0.5,
    scarfB: -0.2,
  }),
  phase: pose({
    hipY: 1.0,
    lean: 0.5,
    frontThigh: 1.0,
    frontKnee: 0.2,
    backThigh: -1.2,
    backKnee: -0.35,
    frontArm: -1.9,
    frontArmBend: 0.3,
    backArm: -2.1,
    backArmBend: 0.2,
    weaponAngle: -2.6,
    cape: 1.3,
    scarfA: 1.5,
    scarfB: 1.7,
  }),
  dead: pose({
    hipY: 0.45,
    lean: 1.2,
    headTilt: 0.7,
    frontThigh: 1.5,
    frontKnee: 1.2,
    backThigh: 1.1,
    backKnee: 0.3,
    frontArm: 1.4,
    frontArmBend: 0.2,
    backArm: 1.2,
    backArmBend: 0.1,
    weaponAngle: 1.6,
    cape: -0.6,
    scarfA: -0.4,
    scarfB: -0.1,
  }),
};

/** One-shot overlays layered over the locomotion pose. */
export const OVERLAYS = {
  slash: {
    keys: [
      { at: 0.0, pose: POSES.slashWind },
      { at: 0.13, pose: POSES.slashWind },
      { at: 0.22, pose: POSES.slashCut },
      { at: 0.52, pose: POSES.slashCut },
    ],
  },
  cast: {
    keys: [
      { at: 0.0, pose: POSES.castWind },
      { at: 0.14, pose: POSES.castWind },
      { at: 0.24, pose: POSES.castRelease },
      { at: 0.46, pose: POSES.castRelease },
    ],
  },
  guard: {
    keys: [
      { at: 0.0, pose: POSES.guard },
      { at: 0.1, pose: POSES.guard },
      { at: 0.3, pose: POSES.guard },
    ],
  },
  hurt: {
    keys: [
      { at: 0.0, pose: POSES.hurt },
      { at: 0.18, pose: POSES.hurt },
      { at: 0.34, pose: BASE_POSE },
    ],
  },
  phase: {
    keys: [
      { at: 0.0, pose: POSES.phase },
      { at: 0.16, pose: POSES.phase },
      { at: 0.36, pose: BASE_POSE },
    ],
  },
  dead: {
    keys: [
      { at: 0.0, pose: POSES.hurt },
      { at: 0.28, pose: POSES.dead },
      { at: 0.6, pose: POSES.dead },
    ],
  },
} as const;

/** Blend two poses. `t` 0 = a, 1 = b. */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = {} as Pose;
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    out[k] = lerp(a[k], b[k], t);
  }
  return out;
}

/**
 * Analytic locomotion pose. Runs in the browser and headless: fully deterministic.
 * `phase` is the gait cycle (radians), `speed01` blends idle<->run,
 * `vy` picks rise/fall in air, `land` squashes on touchdown.
 */
export function locomotionPose(opts: {
  vx: number;
  vy: number;
  grounded: boolean;
  phase: number;
  idleBreath: number;
  landing: number;
  facing: number;
}): Pose {
  const { vx, vy, grounded, phase, idleBreath, landing, facing } = opts;
  const speed01 = Math.min(1, Math.abs(vx) / 320);

  const idle = blendPose(POSES.idleA, POSES.idleB, 0.5 + 0.5 * Math.sin(idleBreath));

  if (!grounded) {
    const rise = vy < -60;
    const air = rise ? POSES.airRise : POSES.airFall;
    const g = Math.min(1, Math.abs(vy) / 700);
    const p = blendPose(idle, air, 0.35 + 0.65 * g);
    p.cape += 0.25 * (rise ? 1 : -0.4);
    p.lean += 0.08 * (vx / 320) * facing;
    return p;
  }

  const moving = speed01 > 0.08;
  const stride = Math.sin(phase);
  const stride2 = Math.sin(phase + Math.PI);

  if (!moving) {
    // weight shift + breathing
    const p = blendPose(idle, POSES.crouch, Math.max(0, landing) * 0.55);
    p.hipY -= Math.abs(Math.sin(phase * 0.5)) * 0.012 * (1 - landing);
    p.lean += 0.02 * Math.sin(idleBreath * 0.7);
    return p;
  }

  const run =
    vx * facing >= 0
      ? {
          ...POSES.run,
          frontThigh: POSES.run.frontThigh * stride + 0.1,
          backThigh: POSES.run.backThigh * -stride2 + 0.1,
          frontKnee: POSES.run.frontKnee - Math.max(0, stride) * 0.55,
          backKnee: POSES.run.backKnee + Math.max(0, stride2) * 0.55,
          frontArm: POSES.run.frontArm * stride2 * 0.7,
          backArm: POSES.run.backArm * stride * 0.7,
          hipY: POSES.run.hipY - Math.abs(stride) * 0.06 - Math.max(0, landing) * 0.25,
          cape: POSES.run.cape + 0.15 * Math.sin(phase * 0.7),
        }
      : {
          ...POSES.runBack,
          frontThigh: POSES.runBack.frontThigh * stride,
          backThigh: POSES.runBack.backThigh * -stride2,
          hipY: POSES.runBack.hipY - Math.abs(stride) * 0.04 - Math.max(0, landing) * 0.25,
          cape: POSES.runBack.cape + 0.15 * Math.sin(phase * 0.7),
        };

  return blendPose(idle, run, Math.min(1, speed01 * 1.4));
}

/** Sample a hue-shifted tint for afterimages etc. (kept numeric, no CSS). */
export function smokeOffset(t: number, seed: number): number {
  return Math.sin(t * 1.7 + seed * 4.1) * 8 + Math.sin(t * 0.7 + seed * 9.3) * 4;
}

export const ANIM = {
  gaitHz: 2.35,
  breathHz: 0.55,
  capeHz: 1.3,
  dampGround: 14,
  dampAir: 5,
  squashRecover: 6.5,
  overlayIn: 18,
  overlayOut: 9,
};

export function overlayBlendWeight(w: number, age: number, dur: number): number {
  const fadeIn = easeOutQuint(Math.min(1, age * 30));
  const fadeOut = age > dur - 0.12 ? easeOutCubic(Math.max(0, (dur - age) / 0.12)) : 1;
  return w * fadeIn * fadeOut;
}

/** Small idle sway used by the arena lights / dust so scenes breathe. */
export function sway(t: number, seed: number, amp = 1): number {
  return Math.sin(t * (0.4 + (seed % 7) * 0.09) + seed * 2.1) * amp;
}

/** Utility for periodic pulse 0..1 with offset, used by trap seams and embers. */
export function pulse(t: number, period: number, offset = 0): number {
  const u = ((t / period + offset) % 1 + 1) % 1;
  return 0.5 - 0.5 * Math.cos(u * TAU);
}

export function approach(current: number, target: number, rate: number, dt: number): number {
  return damp(current, target, rate, dt);
}
