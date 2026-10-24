import { hypot3 } from '../math/hypot.ts';
import type { AvatarBodyOptions, BodyShapeName, ShapeDeformer } from '../types/AvatarDefinition.ts';
import { resolveShape } from './bodyShapes.ts';

/**
 * Shared fixed-topology body representation (renderer-agnostic maths).
 *
 * Every body shape (deformed spheres AND registered surfaces like tori or
 * arches) is sampled onto the same (W+1)×(H+1) vertex grid with one shared
 * index buffer, so swapping a character's body is just interpolating vertex
 * positions / normals / uvs. Grid cell (i, j): u = i/W around, v = j/H along.
 * Every quad emits both triangles, so non-sphere surfaces (a torus has no
 * poles) have no holes; on spheres the pole triangles are simply degenerate.
 * Renderers wrap the arrays in their own buffers (see the Three adapter's
 * `rig/parts/bodyGrid.ts`).
 */
export const BODY_GRID = { W: 128, H: 96 } as const;

export interface BodyTarget {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
}

/** Mutable 3-vector accepted by grid surfaces (THREE.Vector3 satisfies it). */
export interface GridVec3 {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
}
/** Mutable 2-vector accepted by grid surfaces (THREE.Vector2 satisfies it). */
export interface GridVec2 {
  x: number;
  y: number;
  set(x: number, y: number): unknown;
}

class V3 implements GridVec3 {
  x = 0;
  y = 0;
  z = 0;
  set(x: number, y: number, z: number) {
    this.x = x, this.y = y, this.z = z;
    return this;
  }
}
class V2 implements GridVec2 {
  x = 0;
  y = 0;
  set(x: number, y: number) {
    this.x = x, this.y = y;
    return this;
  }
}

/** Writes the surface point for grid coords (u, v ∈ [0, 1]) into `out`, and its uv into `uv`. */
export type GridSurface = (u: number, v: number, out: GridVec3, uv: GridVec2) => void;

let indexCache: Uint32Array | null = null;
/** The shared triangle index (do not mutate). */
export function bodyGridIndices(): Uint32Array {
  if (indexCache) return indexCache;
  const { W, H } = BODY_GRID;
  const idx: number[] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const a = j * (W + 1) + i + 1;
      const b = j * (W + 1) + i;
      const c = (j + 1) * (W + 1) + i;
      const d = (j + 1) * (W + 1) + i + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  indexCache = new Uint32Array(idx);
  return indexCache;
}

export const bodyGridCount = () => (BODY_GRID.W + 1) * (BODY_GRID.H + 1);

/** Unit sphere on the grid (matches THREE.SphereGeometry positions/uvs). */
export const sphereSurface: GridSurface = (u, v, out, uv) => {
  const phi = u * Math.PI * 2;
  const th = v * Math.PI;
  out.set(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
  uv.set(u, 1 - v);
};

/** Sample a surface onto the grid, fix orientation (outward winding), and build smooth, seam-welded normals. */
export function sampleBodyTarget(surface: GridSurface, translateY = 0, alignBottom?: number): BodyTarget {
  const { W, H } = BODY_GRID;
  const n = bodyGridCount();
  let position = new Float32Array(n * 3);
  let uv = new Float32Array(n * 2);
  const p = new V3();
  const t = new V2();
  for (let j = 0; j <= H; j++) {
    for (let i = 0; i <= W; i++) {
      const k = j * (W + 1) + i;
      surface(i / W, j / H, p, t);
      position.set([p.x, p.y + translateY, p.z], k * 3);
      uv.set([t.x, t.y], k * 2);
    }
  }
  if (alignBottom !== undefined) {
    let min = Infinity;
    for (let k = 1; k < position.length; k += 3) min = Math.min(min, position[k]!);
    const dy = alignBottom + translateY - min;
    for (let k = 1; k < position.length; k += 3) position[k]! += dy;
  }
  // the shared index must wind outward for every shape: flip the rows if this surface is inside-out
  if (signedVolume(position) < 0) {
    const fp = new Float32Array(n * 3);
    const fu = new Float32Array(n * 2);
    for (let j = 0; j <= H; j++) {
      const src = (H - j) * (W + 1);
      const dst = j * (W + 1);
      fp.set(position.subarray(src * 3, (src + W + 1) * 3), dst * 3);
      fu.set(uv.subarray(src * 2, (src + W + 1) * 2), dst * 2);
    }
    position = fp;
    uv = fu;
  }
  return { position, uv, normal: weldedNormals(position) };
}

function signedVolume(pos: Float32Array): number {
  const idx = bodyGridIndices();
  let v = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f]! * 3, b = idx[f + 1]! * 3, c = idx[f + 2]! * 3;
    v +=
      pos[a]! * (pos[b + 1]! * pos[c + 2]! - pos[b + 2]! * pos[c + 1]!) -
      pos[a + 1]! * (pos[b]! * pos[c + 2]! - pos[b + 2]! * pos[c]!) +
      pos[a + 2]! * (pos[b]! * pos[c + 1]! - pos[b + 1]! * pos[c]!);
  }
  return v;
}

