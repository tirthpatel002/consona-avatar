import * as THREE from 'three';
import { installDefaultEyeShapes } from '../../../../core/face/eyes.ts';
import type { EyePose, EyeShapeInfo, EyeShapeTransform, AvatarEyesOptions, ResolvedEyesOptions } from '../../../../core/face/eyes.ts';
import { DEFAULT_EYES, NEUTRAL_EYE, applyEyeShapeTransform, composeEyePose, easeEyePose, eyePoseForPreset, eyeReliefProfile, eyeShapeTransform, overlayEyePose, getEyeShape, listEyeShapes } from '../../../../core/face/eyes.ts';
import { COLOR_SPRING, PROP_SPRING, Spring } from '../../../../core/math/Spring.ts';
import { ColorSpring, colorToRgb } from '../../../../core/color/color.ts';
import { contrastBorder, contrastEyeColor } from '../../../../core/color/tint.ts';
import type { Rgb } from '../../../../core/color/color.ts';
import { EYE_SDF_DOMAIN, EYE_SDF_RANGE } from './furEyeMask.ts';

/** Per-frame scratch (eye placement). */
const PLACE_TY = new THREE.Vector3();
const PLACE_N = new THREE.Vector3();

/** Inputs a relief eye's geometry depends on (see `Eye.built`). */
const BUILD_INPUTS = 14;
/** Change below which an input counts as unchanged (geometry rebuilds are skipped). */
const INPUT_EPS = 5e-5;
/** 1 when `v` moved by at least `INPUT_EPS` from `prev[i]` (or `prev[i]` is unset), else 0. */
const stale = (prev: Float64Array, i: number, v: number): number => (Math.abs(prev[i]! - v) < INPUT_EPS ? 0 : 1);

/**
 * The ONE 3D eye rig (Three adapter). Eyes are embedded in the body surface:
 * each eye is the outward half of a soft rounded shape — a relief whose base
 * follows the body's curvature at the eye anchor (no gap, nothing behind it)
 * — plus a thick outline rim in a contrasting body shade. They are rigidly attached
 * to the body (children of the procedural body group, they ride jelly and
 * morphs); gaze never moves them. Presets re-shape the eye only (squash,
 * rotation, lid squash, arc bend); blink closes the outline over the eyeball
 * as a 3D eyelid (see `posLid`).
 *
 * Meshes, materials and geometries persist for the rig's lifetime: every
 * shape uses the same vertex layout (a radial grid fitted to the shape's
 * outline), so a shape swap only rewrites the template arrays.
 *
 * Shapes come from the renderer-agnostic registry (`registerEyeShape`: a 2D
 * SDF + bevel); the relief height is a rounded profile of the inside
 * distance, so every edge is soft. The fur is cleared under each eye's
 * footprint (shape-exact, via an SDF texture) with a tight soft margin.
 */

/** Surface sampler in body space: front-most hit at (x, y) along -z. */
export type SurfaceSampler = (x: number, y: number, point: THREE.Vector3, normal: THREE.Vector3) => boolean;

export interface EyeFrame {
  dt: number;
  preset: string;
  blink: number;
  /** Behavior eye-pose overlay (e.g. the wink behavior), added relatively to the preset pose. */
  eyeOverlay?: { pose: string; weight: number; mirror?: boolean } | null;
  /** Re-sample the body surface this frame (body/layout moving). */
  resample: boolean;
  /** Live body colour (sRGB 0..1), for the 'auto' outline. */
  body: Rgb;
  /** Body-relative tint for eye colours (sRGB 0..1); identity when omitted. */
  tint?: (c: Rgb) => Rgb;
  /** Fur strand length (body units, incl. boosts) for the clearing margin. */
  furLength: number;
}

// radial grid resolution (same for every shape → persistent buffers)
const SEG = 112;
const RINGS = 14;
/** Lid rings spread over the eyeball (they slide inward on a blink) + rings of the outline band. */
const LID_RINGS = 14;
const BAND_RINGS = 6;
const RIM_RINGS = LID_RINGS + BAND_RINGS;
/** Lid thickness over the eyeball (relative to the eye relief) and the soft rolled lid lip width (fraction of the radius). */
const LID_THICK = 0.07;
const LID_LIP = 0.16;
const RIM_INNER = 0.8;
/** Outline relief height relative to the eye's. */
const RIM_HEIGHT = 0.3;
const SDF_RES = 128;
/** Pupil patch rings (persistent grid; radii animate between fill / edge). */
const PUP_RINGS = 8;
const PUP_VERTS = PUP_RINGS * SEG;
/** Pupil radius fractions of the eye boundary: fill cap outer radius, edge ring outer radius / width. */
const PUP_FILL = 0.52;
const PUP_EDGE_OUT = 0.66;
const PUP_EDGE_W = 0.12;

