/**
 * Palette + canvas environment interface.
 *
 * The whole visual layer draws through `GfxCtx`, which is a structural subset of
 * CanvasRenderingContext2D. That lets every drawing module run headless (Node +
 * @napi-rs/canvas) for screenshot tests and visual regression, and in the browser
 * with zero adaptation code.
 */

export interface GfxGradient {
  addColorStop(offset: number, color: string): void;
}

export interface GfxCtx {
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number, counterclockwise?: boolean): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    start: number,
    end: number,
  ): void;
  rect(x: number, y: number, w: number, h: number): void;
  roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GfxGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): GfxGradient;
  createPattern(image: unknown, repetition: string): unknown;
  drawImage(image: never, dx: number, dy: number, dw?: number, dh?: number): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number };
  putImageData(data: { data: Uint8ClampedArray; width: number; height: number }, x: number, y: number): void;
  createImageData(w: number, h: number): { data: Uint8ClampedArray; width: number; height: number };
  globalAlpha: number;
  globalCompositeOperation: string;
  fillStyle: string | GfxGradient | unknown;
  strokeStyle: string | GfxGradient | unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  filter: string;
  imageSmoothingEnabled: boolean;
}

export const VIEW_W = 1280;
export const VIEW_H = 720;

/** Stage floor surface (top of the ground platform). */
export const FLOOR_Y = 604;
export const WORLD_SCALE = 1.1;
export const FIGHTER_SCALE = 76;

export type Palette = {
  ink: string;
  void: string;
  stone: string;
  stoneLit: string;
  stoneEdge: string;
  haze: string;
  player: string;
  playerDeep: string;
  replica: string;
  replicaDeep: string;
  gold: string;
  white: string;
};

export const PALETTE: Palette = {
  ink: '#05030e',
  void: '#07040f',
  stone: '#141024',
  stoneLit: '#221a3c',
  stoneEdge: '#3a2d63',
  haze: '#120a2c',
  player: '#53f5e4',
  playerDeep: '#0e6d68',
  replica: '#ff4f9a',
  replicaDeep: '#6d1a44',
  gold: '#ffd178',
  white: '#f4f1ff',
};

export type Faction = 'player' | 'replica';

export function factionColors(f: Faction): { main: string; deep: string; faint: string } {
  return f === 'player'
    ? { main: PALETTE.player, deep: PALETTE.playerDeep, faint: 'rgba(83,245,228,0.18)' }
    : { main: PALETTE.replica, deep: PALETTE.replicaDeep, faint: 'rgba(255,79,154,0.18)' };
}

/** Draw a soft glow disc without shadowBlur (cheap, works everywhere). */
export function glowDisc(
  ctx: GfxCtx,
  x: number,
  y: number,
  radius: number,
  colorCore: string,
  colorEdge: string,
  alpha = 1,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.001, radius));
  g.addColorStop(0, colorCore);
  g.addColorStop(0.45, colorEdge);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Screen-space bloom pass.
 *
 * The scene is authored on a 640x360 world canvas and upscaled 2x, so we can
 * run a real blur on the tiny buffer for almost nothing and composite it back
 * additively. This is what gives blades, bolts, embers and trap seams their
 * glow without paying per-primitive shadowBlur costs.
 */
export interface BloomPipeline {
  scene: never;
  sceneCtx: GfxCtx;
  bloom: never;
  bloomCtx: GfxCtx;
  bloomW: number;
  bloomH: number;
}

export function createBloomPipeline(
  makeCanvas: (w: number, h: number) => { canvas: { width: number; height: number }; ctx: GfxCtx },
): BloomPipeline {
  const scene = makeCanvas(VIEW_W / 2, VIEW_H / 2);
  const bloom = makeCanvas(VIEW_W / 4, VIEW_H / 4);
  return {
    scene: scene.canvas as never,
    sceneCtx: scene.ctx,
    bloom: bloom.canvas as never,
    bloomCtx: bloom.ctx,
    bloomW: VIEW_W / 4,
    bloomH: VIEW_H / 4,
  };
}

const SCENE_W = VIEW_W / 2;
const SCENE_H = VIEW_H / 2;

/** Render the world into the half-res buffer, then upscale with bloom. */
export function compositeBloom(
  dst: GfxCtx,
  pipe: BloomPipeline,
  intensity = 0.85,
  thresholdTint = 'rgba(255,255,255,1)',
): void {
  const b = pipe.bloomCtx;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalCompositeOperation = 'source-over';
  b.globalAlpha = 1;
  b.clearRect(0, 0, pipe.bloomW, pipe.bloomH);
  b.fillStyle = '#000';
  b.fillRect(0, 0, pipe.bloomW, pipe.bloomH);
  b.filter = 'blur(3px) brightness(1.35) saturate(1.25)';
  b.drawImage(pipe.scene, 0, 0, pipe.bloomW, pipe.bloomH);
  b.filter = 'none';

  dst.save();
  dst.imageSmoothingEnabled = true;
  dst.globalCompositeOperation = 'source-over';
  dst.drawImage(pipe.scene, 0, 0, VIEW_W, VIEW_H);
  dst.globalCompositeOperation = 'lighter';
  dst.globalAlpha = intensity;
  dst.drawImage(pipe.bloom, 0, 0, VIEW_W, VIEW_H);
  dst.globalAlpha = 1;
  dst.restore();
  void thresholdTint;
  void SCENE_W;
  void SCENE_H;
}
