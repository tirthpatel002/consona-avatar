import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import type { AvatarBodyOptions } from '../../../../core/types/AvatarDefinition.ts';
import { registerAtomDrawer } from '../atomDrawers.ts';
import type { ThreeAvatarRig } from '../assembleRig.ts';

/**
 * SDF body: one continuous mesh polygonised (marching cubes) from a signed
 * distance field, for bodies the shared morph grid can't represent (limbs that
 * curl back, overhangs...). Vertices are Newton-projected onto the zero set and
 * get analytic SDF normals, so fur shells sit on a smooth skin.
 *
 * Field space follows the body convention: centred near the origin, bottom at
 * y ≈ -1; the part lifts it by the profile's `bodyCenterY`.
 */
export type Vec3 = [number, number, number];

export interface SdfBodyField {
  /** Signed distance (negative inside). */
  sdf(x: number, y: number, z: number): number;
  bounds: { min: Vec3; max: Vec3 };
  /** Cache key of the polygonised mesh (default: shape + params). Same key = mesh reused. */
  key?: string;
  /** Grid cells per axis (default 72). */
  resolution?: number;
  /** Extra per-vertex scalar attributes from the surface point + normal (field space), e.g. `furTint`. */
  attributes?: Record<string, (p: Vec3, n: Vec3) => number>;
}

export type SdfBodyBuilder = (params: Record<string, unknown>, body: AvatarBodyOptions) => SdfBodyField;

const builders = new Map<string, SdfBodyBuilder>();

/** Register an SDF body under a `body.shape` name (used by the `sdfBody` atom drawer). */
export function registerSdfBody(name: string, builder: SdfBodyBuilder): void {
  builders.set(name, builder);
}

export function getSdfBody(name: string): SdfBodyBuilder | undefined {
  return builders.get(name);
}

const NORMAL_EPS = 0.01;

function gradient(f: SdfBodyField['sdf'], x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const e = NORMAL_EPS;
  return out
    .set(f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e))
    .normalize();
}

/** Classic SDF ambient occlusion: how much the field closes in along the normal (1 = open, ~0.4 = deep crease). */
function sdfOcclusion(f: SdfBodyField['sdf'], p: THREE.Vector3, n: THREE.Vector3): number {
  let occ = 0;
  let w = 1;
  for (let i = 1; i <= 5; i++) {
    const h = 0.06 * i;
    occ += w * Math.max(0, h - f(p.x + n.x * h, p.y + n.y * h, p.z + n.z * h));
    w *= 0.6;
  }
  return Math.min(1, Math.max(0.35, 1 - occ * 3.2));
}

export interface SdfBodyMesh {
  attributes: Record<string, THREE.BufferAttribute>;
  index: THREE.BufferAttribute;
}

/**
 * Polygonise a field: marching cubes, then weld the duplicated per-triangle
 * vertices (~6× fewer) before the expensive per-vertex work (Newton
 * projection, normals, AO, attributes); indexed output with outward winding.
 */
