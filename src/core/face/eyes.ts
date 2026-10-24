import { hypot2 } from '../math/hypot.ts';
import type { ColorLike } from '../types/AvatarDefinition.ts';
import { registerAvatarOption } from '../registry/options.ts';
import { ScopedRegistry } from '../registry/ScopedRegistry.ts';
import { clamp } from '../math/Interpolation.ts';

/**
 * Eyes — renderer-agnostic part of the ONE 3D eye system. Eyes are embedded
 * in the body: each is the outward half of a soft, rounded 3D shape (a raised
 * relief conforming to the body surface at the eye anchor) with a thick
 * outline rim. They are rigidly attached to the body — gaze turns the whole
 * body, never the eyes. Presets only re-shape the eye itself (squash, rotation,
 * lid squash, arc bend) and blink squashes it shut.
 *
 * Eye shapes are 2D signed-distance functions (negative inside, shape units:
 * the larger half-extent is 1) plus a bevel width; renderers turn them into
 * relief meshes (height = depth · rounded profile of the inside distance), so
 * every edge is soft. Opt-in defaults (`installDefaultEyeShapes`): pill,
 * sphere, star, heart, cube.
 */

/** Default eye shapes installed by `installDefaultEyeShapes()` (more via `registerEyeShape`). */
export const DEFAULT_EYE_SHAPES = ['pill', 'sphere', 'star', 'heart', 'cube'] as const;
export type AvatarEyeShape = (typeof DEFAULT_EYE_SHAPES)[number] | (string & {});

/** Where the eyes sit on a body (body units, y relative to the body centre). Provided by the body. */
export interface AvatarEyeAnchor {
  y: number;
  /** Width available for the eye pair. */
  width: number;
  /** Height available for an eye. */
  height: number;
}

export const DEFAULT_ANCHOR: AvatarEyeAnchor = { y: 0.05, width: 1.2, height: 0.5 };

export interface AvatarEyesOptions {
  /** Eye shape (default 'pill'). */
  shape?: AvatarEyeShape;
  /** Centre spacing as a fraction of the anchor width (default 0.5). */
  spacing?: number;
  /** Eye half-height as a fraction of the anchor height (default 0.42). */
  size?: number;
  /** Vertical offset in anchor heights (default 0). */
  height?: number;
  /** Relief height as a fraction of the eye half-height (default 0.8; never lower than the body surface around it (e.g. fur)). */
  depth?: number;
  /** Resting lid closure 0..1 added to every preset (default 0). */
  lid?: number;
  /**
   * Eye colour (glossy), or 'auto' (default) = pure black or pure white,
   * whichever contrasts the live body colour better.
   */
  color?: ColorLike | 'auto';
  /** Outline colour, or 'auto' (default) = a contrast-aware shade of the body colour (darker on light bodies, lighter on dark ones). */
  outline?: ColorLike | 'auto';
  /** Outline thickness in eye units (fraction of the eye half-size; default 0.2, 0 = none). */
  outlineWidth?: number;
  /**
   * Pupil: the outermost (viewer-facing) surface of the eye shows the colour
   * opposite to the eye colour (black ↔ white; custom colours → contrasting
   * black / white). Default false.
   */
  pupil?: boolean;
  /** 'fill' (default) = a smaller same-shape cap on the dome; 'edge' = a crisp ring tracing the shape. */
  pupilStyle?: 'fill' | 'edge';
  /**
   * Coloured (non-neutral) eye colours follow the body colour as a relative
   * hue/shade offset (default true). `false` keeps the authored colours.
   */
  tint?: boolean;
}

export type ResolvedEyesOptions = Required<Omit<AvatarEyesOptions, 'tint'>> & { tint: boolean };

/** Neutral eye defaults (plain round domes). Families register their own via `registerAvatarFamilyDefaults`. */
export const DEFAULT_EYES: ResolvedEyesOptions = {
  shape: 'sphere',
  spacing: 0.5,
  size: 0.32,
  height: 0,
  depth: 0.5,
  lid: 0,
  color: 'auto',
  outline: 'auto',
  outlineWidth: 0.1,
  pupil: false,
  pupilStyle: 'fill',
  tint: true,
};

// ---------------------------------------------------------------- shapes (2D SDF)

export type EyeSdf = (x: number, y: number) => number;

/** Geometry handed to a 2D (SVG) eye-shape renderer; coordinates in the avatar's canvas units. */
export interface EyeSvgArgs {
  cx: number;
  cy: number;
  /** Full width / height (before openness). */
  w: number;
  h: number;
  /** Height after openness (h · max(0.1, openness), min 1). */
  currentH: number;
  halfW: number;
  halfH: number;
  openness: number;
  color: string;
  stroke?: string;
  strokeW?: number;
  /** Pre-built ` transform="…"` / stroke attributes ('' when none). */
  transformAttr: string;
  strokeAttr: string;
}