function pupIndex(): number[] {
  const idx: number[] = [];
  for (let k = 0; k < PUP_RINGS - 1; k++) {
    const a = k * SEG, b = (k + 1) * SEG;
    for (let j = 0; j < SEG; j++) {
      const j1 = (j + 1) % SEG;
      idx.push(a + j, b + j, b + j1, a + j, b + j1, a + j1);
    }
  }
  return idx;
}

/**
 * Pupil patch radii (fractions of the boundary) for visibility `amount` 0..1
 * and style mix `edge` 0 (fill) .. 1 (edge ring). Scales in from the centre
 * (fill) / grows its width (edge), so toggling animates without a pop.
 */
export function pupilRadii(amount: number, edge: number, out: { inner: number; outer: number } = { inner: 0, outer: 0 }): { inner: number; outer: number } {
  const a = Math.max(0, Math.min(1, amount));
  const e = Math.max(0, Math.min(1, edge));
  // fill scales in from the centre; edge keeps its outer radius and grows its width
  const outer = PUP_FILL * (0.35 + 0.65 * a) * (1 - e) + PUP_EDGE_OUT * e;
  const inner = e * Math.max(0, PUP_EDGE_OUT - PUP_EDGE_W * a);
  out.inner = Math.min(inner, outer);
  out.outer = outer;
  return out;
}

interface ShapeTemplate {
  info: EyeShapeInfo;
  /** Eye relief: xy (2 per vertex) + height. */
  exy: Float32Array;
  eh: Float32Array;
  sdfTex: THREE.DataTexture;
  /** Boundary radius of the shape per angle column (SEG). */
  rb: Float32Array;
  rims: Map<number, RimTemplate>;
}

interface RimTemplate {
  /** Outer band radius per angle column. */
  r1: Float32Array;
  /** Scratch: posed outline xy + height (rebuilt per blink value). */
  rxy: Float32Array;
  rh: Float32Array;
}

/** Eye relief (profile units) at radius fraction `rho` (0 centre .. 1 boundary) of angle column `j`. */
function reliefAt(t: ShapeTemplate, j: number, rho: number): number {
  if (rho >= 1) return 0;
  // ring k sits at rho = sin(pi/2 · k/RINGS)
  const kf = (Math.asin(Math.max(0, Math.min(1, rho))) / (Math.PI / 2)) * RINGS;
  const k0 = Math.floor(kf), f = kf - k0;
  const h = (k: number) => (k <= 0 ? t.eh[0]! : k >= RINGS ? 0 : t.eh[1 + (k - 1) * SEG + j]!);
  return h(k0) * (1 - f) + h(k0 + 1) * f;
}

const smooth = (e0: number, e1: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};

/** First radius along `dir` where sdf crosses `level` (shapes are star-shaped about the origin). */
function radiusAt(info: EyeShapeInfo, a: number, level: number): number {
  const c = Math.cos(a), s = Math.sin(a);
  let lo = 0, hi = 0;
  for (let r = 0.01; r < 3; r += 0.01) {
    if (info.sdf(c * r, s * r) >= level) {
      hi = r;
      break;
    }
    lo = r;
  }
  if (!hi) return lo;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (info.sdf(c * m, s * m) >= level) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}

function eyeIndex(): number[] {
  const idx: number[] = [];
  // centre fan
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + j, 1 + ((j + 1) % SEG));
  for (let k = 1; k < RINGS; k++) {
    const a = 1 + (k - 1) * SEG, b = 1 + k * SEG;
    for (let j = 0; j < SEG; j++) {
      const j1 = (j + 1) % SEG;
      idx.push(a + j, b + j, b + j1, a + j, b + j1, a + j1);
    }
  }
  return idx;
}

function rimIndex(): number[] {
  const idx: number[] = [];
  for (let k = 0; k < RIM_RINGS - 1; k++) {
    const a = k * SEG, b = (k + 1) * SEG;
    for (let j = 0; j < SEG; j++) {
      const j1 = (j + 1) % SEG;
      idx.push(a + j, b + j, b + j1, a + j, b + j1, a + j1);
    }
  }
  return idx;
}

