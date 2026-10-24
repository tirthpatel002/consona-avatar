import * as THREE from 'three';
import type { ResolvedAvatarDefinition } from '../../../../core/define/resolveAvatar.ts';
import { registerAtomDrawer } from '../atomDrawers.ts';
import { createShellFur } from './shellFur.ts';
import type { ShellFurDeform } from './shellFur.ts';
import { createAnchorFrame } from '../anchors.ts';
import type { RigLimbs } from '../anchors.ts';
import type { AvatarSide } from '../../../../core/atom/atomLayer.ts';

/** Frames of sub-threshold motion before the tentacle simulation sleeps. */
const SLEEP_FRAMES = 30;
/** Sleep threshold: per-frame chain motion relative to the body below this fraction of a segment (invisible). */
const SLEEP_EPS = 1e-4;
/** Body transform change (any matrix element, per simulated frame / since falling asleep) that counts as motion. */
const BODY_EPS = 1e-5;
/** Default rest-pose stiffness [root, tip]. */
const STIFFNESS: readonly [number, number] = [0.35, 0.015];

/**
 * Soft tentacles / limbs: gently tapered tubes with a hemispherical tip cap,
 * an opaque base skin + shell fur (like the body), driven by a Verlet chain under gravity, so they droop, drape on the
 * floor and trail the body with lag / follow-through. Each tube starts inside
 * the body's root stub, and both get the same shell fur, so the whole thing
 * reads as one plush body.
 *
 * The chain simulates in world space (gravity + inertia from body motion),
 * with a weak pull toward a rest pose in body space and a floor plane.
 * Families supply the layout with `configureTentacles`.
 *
 * Reach: the pose layer's `reach` (e.g. "bring the hand toward the mouth")
 * pulls the family's `reach.limb` toward a smooth arc from its root to the
 * target, blended over the physics (inertia, gravity, floor stay on, so it
 * still sways; weight 0 = pure physics again; settled reaches still sleep).
 * The live tips are exposed as rig limbs (`ctx.limbs`, anchors).
 */
export type V3 = [number, number, number];

export interface TentacleRoot {
  /** Root position (body space, before `bodyCenterY`). */
  position: V3;
  /** Outward direction at the root. */
  direction: V3;
}

export interface TentacleLayout {
  roots: TentacleRoot[];
  /** Tube length (body units). */
  length: number;
  rootRadius: number;
  tipRadius: number;
  /** Floor height (body space, before `bodyCenterY`); tentacles rest on it. */
  floorY: number;
  /** Chain points per tentacle (default 12). */
  segments?: number;
  /**
   * Rigid attachment (body units, default one segment): from the root the tube runs straight along
   * `direction` for this length and is fixed to the body (those chain points are pinned to the body every
   * substep and the tube rings there are written straight from the body-space root line, like the embedded
   * eyes), so it stays attached where it emerges; put the root inside the body so the root ring is hidden.
   */
  rootLength?: number;
  /** Length after `rootLength` over which the simulated motion blends in (body units, default half a segment). */
  rootBlend?: number;
  /**
   * Root ring sunk into the body: the tube radius is this fraction smaller at the root, back to full at the
   * end of the rigid section (default 0), so the tube skin stays just under the body skin where it emerges.
   */
  rootInset?: number;
  /** Rest-pose pull 0..1 at the root → tip (default [0.35, 0.015]). */
  stiffness?: [number, number];
  /** Velocity damping per step (default 0.985). */
  damping?: number;
  /** Gravity (body units / s², default 9). */
  gravity?: number;
  /** Per-vertex `furTint` (0..1) from the tube parameter u (0 root → 1 tip) and local normal. */
  tint?: (u: number, normal: V3) => number;
  /** Which limb answers the pose `reach`, and how (family tuning). */
  reach?: TentacleReach;
  /** Keep the chains out of the body (family tuning); omit for no body collision. */
  collision?: TentacleCollision;
}

/**
 * Body collision: chain points stay outside the live body surface (sampled from
 * the rig's `surfaceRadial` around the body centre, so it follows the shape;
 * scale / squash come with the body transform) plus `margin` plus the tube
 * radius there. Points that sit inside that at rest (the roots) may go as deep
 * as their rest pose, no deeper.
 */
export interface TentacleCollision {
  /** Extra clearance over the surface (body units), e.g. the fur thickness. */
  margin: number;
  /** Velocity kept by a point pushed out, 0..1 (default 0.7): lower = more friction, it slides less. */
  slide?: number;
}

export interface TentacleReach {
  /** Limb index (into `roots`) that reaches when the request names no side. */
  limb: number;
  /** Limb per side for `reach(…).side(…)` ('right' = +x); omitted sides use `limb`. */
  sides?: Partial<Record<AvatarSide, number>>;
  /** Hold point relative to the target anchor at `approach` 0 (body units, body axes; authored for `limb`, x mirrored for a limb on the other side). */
  offset: V3;
  /** Pull toward the reach arc per substep at full weight, 0..1 (default 0.35). */
  strength?: number;
}

/**
 * Reach arc: `out.length` points on a quadratic curve from `root` to `target`
 * whose length matches `length` when the target is closer than that (the arch
 * bulges along `up`, perpendicular to the chord); straight otherwise.
 */