/** Renders one eye of a shape as SVG markup (scene-graph / SVG renderers). */
export type EyeSvgRenderer = (args: EyeSvgArgs) => string;

/**
 * One eye shape, with one representation per renderer kind: an `sdf` (+ bevel)
 * for 3D relief eyes and/or an `svg` renderer for 2D eyes.
 */
export interface EyeShapeSpec {
  /** Signed distance (negative inside), shape units. Normalised on registration. */
  sdf?: EyeSdf;
  /** Width of the rounded edge (shape units; large = dome, small = flat top with a soft bevel). Required with `sdf`. */
  bevel?: number;
  /** 2D SVG renderer. */
  svg?: EyeSvgRenderer;
}

/** Normalised SDF eye shape (3D renderers). */
export interface EyeShapeInfo {
  sdf: EyeSdf;
  bevel: number;
  /** Half extents after normalisation (larger one = 1). */
  extent: { x: number; y: number };
}

interface EyeShapeEntry {
  relief?: EyeShapeInfo;
  svg?: EyeSvgRenderer;
}

const shapes = new ScopedRegistry<EyeShapeEntry>();

/** Bounding box of `sdf < 0` by sampling (domain ±4). */
function sdfBounds(sdf: EyeSdf): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const n = 400;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = -4 + (8 * i) / n, y = -4 + (8 * j) / n;
      if (sdf(x, y) < 0) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
  return { x0, x1, y0, y1 };
}

/**
 * Register (or replace) an eye shape. An `sdf` is centred and scaled so its
 * larger half-extent is 1 (the bevel scales with it). `family` scopes the
 * shape to one avatar family (default: shared). Shared SDF shapes are
 * published as the 'eyeShape' option (studio pickers of 3D families).
 */
export function registerEyeShape(name: string, spec: EyeShapeSpec, family?: string): void {
  const entry: EyeShapeEntry = { svg: spec.svg };
  if (spec.sdf) {
    const b = sdfBounds(spec.sdf);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2;
    const s = 1 / Math.max(hx, hy, 1e-6);
    const raw = spec.sdf;
    entry.relief = { sdf: (x, y) => raw(x / s + cx, y / s + cy) * s, bevel: (spec.bevel ?? 0.5) * s, extent: { x: hx * s, y: hy * s } };
  }
  shapes.set(name, entry, family);
  if (entry.relief && !family) registerAvatarOption('eyeShape', name);
}

/** Eye shapes visible to `family` with the given representation (default 'sdf' = 3D relief shapes). */
export function listEyeShapes(family?: string, kind: 'sdf' | 'svg' = 'sdf'): string[] {
  return shapes.names(family).filter((n) => (kind === 'sdf' ? shapes.get(n, family)?.relief : shapes.get(n, family)?.svg));
}

const reliefOf = (name: string | undefined, family?: string) => shapes.get(name ?? '', family)?.relief;

/** SDF shape info (unknown → the default shape; the default shapes are installed on demand if none are). */
export function getEyeShape(name: string | undefined, family?: string): EyeShapeInfo {
  const hit = reliefOf(name, family) ?? reliefOf(DEFAULT_EYES.shape, family);
  if (hit) return hit;
  installDefaultEyeShapes();
  return reliefOf(name, family) ?? reliefOf(DEFAULT_EYES.shape, family)!;
}

/** SVG renderer of a shape (scoped to `family` first), if it has one. */
export function getEyeShapeSvg(name: string, family?: string): EyeSvgRenderer | undefined {
  return shapes.get(name, family)?.svg;
}

/** Rounded relief profile: 0 at the edge, 1 once `bevel` inside (quarter circle → no sharp edge). */
export function eyeReliefProfile(insideDistance: number, bevel: number): number {
  const t = Math.min(1, Math.max(0, insideDistance / Math.max(1e-6, bevel)));
  return Math.sqrt(1 - (1 - t) * (1 - t));
}

const len = (x: number, y: number) => hypot2(x, y);

let defaultShapesInstalled = false;