const EYE_VERTS = 1 + RINGS * SEG;
const RIM_VERTS = RIM_RINGS * SEG;

const templates = new Map<string, ShapeTemplate>();

function template(name: string): ShapeTemplate {
  let t = templates.get(name);
  if (t) return t;
  const info = getEyeShape(name);
  const exy = new Float32Array(EYE_VERTS * 2);
  const eh = new Float32Array(EYE_VERTS);
  const rb = new Float32Array(SEG);
  eh[0] = eyeReliefProfile(-info.sdf(0, 0), info.bevel);
  for (let j = 0; j < SEG; j++) {
    const a = (j / SEG) * Math.PI * 2;
    const R = radiusAt(info, a, 0);
    rb[j] = R;
    for (let k = 1; k <= RINGS; k++) {
      // denser toward the edge, where the rounded bevel curves
      const s = Math.sin((Math.PI / 2) * (k / RINGS));
      const i = 1 + (k - 1) * SEG + j;
      const x = Math.cos(a) * R * s, y = Math.sin(a) * R * s;
      exy[i * 2] = x;
      exy[i * 2 + 1] = y;
      eh[i] = k === RINGS ? 0 : eyeReliefProfile(-info.sdf(x, y), info.bevel);
    }
  }
  // SDF texture for the fur clearing (shape units over ±EYE_SDF_DOMAIN)
  const data = new Uint8Array(SDF_RES * SDF_RES);
  for (let y = 0; y < SDF_RES; y++)
    for (let x = 0; x < SDF_RES; x++) {
      const px = ((x + 0.5) / SDF_RES - 0.5) * 2 * EYE_SDF_DOMAIN;
      const py = ((y + 0.5) / SDF_RES - 0.5) * 2 * EYE_SDF_DOMAIN;
      const d = info.sdf(px, py) / EYE_SDF_RANGE + 0.5;
      data[y * SDF_RES + x] = Math.round(Math.min(1, Math.max(0, d)) * 255);
    }
  const sdfTex = new THREE.DataTexture(data, SDF_RES, SDF_RES, THREE.RedFormat, THREE.UnsignedByteType);
  sdfTex.magFilter = THREE.LinearFilter;
  sdfTex.minFilter = THREE.LinearFilter;
  sdfTex.wrapS = sdfTex.wrapT = THREE.ClampToEdgeWrapping;
  sdfTex.needsUpdate = true;
  t = { info, exy, eh, rb, sdfTex, rims: new Map() };
  templates.set(name, t);
  return t;
}

function rimTemplate(t: ShapeTemplate, w: number): RimTemplate {
  const key = Math.round(w * 1000);
  let r = t.rims.get(key);
  if (r) return r;
  const r1 = new Float32Array(SEG);
  for (let j = 0; j < SEG; j++) r1[j] = w > 0 ? radiusAt(t.info, (j / SEG) * Math.PI * 2, w) : t.rb[j]!;
  r = { r1, rxy: new Float32Array(RIM_VERTS * 2), rh: new Float32Array(RIM_VERTS) };
  t.rims.set(key, r);
  posLid(t, r, 0);
  return r;
}

/**
 * Pose the outline + eyelid for blink `b` (0 open .. 1 shut). The outline IS
 * the lid: its inner edge slides in from every direction at once along each
 * angle column (so it follows the shape's points / lobes), riding just above
 * the eyeball dome with a soft rolled lip that tucks under the dome at the
 * leading edge; at b = 1 the lid meets in the middle and covers the eye.
 * At b = 0 the layout equals the plain outline band (inner edge under the eye).
 */
function posLid(t: ShapeTemplate, r: RimTemplate, b: number): void {
  const { rxy, rh, r1 } = r;
  const close = smooth(0, 1, b);
  const rho0 = RIM_INNER * (1 - close);
  const blend = smooth(0, 0.12, b);
  const shut = smooth(0.85, 1, b);
  for (let j = 0; j < SEG; j++) {
    const a = (j / SEG) * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    const Rb = t.rb[j]!, R1 = r1[j]!;
    for (let k = 0; k < RIM_RINGS; k++) {
      const i = k * SEG + j;
      let R: number, band: number;
      if (k < LID_RINGS) {
        // lid rings: rho0 .. 1 over the eyeball (denser near the leading edge)
        const u = k / LID_RINGS;
        const rho = rho0 + (1 - rho0) * (1 - (1 - u) * (1 - u));
        R = rho * Rb;
        band = RIM_HEIGHT;
        if (blend > 0) {
          const lipT = (rho - rho0) / LID_LIP;
          const lip = Math.max(Math.sqrt(Math.max(0, Math.min(1, lipT))), shut);
          const cover = reliefAt(t, j, rho) + LID_THICK * lip - (1 - lip) * 0.08;
          band = band * (1 - blend) + Math.max(RIM_HEIGHT * (1 - blend * (1 - lip)), cover) * blend;
        }
      } else {
        // outline band: boundary .. outer edge, flat then rolling off softly
        const u = (k - LID_RINGS + 1) / BAND_RINGS;
        R = Rb + (R1 - Rb) * u;
        const v = Math.max(0, (u - 0.3) / 0.7);
        band = RIM_HEIGHT * Math.sqrt(Math.max(0, 1 - v * v));
      }
      rxy[i * 2] = c * R;
      rxy[i * 2 + 1] = sn * R;
      rh[i] = band;
    }
  }
}

