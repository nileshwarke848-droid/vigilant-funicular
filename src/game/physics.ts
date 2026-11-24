import { FLOOR_Y, VIEW_W } from '../gfx/ctx';
import { clamp } from '../gfx/math';

export interface Body {
  x: number;
  y: number; // feet
  vx: number;
  vy: number;
  grounded: boolean;
  facing: 1 | -1;
  width: number;
  height: number;
}

export const PHYS = {
  walkSpeed: 300,
  accel: 2600,
  friction: 2400,
  airAccel: 1500,
  gravity: 2300,
  jumpVel: 830,
  maxFall: 1250,
  coyote: 0.09,
  jumpBuffer: 0.1,
  jumpCutMul: 0.45,
  dropTime: 0.22,
};

export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  oneWay: boolean;
}

export interface Tuning {
  walkSpeed?: number;
  accel?: number;
  airAccel?: number;
  friction?: number;
  gravity?: number;
  jumpVel?: number;
}

export interface StepInput {
  move: -1 | 0 | 1;
  jump: boolean;
  jumpHeld: boolean;
  down: boolean;
}

export interface StepResult {
  jumped: boolean;
  landed: boolean;
  droppedThrough: boolean;
  landingSpeed: number;
}

/** Vertical + horizontal integration with one-way platform support. */
export function stepPhysics(
  b: Body,
  input: StepInput,
  platforms: Platform[],
  dt: number,
  st: { coyote: number; buffer: number; dropTimer: number; jumpCut?: boolean },
  tune: Tuning = {},
): StepResult {
  const walk = tune.walkSpeed ?? PHYS.walkSpeed;
  const accel = tune.accel ?? PHYS.accel;
  const airAccel = tune.airAccel ?? PHYS.airAccel;
  const friction = tune.friction ?? PHYS.friction;
  const gravity = tune.gravity ?? PHYS.gravity;
  const jumpVel = tune.jumpVel ?? PHYS.jumpVel;

  const res: StepResult = { jumped: false, landed: false, droppedThrough: false, landingSpeed: 0 };

  // horizontal
  const target = input.move * walk;
  const a = b.grounded ? accel : airAccel;
  if (input.move !== 0) {
    b.vx += clamp(target - b.vx, -a * dt, a * dt);
  } else if (b.grounded) {
    const decel = friction * dt;
    b.vx = Math.abs(b.vx) <= decel ? 0 : b.vx - Math.sign(b.vx) * decel;
  }

  // timers
  st.coyote = b.grounded ? PHYS.coyote : Math.max(0, st.coyote - dt);
  st.buffer = input.jump ? PHYS.jumpBuffer : Math.max(0, st.buffer - dt);
  st.dropTimer = Math.max(0, st.dropTimer - dt);

  // drop through one-way platform
  if (input.down && input.jump && b.grounded) {
    let onOneWay = false;
    for (const p of platforms) {
      if (!p.oneWay) continue;
      if (Math.abs(b.y - p.y) < 3 && b.x + b.width / 2 > p.x && b.x - b.width / 2 < p.x + p.w) onOneWay = true;
    }
    if (onOneWay) {
      st.dropTimer = PHYS.dropTime;
      st.buffer = 0;
      b.grounded = false;
      b.y += 3;
      res.droppedThrough = true;
    }
  }

  // jump
  if (st.buffer > 0 && st.coyote > 0 && !res.droppedThrough) {
    b.vy = -jumpVel;
    b.grounded = false;
    st.buffer = 0;
    st.coyote = 0;
    st.jumpCut = false;
    res.jumped = true;
  }
  // variable height: releasing early clips upward velocity once
  if (!input.jumpHeld && b.vy < 0 && !st.jumpCut) {
    b.vy *= PHYS.jumpCutMul;
    st.jumpCut = true;
  }

  // gravity
  if (!b.grounded) {
    b.vy = Math.min(b.vy + gravity * dt, PHYS.maxFall);
  }

  // vertical move + ground collision
  const prevY = b.y;
  b.y += b.vy * dt;
  if (b.vy >= 0 && st.dropTimer <= 0) {
    for (const p of platforms) {
      const withinX = b.x + b.width * 0.34 > p.x && b.x - b.width * 0.34 < p.x + p.w;
      if (!withinX) continue;
      if (prevY <= p.y + 0.5 && b.y >= p.y) {
        b.y = p.y;
        if (!b.grounded) {
          res.landed = true;
          res.landingSpeed = b.vy;
        }
        b.vy = 0;
        b.grounded = true;
        break;
      }
    }
  }
  if (b.vy !== 0) b.grounded = false;
  if (b.y >= FLOOR_Y) {
    if (b.y > FLOOR_Y) {
      if (!b.grounded) {
        res.landed = true;
        res.landingSpeed = b.vy;
      }
      b.y = FLOOR_Y;
      b.vy = 0;
      b.grounded = true;
    }
  }

  // horizontal move + walls
  b.x += b.vx * dt;
  b.x = clamp(b.x, 56, VIEW_W - 56);

  return res;
}