/** Opt-in: register the default eye shapes (pill, sphere, cube, star, heart). Idempotent. */
export function installDefaultEyeShapes(): void {
  if (defaultShapesInstalled) return;
  defaultShapesInstalled = true;
  registerEyeShape('sphere', { sdf: (x, y) => len(x, y) - 1, bevel: 1 });
  registerEyeShape('pill', {
    sdf: (x, y) => {
      const a = 0.42, r = 0.58;
      return len(x, y - Math.max(-a, Math.min(a, y))) - r;
    },
    bevel: 0.58,
  });
  registerEyeShape('cube', {
    sdf: (x, y) => {
      const b = 0.86, rc = 0.3;
      const qx = Math.abs(x) - b + rc, qy = Math.abs(y) - b + rc;
      return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc;
    },
    bevel: 0.42,
  });
  registerEyeShape('star', {
    // iq's sdStar5, softened (rounded tips and valleys)
    sdf: (x0, y0) => {
      const k1x = 0.809016994375, k1y = -0.587785252292;
      const k2x = -k1x, k2y = k1y;
      let x = Math.abs(x0), y = y0;
      let d = 2 * Math.max(k1x * x + k1y * y, 0);
      x -= d * k1x; y -= d * k1y;
      d = 2 * Math.max(k2x * x + k2y * y, 0);
      x -= d * k2x; y -= d * k2y;
      x = Math.abs(x);
      y -= 1;
      const rf = 0.52;
      const bax = rf * -k1y, bay = rf * k1x - 1;
      const h = Math.max(0, Math.min(1, (x * bax + y * bay) / (bax * bax + bay * bay)));
      return len(x - bax * h, y - bay * h) * Math.sign(y * bax - x * bay) - 0.09;
    },
    bevel: 0.32,
  });
  registerEyeShape('heart', {
    // iq's sdHeart (point at the bottom, two lobes on top), slightly rounded
    sdf: (x0, y0) => {
      const x = Math.abs(x0), y = y0;
      const dot2 = (a: number, b: number) => a * a + b * b;
      if (y + x > 1) return Math.sqrt(dot2(x - 0.25, y - 0.75)) - Math.SQRT2 / 4 - 0.04;
      const m = 0.5 * Math.max(x + y, 0);
      return Math.sqrt(Math.min(dot2(x, y - 1), dot2(x - m, y - m))) * Math.sign(x - y) - 0.04;
    },
    bevel: 0.4,
  });
}

// ---------------------------------------------------------------- poses

/**
 * One eye's shape pose (eye frame: x right, y up, shape spans about ±1).
 * Lids squash the eye into the open window (no cut): 0 = open, 0.5 = to the
 * middle; upper + lower >= 1 is shut. Nothing here moves the eye on the body.
 */
export interface EyePose {
  upper: number;
  lower: number;
  /** Uniform eye scale. */
  scale: number;
  /** Squash. */
  sx: number;
  sy: number;
  /** Eye rotation in radians, mirrored per side (+ = outer corner up). */
  rot: number;
  /** Upper-lid tilt in radians, mirrored per side (+ = outer corners down: sad; - = inner down: angry). */
  tilt: number;
  /** Arc bend: + bows the eye up in the middle (happy ^), - bows it down (◡). */
  arc: number;
}

export interface EyePosePair {
  left: EyePose;
  right: EyePose;
}

export const NEUTRAL_EYE: Readonly<EyePose> = { upper: 0, lower: 0, scale: 1, sx: 1, sy: 1, rot: 0, tilt: 0, arc: 0 };

const eye = (p: Partial<EyePose> = {}): EyePose => ({ ...NEUTRAL_EYE, ...p });
const both = (p: Partial<EyePose>): EyePosePair => ({ left: eye(p), right: eye(p) });

const poses = new ScopedRegistry<EyePosePair>();

/**
 * Register (or override) the eye pose of a preset. A single pose applies to both
 * eyes. `family` scopes it to one avatar family (default: shared).
 */
export function registerEyePose(preset: string, pose: Partial<EyePose> | { left: Partial<EyePose>; right: Partial<EyePose> }, family?: string): void {
  const pair = 'left' in pose && 'right' in pose ? { left: eye(pose.left), right: eye(pose.right) } : both(pose as Partial<EyePose>);
  poses.set(preset, pair, family);
}

/** Registered presets visible to `family` (shared + scoped). */
export function listEyePoses(family?: string): string[] {
  return poses.names(family);
}

// 'neutral' is always present (fallback preset).
registerEyePose('neutral', {});

let defaultPosesInstalled = false;