function makeGeometry(count: number, index: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(index);
  return g;
}

/** Local surface frame + quadratic fit of the body around one eye. */
interface SurfaceFrame {
  c: THREE.Vector3;
  t1: THREE.Vector3;
  t2: THREE.Vector3;
  n: THREE.Vector3;
  /** Height along n of the surface at tangent coords (u, v): a·u + b·v + cu·u² + cv·v². */
  a: number;
  b: number;
  cu: number;
  cv: number;
}

class Eye {
  readonly mesh: THREE.Mesh;
  readonly rim: THREE.Mesh;
  readonly material: THREE.MeshPhysicalMaterial;
  readonly rimMaterial: THREE.MeshStandardMaterial;
  readonly pupil: THREE.Mesh;
  readonly pupilMaterial: THREE.MeshPhysicalMaterial;
  /** Eased preset pose (no blink) and the shown pose (with blink). */
  readonly pose: EyePose = { ...NEUTRAL_EYE };
  readonly shown: EyePose = { ...NEUTRAL_EYE };
  readonly maskPose: EyePose = { ...NEUTRAL_EYE };
  readonly T = {} as EyeShapeTransform;
  readonly maskT = {} as EyeShapeTransform;
  readonly side: 'left' | 'right';
  readonly sgn: number;
  readonly frame: SurfaceFrame = { c: new THREE.Vector3(), t1: new THREE.Vector3(1, 0, 0), t2: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1), a: 0, b: 0, cu: 0, cv: 0 };
  /** Inputs of the last geometry build (see `stale`). */
  readonly built = new Float64Array(BUILD_INPUTS).fill(NaN);

  constructor(side: 'left' | 'right', eyeIdx: number[], rimIdx: number[], pupIdx: number[]) {
    this.side = side;
    // mirrored per side: + = outer corner on the left eye is -x
    this.sgn = side === 'left' ? 1 : -1;
    this.material = new THREE.MeshPhysicalMaterial({ color: 0x15161c, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 });
    this.rimMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
    this.mesh = new THREE.Mesh(makeGeometry(EYE_VERTS, eyeIdx), this.material);
    this.mesh.name = `eye-${side}`;
    this.rim = new THREE.Mesh(makeGeometry(RIM_VERTS, rimIdx), this.rimMaterial);
    this.rim.name = `eye-${side}-outline`;
    // crisp, glossy, on the dome (own mesh: never part of the fur), fades in/out
    this.pupilMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.pupil = new THREE.Mesh(makeGeometry(PUP_VERTS, pupIdx), this.pupilMaterial);
    this.pupil.name = `eye-${side}-pupil`;
    this.pupil.visible = false;
    for (const m of [this.mesh, this.rim, this.pupil]) m.frustumCulled = false;
  }
}

/** Per-eye placement handed to an `EyeClearing` hook. */
export interface EyeClearingEye {
  frame: { c: THREE.Vector3; t1: THREE.Vector3; t2: THREE.Vector3; n: THREE.Vector3 };
  shape: EyeShapeTransform;
}

/**
 * Optional hook that clears whatever covers the body under the eyes (the
 * fur-shells part provides one: `furEyeClearing(layers.mask)`).
 */
export interface EyeClearing {
  /** Current eye shape SDF texture. */
  setShape(sdf: THREE.Texture): void;
  /** Eye frames + preset shape (no blink) and the clearing margin. */
  update(eyes: EyeClearingEye[], margin: { radius: number; outline: number; lift: number }): void;
}