export function polygonizeSdf(field: SdfBodyField, translateY = 0): SdfBodyMesh {
  const res = field.resolution ?? 72;
  const { min, max } = field.bounds;
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 400000);
  mc.isolation = 0;
  const f = field.sdf;
  const F = mc.field;
  // marching cubes maps cell i to (i / res) of the box (see MarchingCubes' halfsize mapping)
  for (let z = 0; z < res; z++) {
    const pz = min[2] + (z / res) * size[2];
    for (let y = 0; y < res; y++) {
      const py = min[1] + (y / res) * size[1];
      for (let x = 0; x < res; x++) F[x + y * res + z * res * res] = -f(min[0] + (x / res) * size[0], py, pz);
    }
  }
  mc.update();
  const tri = mc.count;
  const src = mc.positionArray;
  // weld: identical edge vertices are emitted bit-identically by neighbouring cubes
  const ids = new Map<string, number>();
  const idx = new Uint32Array(tri);
  const raw: number[] = [];
  for (let i = 0; i < tri; i++) {
    const x = src[i * 3]!, y = src[i * 3 + 1]!, z = src[i * 3 + 2]!;
    const k = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let id = ids.get(k);
    if (id === undefined) {
      id = raw.length / 3;
      ids.set(k, id);
      raw.push(x, y, z);
    }
    idx[i] = id;
  }
  mc.geometry.dispose();
  (mc.material as THREE.Material).dispose();
  const count = raw.length / 3;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  // fur helpers: stable strand coordinate (rest position) + crease occlusion
  const coord = new Float32Array(count * 3);
  const ao = new Float32Array(count);
  const extra = Object.entries(field.attributes ?? {}).map(([name, fn]) => ({ name, fn, data: new Float32Array(count) }));
  const p = new THREE.Vector3();
  const g = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    p.set(min[0] + (raw[i * 3]! * 0.5 + 0.5) * size[0], min[1] + (raw[i * 3 + 1]! * 0.5 + 0.5) * size[1], min[2] + (raw[i * 3 + 2]! * 0.5 + 0.5) * size[2]);
    // Newton-project onto the zero set (smooth skin, no grid stair-steps)
    for (let it = 0; it < 3; it++) {
      const d = f(p.x, p.y, p.z);
      gradient(f, p.x, p.y, p.z, g);
      p.addScaledVector(g, -d);
    }
    gradient(f, p.x, p.y, p.z, g);
    pos.set([p.x, p.y + translateY, p.z], i * 3);
    coord.set([p.x, p.y, p.z], i * 3);
    nor.set([g.x, g.y, g.z], i * 3);
    ao[i] = sdfOcclusion(f, p, g);
    uv[i * 2] = 0.5 + Math.atan2(p.x, p.z) / (Math.PI * 2);
    uv[i * 2 + 1] = (p.y - min[1]) / size[1];
    for (const a of extra) a.data[i] = a.fn([p.x, p.y, p.z], [g.x, g.y, g.z]);
  }
  // outward winding (face normal agrees with the field gradient); drop degenerate triangles
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const index: number[] = [];
  for (let t = 0; t + 2 < tri; t += 3) {
    const i0 = idx[t]!, i1 = idx[t + 1]!, i2 = idx[t + 2]!;
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    a.fromArray(pos, i0 * 3);
    b.fromArray(pos, i1 * 3).sub(a);
    c.fromArray(pos, i2 * 3).sub(a);
    b.cross(c);
    g.fromArray(nor, i0 * 3);
    if (b.dot(g) < 0) index.push(i0, i2, i1);
    else index.push(i0, i1, i2);
  }
  const attributes: Record<string, THREE.BufferAttribute> = {
    position: new THREE.BufferAttribute(pos, 3),
    normal: new THREE.BufferAttribute(nor, 3),
    uv: new THREE.BufferAttribute(uv, 2),
    furCoord: new THREE.BufferAttribute(coord, 3),
    furAO: new THREE.BufferAttribute(ao, 1),
  };
  for (const x of extra) attributes[x.name] = new THREE.BufferAttribute(x.data, 1);
  return { attributes, index: new THREE.BufferAttribute(new Uint32Array(index), 1) };
}

const meshCache = new Map<string, SdfBodyMesh>();

/** Cached polygonisation (by the field's `key`, else shape + params): each shape is built once. */
function cachedMesh(body: AvatarBodyOptions, translateY: number): { key: string; mesh: SdfBodyMesh; field: SdfBodyField } {
  const field = fieldFor(body);
  const key = `${field.key ?? `${String(body.shape)}|${JSON.stringify(body.params ?? {})}`}|${translateY}`;
  let mesh = meshCache.get(key);
  if (!mesh) {
    mesh = polygonizeSdf(field, translateY);
    if (meshCache.size > 8) meshCache.delete(meshCache.keys().next().value!);
    meshCache.set(key, mesh);
  }
  return { key, mesh, field };
}