/** Opt-in: register the default preset vocabulary (happy, sad, wink, love…). Idempotent. */
export function installDefaultEyePoses(): void {
  if (defaultPosesInstalled) return;
  defaultPosesInstalled = true;
  registerEyePose('look', { sx: 0.92, sy: 1.05, rot: 0.08, tilt: 0.06 }); // a sideways glance, expressed by shape only
  registerEyePose('happy', { lower: 0.42, arc: 0.55, sx: 1.08 }); // ^ ^ smiling squint
  registerEyePose('joyful', { lower: 0.5, arc: 0.75, sx: 1.12, rot: 0.1 }); // big ^ ^
  registerEyePose('content', { upper: 0.3, lower: 0.2, arc: -0.45 }); // ◡ ◡
  registerEyePose('curious', { scale: 0.82, sx: 1.04 }); // • •
  registerEyePose('calm', { upper: 0.42, lower: 0.3, arc: -0.2 }); // — —
  registerEyePose('sleepy', { upper: 0.58, lower: 0.04, sx: 1.06 });
  registerEyePose('surprised', { scale: 1.16, sx: 1.06, sy: 1.1 }); // o o
  registerEyePose('excited', { scale: 1.14, sy: 1.04, rot: 0.06 }); // ✧ ✧
  registerEyePose('sparkle', { scale: 1.1, rot: 0.1 });
  registerEyePose('wink', { left: {}, right: { upper: 0.5, lower: 0.44, arc: 0.6 } });
  registerEyePose('playful', { left: { scale: 1.05 }, right: { upper: 0.46, lower: 0.4, rot: -0.18 } }); // ● ━
  registerEyePose('determined', { upper: 0.34, lower: 0.22, tilt: -0.36, rot: -0.1 }); // > <
  registerEyePose('sad', { upper: 0.28, tilt: 0.36, arc: -0.15 });
  registerEyePose('angry', { upper: 0.34, tilt: -0.42, scale: 0.94 });
  registerEyePose('love', { scale: 1.14, lower: 0.08, arc: 0.12 });
}

/** Base pose of a preset (unknown presets → neutral). Returns a copy, or fills `out` (per-frame scratch). */
export function eyePoseForPreset(preset: string, family?: string, out?: EyePosePair): EyePosePair {
  const p = poses.get(preset, family) ?? poses.get('neutral', family)!;
  if (!out) return { left: { ...p.left }, right: { ...p.right } };
  Object.assign(out.left, p.left);
  Object.assign(out.right, p.right);
  return out;
}

/**
 * Add a preset eye pose RELATIVELY onto `base` (in place): each eye gains
 * weight x (overlay eye - neutral), so the live preset stays underneath.
 * `mirror` applies the overlay's left eye to the right eye and vice versa.
 */
export function overlayEyePose(base: EyePosePair, overlay: { pose: string; weight: number; mirror?: boolean }, family?: string): EyePosePair {
  const w = Math.max(0, Math.min(1, overlay.weight));
  if (w <= 0) return base;
  const o = eyePoseForPreset(overlay.pose, family);
  const src = overlay.mirror ? { left: o.right, right: o.left } : o;
  for (const side of ['left', 'right'] as const) {
    for (const key of KEYS) base[side][key] += (src[side][key] - NEUTRAL_EYE[key]) * w;
  }
  return base;
}

export interface EyePoseInputs {
  /** Blink 0..1. */
  blink?: number;
  /** Resting upper-lid closure. */
  lid?: number;
}


/** Apply resting lid and blink to one eye of a (possibly tweened) base pose. */
export function composeEyePose(base: EyePose, inp: EyePoseInputs, out: EyePose = eye()): EyePose {
  Object.assign(out, base);
  const lid = inp.lid ?? 0;
  // resting lid only ever closes further
  out.upper = clamp(base.upper + lid * (1 - Math.max(0, base.upper)), -0.2, 1);
  out.lower = clamp(base.lower, 0, 1);
  const b = clamp(inp.blink ?? 0, 0, 1);
  if (b > 0) {
    // lids meet where they would at rest proportions (happy squints close upward)
    const open = Math.max(0, 1 - out.upper - out.lower);
    const share = out.upper + out.lower > 0 ? clamp(out.upper / (out.upper + out.lower), 0.2, 0.8) : 0.6;
    out.upper += open * b * share;
    out.lower += open * b * (1 - share);
  }
  return out;
}

/** Pose for a preset + live inputs (both eyes). */
export function resolveEyePose(preset: string, inp: EyePoseInputs = {}): EyePosePair {
  const p = eyePoseForPreset(preset);
  return { left: composeEyePose(p.left, inp), right: composeEyePose(p.right, inp) };
}

const KEYS = Object.keys(NEUTRAL_EYE) as (keyof EyePose)[];