/** Two persistent, body-embedded eyes. */
export class EyeRig {
  readonly group = new THREE.Group();
  readonly eyes: [Eye, Eye];
  private shapeName: string;
  private tpl: ShapeTemplate;
  private rimTpl: RimTemplate;
  private readonly defaults: ResolvedEyesOptions;
  private opts: ResolvedEyesOptions;
  private readonly lay = {
    hs: new Spring(0.3, PROP_SPRING),
    r: new Spring(0.2, PROP_SPRING),
    y: new Spring(0, PROP_SPRING),
    lid: new Spring(0, PROP_SPRING),
    depth: new Spring(DEFAULT_EYES.depth, PROP_SPRING),
    pup: new Spring(0, PROP_SPRING),
    pupEdge: new Spring(0, PROP_SPRING),
  };
  private readonly laySprings: readonly Spring[] = Object.values(this.lay);
  /** Explicit eye / outline colours (skipped while 'auto' — those follow the body spring). */
  private readonly eyeCol = new ColorSpring('#15161c', COLOR_SPRING);
  private readonly rimCol = new ColorSpring('#333333', COLOR_SPRING);
  private eyeColAuto = true;
  private rimColAuto = true;
  /** Pupil patch scratch (shape xy + relief height), rebuilt per radii. */
  private readonly pxy = new Float32Array(PUP_VERTS * 2);
  private readonly ph = new Float32Array(PUP_VERTS);
  private readonly pupCol = new THREE.Color(1, 1, 1);
  private pupColInit = false;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpN = new THREE.Vector3();
  private readonly sp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly xy: [number, number] = [0, 0];
  private readonly cA = new THREE.Color();
  private placed = false;
  /** Layout (half spacing, radius, height) of the last placement (see `stale`). */
  private readonly placedLay = new Float64Array(3).fill(NaN);
  private geoVersion = 0;
  private readonly sampleBody: SurfaceSampler;
  private readonly mask: EyeClearing | null;
  /** Per-frame scratch for `updateMask` (frames/shapes are stable per Eye). */
  private readonly maskEyes: EyeClearingEye[] = [];
  /** Per-frame scratch base pose (refilled by `eyePoseForPreset`). */
  private readonly basePose = eyePoseForPreset('neutral');
  /** Per-frame scratch pupil radii. */
  private readonly prOut = { inner: 0, outer: 0 };
  /** Live body colour the cached 'auto' eye / rim colours were computed from. */
  private readonly autoBody: Rgb = [-1, -1, -1];
  private autoEye: Rgb = [0, 0, 0];
  private autoRim: Rgb = [0, 0, 0];

  /** `clearing`: optional hook that clears the body surface (e.g. fur) under each eye. */
  /** `defaults`: initial eye options (e.g. the definition's resolved eyes); falls back to the neutral `DEFAULT_EYES`. */
  constructor(sampleBody: SurfaceSampler, clearing: EyeClearing | null = null, defaults: Partial<ResolvedEyesOptions> = {}) {
    this.sampleBody = sampleBody;
    this.mask = clearing;
    this.defaults = { ...DEFAULT_EYES, ...defaults };
    this.opts = { ...this.defaults };
    this.lay.depth.snap(this.defaults.depth);
    this.group.name = 'eyes';
    this.shapeName = this.resolve(this.defaults.shape);
    this.tpl = template(this.shapeName);
    this.rimTpl = rimTemplate(this.tpl, this.defaults.outlineWidth);
    const ei = eyeIndex(), ri = rimIndex(), pi = pupIndex();
    this.eyes = [new Eye('left', ei, ri, pi), new Eye('right', ei, ri, pi)];
    for (const e of this.eyes) this.group.add(e.rim, e.mesh, e.pupil);
    this.syncMaskShape();
  }

  get shape(): string {
    return this.shapeName;
  }

  /** Shape-local extents of the current shape. */
  get extent(): { x: number; y: number } {
    return this.tpl.info.extent;
  }

  private resolve(name: string | undefined): string {
    const all = listEyeShapes();
    if (name && all.includes(name)) return name;
    return all.includes(this.defaults.shape) ? this.defaults.shape : all[0]!;
  }

  /** Current layout (springs): half spacing, radius, centre y (body space). */
  layout() {
    return { halfSpacing: this.lay.hs.x, radius: this.lay.r.x, y: this.lay.y.x };
  }

  /** Current eye height (body space) without the per-call object (`layout()` for tools). */
  layoutY(): number {
    return this.lay.y.x;
  }