/** Pre-build (and cache) an SDF body mesh in idle time (e.g. at package install) so mounting is instant. */
export function warmSdfBody(body: AvatarBodyOptions, translateY: number): void {
  const run = () => {
    try {
      cachedMesh(body, translateY);
    } catch {
      /* shape not registered yet: built on mount instead */
    }
  };
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(run, { timeout: 2000 });
  else setTimeout(run, 0);
}

/** Sphere-traced surface samplers on the field itself (exact; no raycasts over 100k+ triangles). */
function fieldSamplers(get: () => SdfBodyField, translateY: number): Pick<ThreeAvatarRig, 'surfaceAt' | 'surfaceRadial'> {
  const march = (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tMax: number): number | null => {
    const f = get().sdf;
    let t = 0;
    for (let i = 0; i < 160 && t < tMax; i++) {
      const d = f(ox + dx * t, oy + dy * t, oz + dz * t);
      if (d < 1e-4) return t;
      t += Math.max(d * 0.9, 1e-4);
    }
    return null;
  };
  const g = new THREE.Vector3();
  return {
    surfaceAt(x, y, point, normal) {
      const fy = y - translateY;
      const z0 = get().bounds.max[2] + 0.5;
      const t = march(x, fy, z0, 0, 0, -1, 20);
      if (t === null) return false;
      point.set(x, y, z0 - t);
      gradient(get().sdf, x, fy, z0 - t, g);
      normal.copy(g);
      if (normal.z < 0) normal.negate();
      return true;
    },
    surfaceRadial(origin, dir) {
      // from outside inward: the first hit is the outer skin
      const ox = origin.x + dir.x * 5, oy = origin.y - translateY + dir.y * 5, oz = origin.z + dir.z * 5;
      const t = march(ox, oy, oz, -dir.x, -dir.y, -dir.z, 10);
      return t === null ? null : 5 - t;
    },
  };
}

function writeMesh(geo: THREE.BufferGeometry, mesh: SdfBodyMesh): void {
  for (const name of Object.keys(geo.attributes)) if (!(name in mesh.attributes)) geo.deleteAttribute(name);
  for (const [name, attr] of Object.entries(mesh.attributes)) geo.setAttribute(name, attr);
  geo.setIndex(mesh.index);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.userData.version = ((geo.userData.version as number | undefined) ?? 0) + 1;
}

function fieldFor(body: AvatarBodyOptions): SdfBodyField {
  const name = typeof body.shape === 'string' ? body.shape : '';
  const builder = builders.get(name);
  if (!builder) throw new Error(`[rig] sdfBody: no SDF body registered as '${name}'`);
  return builder(body.params ?? {}, body);
}

/**
 * Rig part `sdfBody` (drop-in for `body`): builds the body from the SDF named
 * by `body.shape`. Shape / param edits rebuild the same geometry object in
 * place (`geometry.userData.rebuildBody`), so shells and probes keep sharing it.
 */
registerAtomDrawer({
  kind: 'sdfBody',
  build(ctx) {
    const translateY = ctx.profile.bodyCenterY;
    const geo = new THREE.BufferGeometry();
    let cur = cachedMesh(ctx.def.body, translateY);
    writeMesh(geo, cur.mesh);
    geo.userData.rebuildBody = (body: AvatarBodyOptions) => {
      const next = cachedMesh(body, translateY);
      if (next.key === cur.key) return; // e.g. a param the field doesn't use
      cur = next;
      writeMesh(geo, cur.mesh);
    };
    ctx.geometry = geo;
    const local = new THREE.Mesh(geo);
    local.updateMatrixWorld(true);
    ctx.probe = local;
    Object.assign(ctx, fieldSamplers(() => cur.field, translateY));
  },
});