/** Frame-rate independent ease of `cur` toward `target` (rate ≈ 1/s). Returns true while still moving. */
export function easeEyePose(cur: EyePose, target: EyePose, dt: number, rate = 14): boolean {
  const k = 1 - Math.exp(-dt * rate);
  let moving = false;
  for (const key of KEYS) {
    const d = target[key] - cur[key];
    if (Math.abs(d) > 1e-4) moving = true;
    cur[key] += d * k;
  }
  return moving;
}

export function lerpEyePose(a: EyePose, b: EyePose, k: number, out: EyePose = eye()): EyePose {
  for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

/**
 * Eye-local deformation of a pose: maps a shape point (x, y) to the posed
 * point, and the relief height factor. Shared by renderers (mesh) and the
 * surface clearing, e.g. fur (inverse). `sgn` mirrors per side (+1 left eye, -1 right eye).
 */
export interface EyeShapeTransform {
  /** Scaled half extents (after scale · squash). */
  W: number;
  H: number;
  sx: number;
  sy: number;
  cos: number;
  sin: number;
  /** Open window: upper-lid line yu = yu0 + slope·x, lower-lid line yl0. */
  yu0: number;
  yl0: number;
  slope: number;
  /** Arc bend amplitude (eye units). */
  bend: number;
  /** Relief height factor (flattens as the eye closes). */
  zf: number;
}

export function eyeShapeTransform(P: EyePose, sgn: number, extent: { x: number; y: number }, out = {} as EyeShapeTransform): EyeShapeTransform {
  const k = Math.max(1e-3, P.scale);
  out.sx = P.sx * k;
  out.sy = P.sy * k;
  out.W = out.sx * extent.x;
  out.H = out.sy * extent.y;
  const a = -sgn * P.rot;
  out.cos = Math.cos(a);
  out.sin = Math.sin(a);
  const up = clamp(P.upper, -0.3, 1);
  const lo = clamp(P.lower, 0, 1);
  out.yu0 = out.H * (1 - 2 * up);
  out.yl0 = -out.H * (1 - 2 * lo);
  out.slope = sgn * Math.tan(clamp(P.tilt, -0.9, 0.9)) * 0.6;
  out.bend = P.arc * out.H * 0.55;
  const open = clamp(1 - up - lo, 0, 1.3);
  out.zf = 0.18 + 0.82 * Math.sqrt(Math.min(1, open));
  return out;
}

/** Apply an eye transform to a shape point (writes [x, y]). */
export function applyEyeShapeTransform(T: EyeShapeTransform, x: number, y: number, out: [number, number] = [0, 0]): [number, number] {
  const x1 = x * T.sx, y1 = y * T.sy;
  const x2 = T.cos * x1 - T.sin * y1;
  const y2 = T.sin * x1 + T.cos * y1;
  const yu = T.yu0 + T.slope * x2;
  const win = Math.max(yu - T.yl0, 0.03 * T.H);
  const xn = Math.max(-1, Math.min(1, x2 / Math.max(1e-3, T.W)));
  out[0] = x2;
  out[1] = T.yl0 + ((y2 + T.H) / (2 * T.H)) * win + T.bend * (1 - xn * xn);
  return out;
}

/** Inverse of `applyEyeShapeTransform` (posed point → shape point). */
export function invertEyeShapeTransform(T: EyeShapeTransform, X: number, Y: number, out: [number, number] = [0, 0]): [number, number] {
  const xn = Math.max(-1, Math.min(1, X / Math.max(1e-3, T.W)));
  const yu = T.yu0 + T.slope * X;
  const win = Math.max(yu - T.yl0, 0.03 * T.H);
  const y2 = ((Y - T.bend * (1 - xn * xn) - T.yl0) / win) * 2 * T.H - T.H;
  const x1 = T.cos * X + T.sin * y2;
  const y1 = -T.sin * X + T.cos * y2;
  out[0] = x1 / T.sx;
  out[1] = y1 / T.sy;
  return out;
}

/** Eye placement on a body: half spacing, radius (eye half-size, body units) and centre height (anchor units). */
export function eyeLayout(anchor: AvatarEyeAnchor, opts: AvatarEyesOptions = {}): { halfSpacing: number; radius: number; y: number } {
  const o = { ...DEFAULT_EYES, ...opts };
  const radius = o.size * Math.min(anchor.height, anchor.width * 0.6);
  const ex = getEyeShape(o.shape).extent.x;
  // keep the two eyes (with their outlines) apart
  const halfSpacing = Math.max((o.spacing * anchor.width) / 2, radius * (ex + o.outlineWidth) * 1.28);
  return { halfSpacing, radius, y: anchor.y + o.height * anchor.height };
}