/** Area-weighted indexed vertex normals (same arithmetic as THREE.BufferGeometry.computeVertexNormals). */
function vertexNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
  const nrm = new Float32Array(pos.length);
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f]! * 3, b = idx[f + 1]! * 3, c = idx[f + 2]! * 3;
    const cbx = pos[c]! - pos[b]!, cby = pos[c + 1]! - pos[b + 1]!, cbz = pos[c + 2]! - pos[b + 2]!;
    const abx = pos[a]! - pos[b]!, aby = pos[a + 1]! - pos[b + 1]!, abz = pos[a + 2]! - pos[b + 2]!;
    const x = cby * abz - cbz * aby, y = cbz * abx - cbx * abz, z = cbx * aby - cby * abx;
    for (const o of [a, b, c]) {
      nrm[o] = nrm[o]! + x;
      nrm[o + 1] = nrm[o + 1]! + y;
      nrm[o + 2] = nrm[o + 2]! + z;
    }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const x = nrm[i]!, y = nrm[i + 1]!, z = nrm[i + 2]!;
    const k = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    nrm[i] = x * k, nrm[i + 1] = y * k, nrm[i + 2] = z * k;
  }
  return nrm;
}

/** Area-weighted vertex normals, averaged across coincident vertices (uv seams, poles, closed tubes). */
export function weldedNormals(pos: Float32Array): Float32Array {
  const nrm = vertexNormals(pos, bodyGridIndices());
  const groups = new Map<string, number[]>();
  for (let i = 0; i < pos.length / 3; i++) {
    const key = `${Math.round(pos[i * 3]! * 1e4)},${Math.round(pos[i * 3 + 1]! * 1e4)},${Math.round(pos[i * 3 + 2]! * 1e4)}`;
    const l = groups.get(key);
    if (l) l.push(i);
    else groups.set(key, [i]);
  }
  for (const l of groups.values()) {
    if (l.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of l) x += nrm[i * 3]!, y += nrm[i * 3 + 1]!, z += nrm[i * 3 + 2]!;
    const k = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    x *= k, y *= k, z *= k;
    for (const i of l) nrm.set([x, y, z], i * 3);
  }
  return nrm;
}

export function lerpInto(out: Float32Array, a: Float32Array, b: Float32Array, k: number): void {
  for (let i = 0; i < out.length; i++) out[i] = a[i]! + (b[i]! - a[i]!) * k;
}

/** Write lerp(a, b, k) into the given arrays (normals re-normalised mid-morph). */
export function lerpBodyTarget(out: BodyTarget, a: BodyTarget, b: BodyTarget, k: number): void {
  lerpInto(out.position, a.position, b.position, k);
  lerpInto(out.uv, a.uv, b.uv, k);
  const n = out.normal;
  lerpInto(n, a.normal, b.normal, k);
  if (k > 0 && k < 1) {
    for (let i = 0; i < n.length; i += 3) {
      const l = hypot3(n[i]!, n[i + 1]!, n[i + 2]!) || 1;
      n[i]! /= l, n[i + 1]! /= l, n[i + 2]! /= l;
    }
  }
}

// ---------- body surface registry ----------

/**
 * Grid form of a named body (for in-place morphing): the surface point for
 * grid coords (u around, v along, both 0..1). `alignBottom` shifts the sampled
 * body so its lowest point sits at that y.
 */
export type BodyGridSurfaceBuilder = (params: Record<string, unknown>, body: AvatarBodyOptions) => { surface: GridSurface; alignBottom?: number };

const bodySurfaces = new Map<string, BodyGridSurfaceBuilder>();

/** Register the grid surface of a named (non-deformed-sphere) body. */
export function registerBodySurface(name: string, builder: BodyGridSurfaceBuilder): void {
  bodySurfaces.set(name, builder);
}

export function hasBodySurface(name: string): boolean {
  return bodySurfaces.has(name);
}

export function listBodySurfaces(): string[] {
  return Array.from(bodySurfaces.keys());
}

const targetCache = new Map<string, BodyTarget>();

/** Body sampled on the shared morph grid (cached per shape+params), lifted by `translateY`. */
export function createBodyTarget(body: AvatarBodyOptions, translateY = 0): BodyTarget {
  const shape = body.shape;
  const key = typeof shape === 'string' ? `${shape}|${JSON.stringify(body.params ?? {})}|${translateY}` : null;
  const hit = key ? targetCache.get(key) : undefined;
  if (hit) return hit;
  let t: BodyTarget;
  const named = typeof shape === 'string' ? shape : null;
  if (named && bodySurfaces.has(named)) {
    const { surface, alignBottom } = bodySurfaces.get(named)!(body.params ?? {}, body);
    t = sampleBodyTarget(surface, translateY, alignBottom);
  } else {
    const fn = resolveShape(shape as BodyShapeName | ShapeDeformer);
    t = sampleBodyTarget((u, v, out, uv) => {
      sphereSurface(u, v, out, uv);
      fn(out, Math.atan2(out.z, out.x));
    }, translateY);
  }
  if (key) {
    if (targetCache.size > 64) targetCache.delete(targetCache.keys().next().value!);
    targetCache.set(key, t);
  }
  return t;
}