  /** Retarget numbers / colours (tween) — call immediately on edits. */
  setLayout(l: { halfSpacing: number; radius: number; y: number }, opts: AvatarEyesOptions, snap = false): void {
    const prevW = this.opts.outlineWidth;
    this.opts = { ...this.defaults, ...opts };
    const set = (s: Spring, v: number) => (snap ? s.snap(v) : s.set(v));
    set(this.lay.hs, l.halfSpacing);
    set(this.lay.r, l.radius);
    set(this.lay.y, l.y);
    set(this.lay.lid, this.opts.lid);
    set(this.lay.depth, this.opts.depth);
    set(this.lay.pup, this.opts.pupil ? 1 : 0);
    set(this.lay.pupEdge, this.opts.pupilStyle === 'edge' ? 1 : 0);
    this.eyeColAuto = this.opts.color === 'auto';
    this.rimColAuto = this.opts.outline === 'auto';
    if (!this.eyeColAuto && this.opts.color !== 'auto') {
      if (snap) this.eyeCol.snap(this.opts.color);
      else this.eyeCol.set(this.opts.color);
    }
    if (!this.rimColAuto && this.opts.outline !== 'auto') {
      if (snap) this.rimCol.snap(this.opts.outline);
      else this.rimCol.set(this.opts.outline);
    }
    if (prevW !== this.opts.outlineWidth) {
      this.rimTpl = rimTemplate(this.tpl, Math.max(0, this.opts.outlineWidth));
      this.geoVersion++;
    }
  }

  /** Swap the eye shape on the SAME meshes / geometries (call at the bottom of a blink). */
  setShape(name: string | undefined): void {
    this.shapeName = this.resolve(name);
    this.tpl = template(this.shapeName);
    this.rimTpl = rimTemplate(this.tpl, Math.max(0, this.opts.outlineWidth));
    this.geoVersion++;
    this.syncMaskShape();
  }

  private syncMaskShape(): void {
    this.mask?.setShape(this.tpl.sdfTex);
  }

  update(f: EyeFrame): void {
    const { dt } = f;
    for (const s of this.laySprings) s.update(dt);
    const hs = this.lay.hs.x;
    const r = Math.max(1e-4, this.lay.r.x);
    const y = this.lay.y.x;
    const L = this.placedLay;
    const moved = stale(L, 0, hs) | stale(L, 1, r) | stale(L, 2, y);
    const resample = f.resample || !this.placed || moved !== 0;
    if (resample) (L[0] = hs), (L[1] = r), (L[2] = y);
    const base = eyePoseForPreset(f.preset, undefined, this.basePose);
    if (f.eyeOverlay) overlayEyePose(base, f.eyeOverlay);
    this.colours(f);
    const pa = Math.max(0, Math.min(1, this.lay.pup.x));
    const pr = pupilRadii(pa, this.lay.pupEdge.x, this.prOut);
    const ext = this.tpl.info.extent;
    if (resample) this.geoVersion++;
    for (const e of this.eyes) {
      const sgn = e.side === 'left' ? -1 : 1;
      if (resample) this.place(e, sgn * hs, y, r);
      easeEyePose(e.pose, e.side === 'left' ? base.left : base.right, dt, 12);
      // blink is a 3D eyelid (the outline closes over the dome), not a squash of the eye
      composeEyePose(e.pose, { lid: this.lay.lid.x }, e.shown);
      composeEyePose(e.pose, { lid: this.lay.lid.x }, e.maskPose);
      eyeShapeTransform(e.shown, e.sgn, ext, e.T);
      eyeShapeTransform(e.maskPose, e.sgn, ext, e.maskT);
      const P = e.shown;
      const blink = Math.max(0, Math.min(1, f.blink));
      const depth = this.lay.depth.x;
      // never shorter than the surrounding fur, whatever the preset squash (the eye always sits on top of it)
      const minRelief = (1.25 * f.furLength) / r;
      const B = e.built;
      const dirty =
        stale(B, 0, this.geoVersion) | stale(B, 1, P.upper) | stale(B, 2, P.lower) | stale(B, 3, P.sx) | stale(B, 4, P.sy) |
        stale(B, 5, P.scale) | stale(B, 6, P.rot) | stale(B, 7, P.tilt) | stale(B, 8, P.arc) | stale(B, 9, depth) |
        stale(B, 10, minRelief) | stale(B, 11, blink) | stale(B, 12, pr.inner) | stale(B, 13, pr.outer);
      if (dirty !== 0) {
        B[0] = this.geoVersion, B[1] = P.upper, B[2] = P.lower, B[3] = P.sx, B[4] = P.sy, B[5] = P.scale, B[6] = P.rot;
        B[7] = P.tilt, B[8] = P.arc, B[9] = depth, B[10] = minRelief, B[11] = blink, B[12] = pr.inner, B[13] = pr.outer;
        this.build(e, r, depth, minRelief, blink, pa > 1e-3 ? pr : null);
      }
      e.rim.visible = this.opts.outlineWidth > 1e-3 || blink > 1e-3;
      e.pupil.visible = pa > 1e-3;
      e.pupilMaterial.opacity = pa;
      // fully opaque once shown: no sorting artefacts against the dome
      e.pupilMaterial.transparent = pa < 0.999;
      e.pupilMaterial.depthWrite = pa >= 0.999;
    }
    this.updateMask(r, f.furLength);
    this.placed = true;
  }