export function reachArc(root: THREE.Vector3, target: THREE.Vector3, length: number, up: THREE.Vector3, out: THREE.Vector3[]): void {
  const chord = ARC_C.subVectors(target, root);
  const d = chord.length();
  const perp = ARC_P.copy(up).addScaledVector(chord, -up.dot(chord) / Math.max(d * d, 1e-9));
  if (perp.lengthSq() < 1e-9) perp.set(1, 0, 0).addScaledVector(chord, -chord.x / Math.max(d * d, 1e-9));
  perp.normalize();
  const mid = ARC_M.addVectors(root, target).multiplyScalar(0.5);
  let h = 0;
  if (d < length) {
    let lo = 0, hi = length;
    for (let it = 0; it < 14; it++) {
      h = (lo + hi) / 2;
      if (arcLength(root, mid, perp, h, target) < length) lo = h;
      else hi = h;
    }
  }
  for (let i = 0; i < out.length; i++) bezier(root, mid, perp, h, target, i / (out.length - 1), out[i]!);
}
const ARC_C = new THREE.Vector3(), ARC_P = new THREE.Vector3(), ARC_M = new THREE.Vector3(), ARC_A = new THREE.Vector3(), ARC_B = new THREE.Vector3(), ARC_Q = new THREE.Vector3();
function arcLength(root: THREE.Vector3, mid: THREE.Vector3, perp: THREE.Vector3, h: number, target: THREE.Vector3): number {
  let len = 0;
  ARC_A.copy(root);
  for (let i = 1; i <= 16; i++) {
    bezier(root, mid, perp, h, target, i / 16, ARC_B);
    len += ARC_B.distanceTo(ARC_A);
    ARC_A.copy(ARC_B);
  }
  return len;
}
/** Quadratic Bézier root → (mid + perp·2h) → target at u (control lifted so the apex sits h off the chord). */
function bezier(a: THREE.Vector3, mid: THREE.Vector3, perp: THREE.Vector3, h: number, b: THREE.Vector3, u: number, out: THREE.Vector3): void {
  const q = ARC_Q.copy(mid).addScaledVector(perp, 2 * h);
  const v = 1 - u;
  out.set(v * v * a.x + 2 * v * u * q.x + u * u * b.x, v * v * a.y + 2 * v * u * q.y + u * u * b.y, v * v * a.z + 2 * v * u * q.z + u * u * b.z);
}

type LayoutFn = (def: ResolvedAvatarDefinition) => TentacleLayout | null;
const layouts = new Map<string, LayoutFn>();

/** Register a family's tentacle layout (evaluated per definition; `null` = none). */
export function configureTentacles(family: string, layout: LayoutFn): void {
  layouts.set(family, layout);
}

const RADIAL = 14;
const RINGS = 44;
/** Rings spent on the hemispherical tip cap. */
const CAP_RINGS = 10;
const SUB = 2;
/** furTint lookup resolution (u × normal.y). */
const TINT_W = 256;
const TINT_H = 64;

/** Vertex-shader tube expansion: identical formulas to the old CPU tube writer (see `writeStatic`). */
const TUBE_GLSL_HEADER = /* glsl */ `
uniform highp sampler2D uTubeFrames; uniform sampler2D uTubeTint;
attribute vec3 tubeVert;
`;
const TUBE_GLSL_BODY = /* glsl */ `
{
  ivec2 tubeC = ivec2(int(tubeVert.y + 0.5) * 3, int(tubeVert.x + 0.5));
  vec4 tf0 = texelFetch(uTubeFrames, tubeC, 0);
  vec4 tf1 = texelFetch(uTubeFrames, tubeC + ivec2(1, 0), 0);
  vec4 tf2 = texelFetch(uTubeFrames, tubeC + ivec2(2, 0), 0);
  vec3 tubeD;
  if (tubeVert.z < -0.5) {
    // tip: end point, normal = tangent, no comb (gravity), no crease AO
    tubeD = tf2.xyz;
    furPos = tf0.xyz; furNrm = tf2.xyz; furFlowA = vec3(0.0); furAOA = 1.0;
  } else {
    float tubeAng = tubeVert.z * ${((Math.PI * 2) / RADIAL).toFixed(10)};
    tubeD = tf1.xyz * cos(tubeAng) + cross(tf2.xyz, tf1.xyz) * sin(tubeAng);
    furPos = tf0.xyz + tubeD * tf0.w;
    furNrm = tubeD * tf1.w + tf2.xyz * sqrt(max(0.0, 1.0 - tf1.w * tf1.w));
    furFlowA = tf2.xyz;
    // crease AO: root join + floor-facing side
    furAOA = (0.55 + 0.45 * min(1.0, tf2.w / 0.12)) * (1.0 - 0.3 * max(0.0, -tubeD.y));
  }
  vec2 tubeTc = vec2((tf2.w * ${TINT_W - 1}.0 + 0.5) / ${TINT_W}.0, ((tubeD.y * 0.5 + 0.5) * ${TINT_H - 1}.0 + 0.5) / ${TINT_H}.0);
  furTintA = texture2D(uTubeTint, tubeTc).r;
}
`;
const ITER = 6;
/** Extra depth (tentacle lengths) allowed to points that sit inside their clearance at rest. */
const INSET_SLACK = 0.012;
/** Body-surface radius lookup over (polar, azimuth) around the body centre (bilinear). */
const COL_LAT = 24;
const COL_LON = 48;

/** Verlet chain of one tentacle (world space). */
/**
 * Centripetal Catmull-Rom through a chain (the curve of three's
 * `CatmullRomCurve3(points, false, 'centripetal')`, ends extrapolated),
 * allocation-free: `set` computes the per-segment cubics once per frame,
 * `point` / `tangent` evaluate them (analytic derivative).
 */
class ChainSpline {
  private readonly k: Float64Array;
  private readonly n: number;
  constructor(n: number) {
    this.n = n;
    this.k = new Float64Array((n - 1) * 12);
  }
  set(pts: readonly THREE.Vector3[]): void {
    const n = this.n;
    for (let s = 0; s < n - 1; s++) {
      const p1 = pts[s]!, p2 = pts[s + 1]!;
      const a = s > 0 ? pts[s - 1]! : null, b = s + 2 < n ? pts[s + 2]! : null;
      const p0x = a ? a.x : 2 * p1.x - p2.x, p0y = a ? a.y : 2 * p1.y - p2.y, p0z = a ? a.z : 2 * p1.z - p2.z;
      const p3x = b ? b.x : 2 * p2.x - p1.x, p3y = b ? b.y : 2 * p2.y - p1.y, p3z = b ? b.z : 2 * p2.z - p1.z;
      let d1 = Math.pow((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2, 0.25);
      let d0 = Math.pow((p1.x - p0x) ** 2 + (p1.y - p0y) ** 2 + (p1.z - p0z) ** 2, 0.25);
      let d2 = Math.pow((p3x - p2.x) ** 2 + (p3y - p2.y) ** 2 + (p3z - p2.z) ** 2, 0.25);
      if (d1 < 1e-4) d1 = 1;
      if (d0 < 1e-4) d0 = d1;
      if (d2 < 1e-4) d2 = d1;
      const o = s * 12;
      this.cubic(o, p0x, p1.x, p2.x, p3x, d0, d1, d2);
      this.cubic(o + 4, p0y, p1.y, p2.y, p3y, d0, d1, d2);
      this.cubic(o + 8, p0z, p1.z, p2.z, p3z, d0, d1, d2);
    }
  }
  private cubic(o: number, x0: number, x1: number, x2: number, x3: number, d0: number, d1: number, d2: number): void {
    const t1 = ((x1 - x0) / d0 - (x2 - x0) / (d0 + d1) + (x2 - x1) / d1) * d1;
    const t2 = ((x2 - x1) / d1 - (x3 - x1) / (d1 + d2) + (x3 - x2) / d2) * d1;
    const k = this.k;
    k[o] = x1;
    k[o + 1] = t1;
    k[o + 2] = -3 * x1 + 3 * x2 - 2 * t1 - t2;
    k[o + 3] = 2 * x1 - 2 * x2 + t1 + t2;
  }
  /** Position (`d` = 0) or derivative (`d` = 1) of component `o` at weight `w`. */
  private eval(o: number, w: number, d: number): number {
    const k = this.k;
    return d === 0 ? k[o]! + w * (k[o + 1]! + w * (k[o + 2]! + w * k[o + 3]!)) : k[o + 1]! + w * (2 * k[o + 2]! + 3 * w * k[o + 3]!);
  }
  private at(t: number, d: number, out: THREE.Vector3): THREE.Vector3 {
    const p = (this.n - 1) * Math.min(1, Math.max(0, t));
    const i = Math.min(this.n - 2, Math.floor(p));
    const w = p - i, o = i * 12;
    return out.set(this.eval(o, w, d), this.eval(o + 4, w, d), this.eval(o + 8, w, d));
  }
  point(t: number, out: THREE.Vector3): THREE.Vector3 {
    return this.at(t, 0, out);
  }
  tangent(t: number, out: THREE.Vector3): THREE.Vector3 {
    return this.at(t, 1, out).normalize();
  }
}

class Chain {
  readonly p: THREE.Vector3[];
  readonly q: THREE.Vector3[];
  readonly rest: THREE.Vector3[];
  /** Rest pose in world space for the current frame (body matrix is constant across substeps). */
  readonly restW: THREE.Vector3[];
  /**
   * Body collision: per point, the clearance over the body surface (margin + tube radius, less how far
   * the point sits inside that at rest: it may go that deep, no deeper); -Infinity = never collides.
   */
  readonly clear: Float64Array;
  /** Unit root direction (body space): the rigid root section runs from `rest[0]` along it. */
  readonly dir = new THREE.Vector3(0, 0, 1);
  constructor(n: number) {
    this.clear = new Float64Array(n);
    this.p = Array.from({ length: n }, () => new THREE.Vector3());
    this.q = Array.from({ length: n }, () => new THREE.Vector3());
    this.rest = Array.from({ length: n }, () => new THREE.Vector3());
    this.restW = Array.from({ length: n }, () => new THREE.Vector3());
  }
}

/**
 * Rest pose (body space): the pinned root section (`lead`) straight out of the root along its direction
 * (points exactly a segment apart), then out from the root easing down onto the floor and along it.
 * `dir` gets the unit root direction.
 */
function restPose(root: TentacleRoot, L: TentacleLayout, cy: number, n: number, lead: number, out: THREE.Vector3[], dir: THREE.Vector3): void {
  const [px, py, pz] = root.position;
  const d = dir.set(root.direction[0], root.direction[1], root.direction[2]);
  if (d.lengthSq() < 1e-12) d.set(0, 0, 1);
  d.normalize();
  const flat = new THREE.Vector3(d.x, 0, d.z);
  if (flat.lengthSq() < 1e-6) flat.set(0, 0, 1);
  flat.normalize();
  const seg = L.length / (n - 1);
  const yFloor = L.floorY + L.tipRadius;
  const pin = pinnedCount(L, n, lead);
  for (let i = 0; i < n; i++) {
    const s = i * seg;
    if (i < pin) {
      out[i]!.set(px + d.x * s, py + d.y * s + cy, pz + d.z * s);
      continue;
    }
    const k = Math.min(1, s / (L.length * 0.45));
    const e = k * k * (3 - 2 * k);
    const y = py + (yFloor - py) * e;
    // horizontal reach: what's left of the arc length after the drop
    out[i]!.set(px + flat.x * s * (0.55 + 0.4 * e), y + cy, pz + flat.z * s * (0.55 + 0.4 * e));
  }
}

/** Chain points pinned to the body (root + rigid section), at least the root and the next point. */
function pinnedCount(L: TentacleLayout, n: number, lead: number): number {
  return Math.max(2, Math.min(n - 1, 1 + Math.floor(lead / (L.length / (n - 1)) + 1e-6)));
}

registerAtomDrawer({
  kind: 'tentacles',
  build(ctx) {
    const fn = ctx.def.family ? layouts.get(ctx.def.family) : undefined;
    let L = fn?.(ctx.def) ?? null;
    if (!L) return;
    const cy = ctx.profile.bodyCenterY;
    const N = L.segments ?? 12;
    const T = L.roots.length;
    const vertsPer = RINGS * RADIAL + 1;
    const pos = new Float32Array(T * vertsPer * 3);
    const nor = new Float32Array(T * vertsPer * 3);
    const uv = new Float32Array(T * vertsPer * 2);
    const coord = new Float32Array(T * vertsPer * 3);
    // per vertex: (tentacle, ring, angle step; -1 = tip vertex) -> the vertex shader rebuilds the tube from the ring frames
    const tubeVert = new Float32Array(T * vertsPer * 3);
    const index: number[] = [];
    for (let t = 0; t < T; t++) {
      const o = t * vertsPer;
      for (let r = 0; r < RINGS - 1; r++)
        for (let a = 0; a < RADIAL; a++) {
          const a1 = (a + 1) % RADIAL;
          const i0 = o + r * RADIAL + a, i1 = o + r * RADIAL + a1, i2 = o + (r + 1) * RADIAL + a, i3 = o + (r + 1) * RADIAL + a1;
          index.push(i0, i1, i2, i1, i3, i2); // outward winding (front faces outside)
        }
      const tip = o + RINGS * RADIAL;
      for (let a = 0; a < RADIAL; a++) index.push(o + (RINGS - 1) * RADIAL + a, o + (RINGS - 1) * RADIAL + ((a + 1) % RADIAL), tip);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(index);
    // all vertex attributes are static (rest pose + strand coords); the live tube shape is a small
    // float texture of per-ring frames, uploaded only while the simulation is awake
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('furCoord', new THREE.BufferAttribute(coord, 3));
    geo.setAttribute('tubeVert', new THREE.BufferAttribute(tubeVert, 3));

    // ring frames: per tentacle row, per ring 3 texels [C, radius] [N, cos θ] [T, u]; last column = tip
    const FW = (RINGS + 1) * 3;
    const frames = new Float32Array(FW * T * 4);
    const frameTex = new THREE.DataTexture(frames, FW, T, THREE.RGBAFormat, THREE.FloatType);
    frameTex.minFilter = frameTex.magFilter = THREE.NearestFilter;
    frameTex.generateMipmaps = false;
    frameTex.needsUpdate = true;
    // furTint lookup over (u, normal.y): the layout's tint evaluated on a grid (8-bit, bilinear)
    const tintData = new Uint8Array(TINT_W * TINT_H);
    const tintTex = new THREE.DataTexture(tintData, TINT_W, TINT_H, THREE.RedFormat, THREE.UnsignedByteType);
    tintTex.minFilter = tintTex.magFilter = THREE.LinearFilter;
    tintTex.generateMipmaps = false;
    let tintFn: TentacleLayout['tint'] | 'unset' = 'unset';
    const bakeTint = (fnT: TentacleLayout['tint']) => {
      if (fnT === tintFn) return;
      tintFn = fnT;
      for (let j = 0; j < TINT_H; j++) {
        const ny = (j / (TINT_H - 1)) * 2 - 1;
        const nx = Math.sqrt(Math.max(0, 1 - ny * ny));
        for (let i = 0; i < TINT_W; i++) {
          const v = fnT ? fnT(i / (TINT_W - 1), [nx, ny, 0]) : 0;
          tintData[j * TINT_W + i] = Math.round(Math.min(1, Math.max(0, v)) * 255);
        }
      }
      tintTex.needsUpdate = true;
    };
    const deform: ShellFurDeform = {
      key: 'tube',
      uniforms: { uTubeFrames: { value: frameTex }, uTubeTint: { value: tintTex } },
      header: TUBE_GLSL_HEADER,
      body: TUBE_GLSL_BODY,
    };
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, cy, 0), 6);

    bakeTint(L.tint);
    const fur = createShellFur(geo, ctx.def, { deform });
    fur.group.name = 'tentacles';
    for (const m of fur.group.children) m.frustumCulled = false;
    ctx.procedural.add(fur.group);

    const chains = L.roots.map(() => new Chain(N));
    const proc = ctx.procedural;
    const mat = new THREE.Matrix4();
    const inv = new THREE.Matrix4();
    const jump = new THREE.Matrix4();
    const down = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    let init = false;
    let key = '';
    // pulls (pose layer): the single `reach` request and per-limb requests (`pose.limb`, e.g. a hug or
    // counting on tentacles) — per chain: weight, hold point (procedural space), arc (world space).
    // All preallocated: no per-frame allocation however many limbs pull.
    const anchor = createAnchorFrame();
    const reachW = new THREE.Vector3(), upW = new THREE.Vector3();
    const pullW = new Float64Array(T), pullLastW = new Float64Array(T);
    const pullAt = Array.from({ length: T }, () => new THREE.Vector3()), pullLastAt = Array.from({ length: T }, () => new THREE.Vector3());
    const arcs = Array.from({ length: T }, () => Array.from({ length: N }, () => new THREE.Vector3()));
    // limb tone (postures): calm = hold still (stiffer rest pull, heavier damping), slack = limp
    let lastCalm = 0, lastSlack = 0;
    // rigid root: chain points [0, pin) follow the body exactly; tube rings up to `rootLen` lie on the
    // body-space root line, the simulated curve blending in over `rootBlend`; the root ring sinks by `rootInset`
    let pin = 2, rootLen = 0, rootBlend = 1, rootInset = 0;
    // body collision: surface radius per direction from the body centre (procedural space), rebuilt when the body changes
    const colR = new Float32Array((COL_LAT + 1) * (COL_LON + 1));
    const colO = new THREE.Vector3(0, cy, 0), colD = new THREE.Vector3(), colP = new THREE.Vector3(), centerW = new THREE.Vector3();
    let colReady = false;
    let colMax = 0; // largest surface radius: points farther than this + their clearance skip the lookup
    /** Body surface radius along the unit direction (x, y, z) from the body centre (bilinear lookup). */
    const radial = (x: number, y: number, z: number): number => {
      const a = (Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI) * COL_LAT;
      const b = ((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * COL_LON;
      const i = Math.min(COL_LAT - 1, Math.floor(a)), j = Math.min(COL_LON - 1, Math.floor(b));
      const fa = a - i, fb = b - j, w = COL_LON + 1;
      const r0 = colR[i * w + j]! + (colR[i * w + j + 1]! - colR[i * w + j]!) * fb;
      const r1 = colR[(i + 1) * w + j]! + (colR[(i + 1) * w + j + 1]! - colR[(i + 1) * w + j]!) * fb;
      return r0 + (r1 - r0) * fa;
    };
    const buildCollision = (): boolean => {
      const surf = ctx.anchors.source.surfaceRadial;
      const col = L!.collision;
      if (!col || !surf) return false;
      colMax = 0;
      for (let i = 0; i <= COL_LAT; i++)
        for (let j = 0; j <= COL_LON; j++) {
          const th = (i / COL_LAT) * Math.PI, ph = (j / COL_LON) * 2 * Math.PI - Math.PI;
          colD.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
          const r = surf(colO, colD) ?? 0;
          colR[i * (COL_LON + 1) + j] = r;
          colMax = Math.max(colMax, r);
        }
      // points inside their clearance at rest (root side, emerging from the fur) may stay as deep as that
      // (+ a little slack, so resting points never touch the limit: no contact jitter), no deeper
      for (const c of chains)
        for (let i = 1; i < N; i++) {
          const clear = col.margin + L!.rootRadius + (L!.tipRadius - L!.rootRadius) * (i / (N - 1));
          colP.copy(c.rest[i]!).sub(colO);
          const d = colP.length();
          const inset = d < 1e-6 ? Infinity : radial(colP.x / d, colP.y / d, colP.z / d) + clear - d;
          c.clear[i] = inset > 0 ? clear - inset - INSET_SLACK * L!.length : clear;
        }
      return true;
    };
    /**
     * Push chain point `i` of `c` (world `p`) out of the body to its clearance; the previous position
     * rides along (resting contact: no velocity injected, no bounce / jitter), never through the floor
     * (near the base the clearance reaches below it: the floor wins, the push stays sideways); friction
     * (`slide`) damps what is left of the motion.
     */
    const collide = (c: Chain, i: number, floor: number, keep: number): void => {
      const p = c.p[i]!;
      colP.copy(p).applyMatrix4(inv).sub(colO);
      const clear = c.clear[i]!;
      const d2 = colP.lengthSq();
      const far = colMax + clear;
      if (d2 >= far * far || d2 < 1e-12) return;
      const d = Math.sqrt(d2);
      const lim = radial(colP.x / d, colP.y / d, colP.z / d) + clear;
      if (d >= lim) return;
      const q = c.q[i]!;
      q.sub(p);
      p.copy(colP.multiplyScalar(lim / d).add(colO).applyMatrix4(mat));
      if (p.y < floor) p.y = floor;
      q.add(p).lerp(p, 1 - keep);
    };

    const relayout = (def: ResolvedAvatarDefinition) => {
      // the layout may depend on the body and the fur (e.g. collision clearance)
      const k = JSON.stringify(def.body) + (def.fur ? def.fur.length : 0);
      if (k === key) return;
      key = k;
      const next = fn!(def);
      if (next && next.roots.length === T) L = next;
      const segB = L!.length / (N - 1);
      rootLen = Math.max(0, L!.rootLength ?? segB);
      rootBlend = Math.max(1e-6, L!.rootBlend ?? segB * 0.5);
      rootInset = Math.min(0.5, Math.max(0, L!.rootInset ?? 0));
      pin = pinnedCount(L!, N, rootLen);
      for (let t = 0; t < T; t++) restPose(L!.roots[t]!, L!, cy, N, rootLen, chains[t]!.rest, chains[t]!.dir);
      layoutRings();
      bakeTint(L!.tint);
      colReady = false;
    };

    // tube from the chain (body space): Catmull-Rom samples, parallel-transport frames, tapered + rounded tip.
    // Only the per-ring frames are computed here; the vertex shader expands them into the tube (same formulas).
    const spline = new ChainSpline(N);
    const C = new THREE.Vector3(), Tg = new THREE.Vector3(), Nn = new THREE.Vector3(), prevT = new THREE.Vector3();
    // per ring: arc parameter u (0 root → 1 tip; body rings evenly to the cap start, then a hemisphere
    // θ: 0 → ~90° over the last tip radius), cap angle θ, and the spline parameter t at u (arc length
    // of the rest pose, so rings stay evenly spaced along the tube)
    const ringU = new Float64Array(RINGS), ringTh = new Float64Array(RINGS), ringT = new Float64Array(RINGS);
    // per ring: distance from the root along the rigid root line (spline parameter × length: the pinned
    // points sit a segment apart on it) and the weight of the simulated curve there (0 = rigid root line)
    const ringS = new Float64Array(RINGS), ringW = new Float64Array(RINGS);
    const Lp = new THREE.Vector3();
    const ARC_STEPS = 200;
    const arcLen = new Float64Array(ARC_STEPS + 1);
    const layoutRings = () => {
      const lay = L!;
      const tipU = Math.max(0, 1 - lay.tipRadius / lay.length);
      const body = RINGS - CAP_RINGS;
      for (let r = 0; r < RINGS; r++) {
        const th = r < body ? 0 : ((r - body + 1) / (CAP_RINGS + 1)) * (Math.PI / 2);
        ringTh[r] = th;
        ringU[r] = r < body ? (r / (body - 1)) * tipU : tipU + (1 - tipU) * Math.sin(th);
      }
      spline.set(chains[0]!.rest);
      spline.point(0, tmp);
      for (let i = 1; i <= ARC_STEPS; i++) {
        spline.point(i / ARC_STEPS, tmp2);
        arcLen[i] = arcLen[i - 1]! + tmp2.distanceTo(tmp);
        tmp.copy(tmp2);
      }
      for (let r = 0, j = 0; r < RINGS; r++) {
        const target = ringU[r]! * arcLen[ARC_STEPS]!;
        while (j < ARC_STEPS - 1 && arcLen[j + 1]! < target) j++;
        const span = arcLen[j + 1]! - arcLen[j]!;
        ringT[r] = (j + (span > 0 ? Math.min(1, Math.max(0, (target - arcLen[j]!) / span)) : 0)) / ARC_STEPS;
        ringS[r] = ringT[r]! * lay.length;
        const b = Math.min(1, Math.max(0, (ringS[r]! - rootLen) / rootBlend));
        ringW[r] = b * b * (3 - 2 * b);
      }
    };
    relayout(ctx.def);
    const writeFrames = (t: number, pts: THREE.Vector3[]) => {
      const lay = L!;
      spline.set(pts);
      const o = t * FW * 4;
      const tipU = Math.max(0, 1 - lay.tipRadius / lay.length);
      const R0 = chains[t]!.rest[0]!, D = chains[t]!.dir;
      for (let r = 0; r < RINGS; r++) {
        const th = ringTh[r]!, u = ringU[r]!;
        spline.point(ringT[r]!, C);
        spline.tangent(ringT[r]!, Tg);
        const w = ringW[r]!;
        if (w < 1) {
          // rigid root: on the body-space root line (no spline end swing), the simulated curve blending in
          Lp.copy(R0).addScaledVector(D, ringS[r]!);
          C.sub(Lp).multiplyScalar(w).add(Lp);
          Tg.multiplyScalar(w).addScaledVector(D, 1 - w);
          if (Tg.lengthSq() < 1e-10) Tg.copy(D);
          Tg.normalize();
        }
        if (r === 0) {
          Nn.set(0, 1, 0);
          if (Math.abs(Nn.dot(Tg)) > 0.9) Nn.set(1, 0, 0);
          Nn.addScaledVector(Tg, -Nn.dot(Tg)).normalize();
        } else {
          // parallel transport
          const ax = tmp.crossVectors(prevT, Tg);
          const s = ax.length();
          if (s > 1e-5) Nn.applyAxisAngle(ax.multiplyScalar(1 / s), Math.asin(Math.min(1, s)));
          Nn.addScaledVector(Tg, -Nn.dot(Tg)).normalize();
        }
        prevT.copy(Tg);
        // gentle linear taper to the tip radius, then the round cap
        let rad = (lay.rootRadius + (lay.tipRadius - lay.rootRadius) * Math.min(1, u / Math.max(tipU, 1e-3))) * Math.cos(th);
        if (rootInset > 0 && ringS[r]! < rootLen) {
          const e = ringS[r]! / rootLen;
          rad *= 1 - rootInset * (1 - e * e * (3 - 2 * e));
        }
        const k = o + r * 12;
        frames[k] = C.x, frames[k + 1] = C.y, frames[k + 2] = C.z, frames[k + 3] = rad;
        frames[k + 4] = Nn.x, frames[k + 5] = Nn.y, frames[k + 6] = Nn.z, frames[k + 7] = Math.cos(th);
        frames[k + 8] = Tg.x, frames[k + 9] = Tg.y, frames[k + 10] = Tg.z, frames[k + 11] = u;
      }
      // tip vertex: end point, normal = last ring tangent
      spline.point(1, C);
      const k = o + RINGS * 12;
      frames[k] = C.x, frames[k + 1] = C.y, frames[k + 2] = C.z, frames[k + 3] = 0;
      frames[k + 4] = 0, frames[k + 5] = 0, frames[k + 6] = 0, frames[k + 7] = 1;
      frames[k + 8] = Tg.x, frames[k + 9] = Tg.y, frames[k + 10] = Tg.z, frames[k + 11] = 1;
    };
    // static attributes (rest pose on the CPU for bounds / non-GPU consumers, strand coords, uv, vertex ids)
    const writeStatic = (t: number) => {
      const lay = L!;
      const o = t * vertsPer;
      const fo = t * FW * 4;
      for (let r = 0; r < RINGS; r++) {
        const k = fo + r * 12;
        const rad = frames[k + 3]!, cth = frames[k + 7]!, u = frames[k + 11]!;
        const sth = Math.sqrt(Math.max(0, 1 - cth * cth));
        Nn.set(frames[k + 4]!, frames[k + 5]!, frames[k + 6]!);
        Tg.set(frames[k + 8]!, frames[k + 9]!, frames[k + 10]!);
        const B = tmp.crossVectors(Tg, Nn);
        for (let a = 0; a < RADIAL; a++) {
          const ang = (a / RADIAL) * Math.PI * 2;
          const cs = Math.cos(ang), sn = Math.sin(ang);
          tmp2.set(Nn.x * cs + B.x * sn, Nn.y * cs + B.y * sn, Nn.z * cs + B.z * sn);
          const i = o + r * RADIAL + a;
          pos[i * 3] = frames[k]! + tmp2.x * rad;
          pos[i * 3 + 1] = frames[k + 1]! + tmp2.y * rad;
          pos[i * 3 + 2] = frames[k + 2]! + tmp2.z * rad;
          nor[i * 3] = tmp2.x * cth + Tg.x * sth;
          nor[i * 3 + 1] = tmp2.y * cth + Tg.y * sth;
          nor[i * 3 + 2] = tmp2.z * cth + Tg.z * sth;
          // stable strand coordinate in body units (around the tube × along it, per tentacle offset)
          coord[i * 3] = Math.cos(ang) * lay.rootRadius + t * 7.3;
          coord[i * 3 + 1] = Math.sin(ang) * lay.rootRadius;
          coord[i * 3 + 2] = u * lay.length;
          uv[i * 2] = a / RADIAL;
          uv[i * 2 + 1] = u;
          tubeVert[i * 3] = t, tubeVert[i * 3 + 1] = r, tubeVert[i * 3 + 2] = a;
        }
      }
      const ti = o + RINGS * RADIAL;
      const k = fo + RINGS * 12;
      pos.set([frames[k]!, frames[k + 1]!, frames[k + 2]!], ti * 3);
      nor.set([frames[k + 8]!, frames[k + 9]!, frames[k + 10]!], ti * 3);
      uv.set([0, 1], ti * 2);
      tubeVert.set([t, RINGS, -1], ti * 3);
    };

    // sleep: once the chains have settled (and neither the body transform nor the definition
    // changes) the simulation, tube rebuild and attribute uploads stop; any motion wakes them
    // chain points in procedural space (tube frames + limb tips); rest pose until the first step
    const local = chains.map((c) => Array.from({ length: N }, (_, i) => c.rest[i]!.clone()));
    let lastDef: ResolvedAvatarDefinition | null = null;
    let still = 0;
    let asleep = false;

    const limbs: RigLimbs = {
      count: T,
      tip(i, out) {
        const pts = local[i];
        if (!pts) return false;
        out.position.copy(pts[N - 1]!);
        out.normal.subVectors(pts[N - 1]!, pts[N - 2]!).normalize();
        return true;
      },
      points: N,
      point(i, k, out) {
        const p = local[i]?.[k];
        return p ? (out.copy(p), true) : false;
      },
    };
    ctx.limbs = limbs;

    ctx.updaters.push(function stepTentacles(f) {
      proc.updateWorldMatrix(true, false);
      if (f.definition !== lastDef) {
        relayout(f.definition);
        lastDef = f.definition;
        still = 0;
      }
      // body motion (vs the last simulated frame, or since falling asleep): sub-threshold drift is carried
      // rigidly (the tubes live in body space), anything more wakes the simulation
      const me = mat.elements, we = proc.matrixWorld.elements;
      for (let i = 0; i < 16; i++)
        if (Math.abs(me[i]! - we[i]!) > BODY_EPS) {
          still = 0;
          break;
        }
      // reach request → hold point of its limb (procedural space)
      const rc = L!.reach, rq = f.reach;
      pullW.fill(0);
      const limb = rc ? (rq?.side ? rc.sides?.[rq.side] ?? rc.limb : rc.limb) : -1;
      if (rc && limb >= 0 && limb < T && rq && rq.target && rq.weight > 1e-4 && ctx.anchors.resolve(rq.target, anchor)) {
        pullW[limb] = rq.weight;
        const k = 1 - rq.approach;
        // the hold offset is authored for the default limb: mirror it for a limb on the other side
        const mx = Math.sign(L!.roots[limb]!.position[0]) === Math.sign(L!.roots[rc.limb]!.position[0]) ? 1 : -1;
        pullAt[limb]!.set(anchor.position.x + rc.offset[0] * k * mx + rq.ox, anchor.position.y + rc.offset[1] * k + rq.oy, anchor.position.z + rc.offset[2] * k + rq.oz);
      }
      // per-limb requests: hold point = anchor + offset × (1 − approach) (the stronger request wins a limb)
      const lt = f.limbs;
      if (lt && lt.active > 0)
        for (let j = 0; j < lt.states.length; j++) {
          const ls = lt.states[j]!;
          const li = ls.limb;
          if (!ls.target || ls.weight <= 1e-4 || li < 0 || li >= T || ls.weight <= pullW[li]!) continue;
          if (!ctx.anchors.resolve(ls.target, anchor)) continue;
          pullW[li] = ls.weight;
          const ka = 1 - ls.approach;
          pullAt[li]!.set(anchor.position.x + ls.ox * ka, anchor.position.y + ls.oy * ka, anchor.position.z + ls.oz * ka);
        }
      // any change wakes the simulation (numeric compares only)
      for (let t = 0; t < T; t++) {
        const w = pullW[t]!;
        if (w !== pullLastW[t] || (w > 0 && pullAt[t]!.distanceToSquared(pullLastAt[t]!) > 1e-12)) still = 0;
        pullLastW[t] = w;
        pullLastAt[t]!.copy(pullAt[t]!);
      }
      const calm = lt ? lt.calm : 0, slack = lt ? lt.slack : 0;
      if (calm !== lastCalm || slack !== lastSlack) still = 0;
      lastCalm = calm;
      lastSlack = slack;
      if (still >= SLEEP_FRAMES) {
        asleep = true;
        fur.update(f.definition, f.time, f.revision);
        return;
      }
      const lay = L!;
      if (asleep) {
        // waking: the chains rest where the body carried them (body space), at rest
        asleep = false;
        for (let t = 0; t < T; t++) {
          const c = chains[t]!, pts = local[t]!;
          for (let i = 0; i < N; i++) c.q[i]!.copy(c.p[i]!.copy(pts[i]!).applyMatrix4(proc.matrixWorld));
        }
      }
      if (!colReady) colReady = buildCollision();
      const col = colReady ? lay.collision! : null;
      const slide = col?.slide ?? 0.7;
      // teleport (e.g. the host re-positions the avatar right after creation): carry the chains along
      // rigidly instead of flinging them (a root jump of over half a tentacle in one frame is never motion)
      if (init) {
        const r0 = tmp2.copy(chains[0]!.rest[0]!).applyMatrix4(proc.matrixWorld);
        const lim = lay.length * (tmp.setFromMatrixScale(proc.matrixWorld).x || 1) * 0.5;
        if (r0.distanceToSquared(chains[0]!.p[0]!) > lim * lim) {
          jump.multiplyMatrices(proc.matrixWorld, inv);
          for (const c of chains) for (let i = 0; i < N; i++) (c.p[i]!.applyMatrix4(jump), c.q[i]!.applyMatrix4(jump));
        }
      }
      mat.copy(proc.matrixWorld);
      inv.copy(mat).invert();
      const scale = tmp.setFromMatrixScale(mat).x || 1;
      const seg = (lay.length / (N - 1)) * scale;
      const floorW = tmp2.set(0, lay.floorY + cy, 0).applyMatrix4(mat).y;
      if (!init) {
        init = true;
        for (const c of chains) for (let i = 0; i < N; i++) c.q[i]!.copy(c.p[i]!.copy(c.rest[i]!).applyMatrix4(mat));
      }
      const dt = Math.min(f.dt, 1 / 30) / SUB;
      down.set(0, -(lay.gravity ?? 9) * scale * dt * dt, 0);
      // tone: calm damps harder and pulls home firmly (still), slack loosens the home pull (limp)
      const damp = (lay.damping ?? 0.985) * (1 - 0.07 * calm);
      const tone = (1 + 2.2 * calm) * (1 - 0.65 * slack);
      const stiff = lay.stiffness ?? STIFFNESS;
      const k0 = stiff[0], k1 = stiff[1];
      for (const c of chains) for (let i = 0; i < N; i++) c.restW[i]!.copy(c.rest[i]!).applyMatrix4(mat);
      if (col) centerW.copy(colO).applyMatrix4(mat);
      for (let t = 0; t < T; t++) {
        const rw = pullW[t]!;
        if (rw <= 0) continue;
        const reacher = chains[t]!, arc = arcs[t]!;
        reachW.copy(pullAt[t]!).applyMatrix4(mat);
        upW.set(0, 1, 0).transformDirection(mat);
        if (col) {
          // with a body to clear, the arch bulges away from it (around the outside, not through it)
          tmp.addVectors(reacher.restW[0]!, reachW).multiplyScalar(0.5).sub(centerW);
          if (tmp.lengthSq() > 1e-9) upW.addScaledVector(tmp.normalize(), 2).normalize();
        }
        reachArc(reacher.restW[0]!, reachW, lay.length * scale, upW, arc);
        // the pinned root section stays on the body
        for (let i = 1; i < pin; i++) arc[i]!.copy(reacher.restW[i]!);
        // the weight blends the pose (rest → arc), so rising / lowering follow the weight's ease instead of snapping
        for (let i = 0; i < N; i++) arc[i]!.lerpVectors(reacher.restW[i]!, arc[i]!, rw);
      }
      const strength = rc?.strength ?? 0.35;
      for (let s = 0; s < SUB; s++)
        for (let t = 0; t < T; t++) {
          const c = chains[t]!;
          const rw = pullW[t]!;
          const reaching = rw > 0;
          const arc = arcs[t]!;
          const pull = Math.min(1, 2 * rw) * strength;
          // integrate (the pinned root section is not simulated)
          for (let i = pin; i < N; i++) {
            const p = c.p[i]!, q = c.q[i]!;
            tmp.subVectors(p, q).multiplyScalar(damp);
            q.copy(p);
            p.add(tmp).add(down);
            // soft pull toward the rest pose (strong at the root, loose at the tip)
            const k = Math.min(0.9, (k0 + (k1 - k0) * Math.sqrt(i / (N - 1))) * tone);
            if (!reaching) p.lerp(c.restW[i]!, k * 0.5);
            else {
              // reaching: rest pull fades out, the (weight-blended) arc pull fades in (strongest at the tip)
              p.lerp(c.restW[i]!, k * 0.5 * (1 - rw));
              p.lerp(arc[i]!, pull * (0.2 + 0.8 * (i / (N - 1))));
            }
          }
          // rigid root: pinned to the body (this frame's transform, no velocity), the next point held close
          for (let i = 0; i < pin; i++) c.q[i]!.copy(c.p[i]!.copy(c.restW[i]!));
          c.p[pin]!.lerp(c.restW[pin]!, 0.8);
          // length constraints + floor
          for (let it = 0; it < ITER; it++) {
            for (let i = pin; i < N; i++) {
              const a = c.p[i - 1]!, b = c.p[i]!;
              tmp.subVectors(b, a);
              const d = tmp.length() || 1e-6;
              const diff = (d - seg) / d;
              if (i === pin) b.addScaledVector(tmp, -diff);
              else {
                a.addScaledVector(tmp, diff * 0.5);
                b.addScaledVector(tmp, -diff * 0.5);
              }
            }
            for (let i = pin; i < N; i++) {
              const u = i / (N - 1);
              const r = (lay.rootRadius + (lay.tipRadius - lay.rootRadius) * u) * scale;
              const p = c.p[i]!;
              if (p.y < floorW + r) {
                p.y = floorW + r;
                // floor friction
                c.q[i]!.x += (p.x - c.q[i]!.x) * 0.3;
                c.q[i]!.z += (p.z - c.q[i]!.z) * 0.3;
              }
              // body: out to the surface + margin + tube radius
              if (col) collide(c, i, floorW + r, slide);
            }
          }
        }
      // body-space chain points + settle check: largest per-frame motion relative to the body, vs. a segment
      let motion = 0;
      for (let t = 0; t < T; t++) {
        const c = chains[t]!, pts = local[t]!;
        for (let i = 0; i < N; i++) {
          tmp.copy(c.p[i]!).applyMatrix4(inv);
          motion = Math.max(motion, tmp.distanceToSquared(pts[i]!));
          pts[i]!.copy(tmp);
        }
        writeFrames(t, pts);
      }
      still = motion < ((lay.length / (N - 1)) * SLEEP_EPS) ** 2 ? still + 1 : 0;
      frameTex.needsUpdate = true;
      fur.update(f.definition, f.time, f.revision);
    });
    // first frame before any update: rest pose
    chains.forEach((c, t) => (writeFrames(t, c.rest), writeStatic(t)));
  },
});