  private colours(f: EyeFrame): void {
    const o = this.opts;
    const t = (c: Rgb) => (o.tint !== false && f.tint ? f.tint(c) : c);
    // 'auto' follows the live body colour spring; explicit colours spring via ColorSpring
    let eye: Rgb;
    if (this.eyeColAuto) {
      // contrast colours only depend on the body colour — recompute only when it moves
      if (this.autoBody[0] !== f.body[0] || this.autoBody[1] !== f.body[1] || this.autoBody[2] !== f.body[2]) {
        this.autoBody[0] = f.body[0];
        this.autoBody[1] = f.body[1];
        this.autoBody[2] = f.body[2];
        this.autoEye = contrastEyeColor(f.body);
        this.autoRim = contrastBorder(f.body);
      }
      eye = this.autoEye;
    } else {
      const raw = this.eyeCol.update(f.dt);
      eye = t(raw);
    }
    this.cA.setRGB(eye[0], eye[1], eye[2], THREE.SRGBColorSpace);
    for (const e of this.eyes) e.material.color.copy(this.cA);
    // pupil = opposite of the eye colour (black ↔ white), eased so colour changes never jump
    const pc = contrastEyeColor(eye);
    this.cA.setRGB(pc[0], pc[1], pc[2], THREE.SRGBColorSpace);
    if (!this.pupColInit) this.pupCol.copy(this.cA);
    else this.pupCol.lerp(this.cA, 1 - Math.exp(-14 * Math.max(0, f.dt)));
    this.pupColInit = true;
    for (const e of this.eyes) e.pupilMaterial.color.copy(this.pupCol);
    const rim = this.rimColAuto ? this.autoRim : t(this.rimCol.update(f.dt));
    this.cA.setRGB(rim[0], rim[1], rim[2], THREE.SRGBColorSpace);
    for (const e of this.eyes) e.rimMaterial.color.copy(this.cA);
  }

  /** Sample the body around one eye (scratch: PLACE_TY / PLACE_N): centre, tangent frame (from neighbours) and a quadratic height fit. */
  private place(e: Eye, x: number, y: number, r: number): void {
    const F = e.frame;
    if (!this.sampleBody(x, y, F.c, F.n)) {
      F.c.set(x, y, 0.5);
      F.n.set(0, 0, 1);
    }
    const a = r * 1.1;
    const [px, mx, py, my] = this.sp;
    const okx = this.sampleBody(x + a, y, px!, this.tmpN) && this.sampleBody(x - a, y, mx!, this.tmpN);
    const oky = this.sampleBody(x, y + a, py!, this.tmpN) && this.sampleBody(x, y - a, my!, this.tmpN);
    if (okx && oky) {
      const tx = this.tmp.copy(px!).sub(mx!);
      const ty = PLACE_TY.copy(py!).sub(my!);
      const n = PLACE_N.crossVectors(tx, ty);
      if (n.lengthSq() > 1e-10) F.n.copy(n.normalize());
      if (F.n.z < 0) F.n.negate();
    }
    F.t1.crossVectors(this.up, F.n);
    if (F.t1.lengthSq() < 1e-8) F.t1.set(1, 0, 0);
    F.t1.normalize();
    F.t2.crossVectors(F.n, F.t1).normalize();
    // quadratic fit of the surface height along n (so the eye base hugs the curvature)
    const fit = (p: THREE.Vector3, q: THREE.Vector3, axis: THREE.Vector3): [number, number] => {
      const up = this.tmp.copy(p).sub(F.c);
      const u1 = up.dot(axis), e1 = up.dot(F.n);
      const uq = this.tmpN.copy(q).sub(F.c);
      const u2 = uq.dot(axis), e2 = uq.dot(F.n);
      const det = u1 * u2 * (u2 - u1);
      if (Math.abs(det) < 1e-9) return [0, 0];
      const A = (e1 * u2 * u2 - e2 * u1 * u1) / det;
      const C = (e2 * u1 - e1 * u2) / det;
      return [A, C];
    };
    const lim = (v: number) => Math.max(-2.5 / r, Math.min(1.5 / r, v));
    [F.a, F.cu] = okx ? fit(px!, mx!, F.t1) : [0, -0.5 / Math.max(r, 0.1)];
    [F.b, F.cv] = oky ? fit(py!, my!, F.t2) : [0, -0.5 / Math.max(r, 0.1)];
    F.a = Math.max(-0.6, Math.min(0.6, F.a));
    F.b = Math.max(-0.6, Math.min(0.6, F.b));
    F.cu = lim(F.cu);
    F.cv = lim(F.cv);
  }

  /** Write the posed, surface-conforming relief + outline into the persistent buffers. */
  private build(e: Eye, r: number, depth: number, minRelief: number, blink: number, pup: { inner: number; outer: number } | null = null): void {
    const F = e.frame;
    const T = e.T;
    const xy = this.xy;
    const sink = 0.035 * r;
    const relief = Math.max(T.zf * depth, minRelief) * r;
    const write = (g: THREE.BufferGeometry, src: Float32Array, hs: Float32Array, lift: number) => {
      const pos = g.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const n = hs.length;
      for (let i = 0; i < n; i++) {
        applyEyeShapeTransform(T, src[i * 2]!, src[i * 2 + 1]!, xy);
        const u = xy[0] * r, v = xy[1] * r;
        const surf = F.a * u + F.b * v + F.cu * u * u + F.cv * v * v;
        const h = hs[i]! * relief + surf - sink + lift;
        arr[i * 3] = F.c.x + F.t1.x * u + F.t2.x * v + F.n.x * h;
        arr[i * 3 + 1] = F.c.y + F.t1.y * u + F.t2.y * v + F.n.y * h;
        arr[i * 3 + 2] = F.c.z + F.t1.z * u + F.t2.z * v + F.n.z * h;
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    };
    write(e.mesh.geometry, this.tpl.exy, this.tpl.eh, 0);
    posLid(this.tpl, this.rimTpl, blink);
    write(e.rim.geometry, this.rimTpl.rxy, this.rimTpl.rh, 0.002 * r);
    if (pup) {
      // patch on the outermost dome surface, tracing the shape (radial grid: same columns as the eye)
      const { pxy, ph } = this;
      for (let k = 0; k < PUP_RINGS; k++) {
        const rho = pup.inner + (pup.outer - pup.inner) * (k / (PUP_RINGS - 1));
        for (let j = 0; j < SEG; j++) {
          const a = (j / SEG) * Math.PI * 2;
          const Rb = this.tpl.rb[j]!;
          const i = k * SEG + j;
          pxy[i * 2] = Math.cos(a) * rho * Rb;
          pxy[i * 2 + 1] = Math.sin(a) * rho * Rb;
          ph[i] = reliefAt(this.tpl, j, rho);
        }
      }
      // just above the dome, below the closing lid (LID_THICK) so a blink covers it
      write(e.pupil.geometry, pxy, ph, 0.004 * r);
    }
  }

  /** Push the eye frames + preset shape (no blink) to the fur clearing uniforms. */
  private updateMask(r: number, furLength: number): void {
    const m = this.mask;
    if (!m) return;
    const w = Math.max(0, this.opts.outlineWidth);
    if (this.maskEyes.length !== this.eyes.length) {
      this.maskEyes.length = 0;
      for (const e of this.eyes) this.maskEyes.push({ frame: e.frame, shape: e.maskT });
    }
    m.update(
      this.maskEyes,
      // tight soft margin; taller shells start a little further out
      { radius: r, outline: w + 0.03, lift: (0.9 * furLength) / Math.max(1e-3, r) },
    );
  }

  dispose(): void {
    for (const e of this.eyes) {
      e.mesh.geometry.dispose();
      e.rim.geometry.dispose();
      e.material.dispose();
      e.rimMaterial.dispose();
      e.pupil.geometry.dispose();
      e.pupilMaterial.dispose();
    }
  }
}

// the renderer needs at least its default shape; families may register more
installDefaultEyeShapes();
