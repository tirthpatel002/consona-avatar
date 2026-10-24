import { hypot2, hypot3 } from '../math/hypot.ts';
import type { BodyShapeName, ShapeDeformer } from '../types/AvatarDefinition.ts';
import { ScopedRegistry } from '../registry/ScopedRegistry.ts';

/**
 * Body shape registry. Avatar packages register named vertex deformers;
 * definitions reference them by name or pass a deformer directly.
 */
const shapes = new ScopedRegistry<ShapeDeformer>().set('sphere', () => {});

export function registerAvatarShape(name: string, deformer: ShapeDeformer): void {
  shapes.set(name, deformer);
}

export function listAvatarShapes(): string[] {
  return shapes.names();
}

export function resolveShape(shape: BodyShapeName | ShapeDeformer): ShapeDeformer {
  if (typeof shape === 'function') return shape;
  const fn = shapes.get(shape);
  if (!fn) throw new Error(`Unknown avatar body shape "${String(shape)}" — registerAvatarShape() it first`);
  return fn;
}

/** Reverse lookup: registered name of a deformer function, if any. */
export function findAvatarShapeName(fn: ShapeDeformer): string | undefined {
  for (const e of shapes.entriesAll()) if (e.value === fn) return e.name;
  return undefined;
}

// ---------- generic deformer helpers (geometry, not character content) ----------

/**
 * Lathe deformer: maps a unit sphere onto a surface of revolution.
 * `profile(t)` gives the radius (0..1, times `width`) at normalised height t
 * (0 = bottom pole, 1 = top pole); the result spans y in [-1, -1 + height].
 */
export function createLatheDeformer(
  profile: (t: number) => number,
  opts: { height?: number; width?: number; depth?: number } = {},
): ShapeDeformer {
  const H = opts.height ?? 2;
  const W = opts.width ?? 1;
  const D = opts.depth ?? 1;
  return (v) => {
    const len = hypot3(v.x, v.y, v.z) || 1;
    const y = Math.max(-1, Math.min(1, v.y / len));
    const t = Math.acos(-y) / Math.PI;
    const ring = hypot2(v.x, v.z);
    const dx = ring > 1e-9 ? v.x / ring : 0;
    const dz = ring > 1e-9 ? v.z / ring : 0;
    const r = Math.max(0, profile(t)) * W;
    v.x = dx * r;
    v.z = dz * r * D;
    v.y = -1 + t * H;
  };
}

/** Superellipsoid deformer (rounded box when n > 2). `scale` = half extents. */
export function createSuperellipsoidDeformer(n: number, scale: [number, number, number] = [1, 1, 1]): ShapeDeformer {
  return (v) => {
    const len = hypot3(v.x, v.y, v.z) || 1;
    const x = v.x / len;
    const y = v.y / len;
    const z = v.z / len;
    const k = Math.pow(Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n), 1 / n) || 1;
    v.x = (x / k) * scale[0];
    v.y = (y / k) * scale[1];
    v.z = (z / k) * scale[2];
  };
}

/** Compose deformers left to right. */
export function chainDeformers(...fns: ShapeDeformer[]): ShapeDeformer {
  return (v, a) => {
    for (const f of fns) f(v, a);
  };
}

// ---------- lathe profile helpers (absolute body units: radius at height h above the bottom pole) ----------

/** Rounded-end radius r at height h of a cap/segment of total height H. */
export function capsuleProfile(h: number, H: number, R: number): number {
  if (h < R) return Math.sqrt(Math.max(0, R * R - (R - h) * (R - h)));
  if (h > H - R) return Math.sqrt(Math.max(0, R * R - (h - (H - R)) * (h - (H - R))));
  return R;
}

/** Circle-arc profile (radius at height h of a circle centred at c). */
export const circleProfile = (h: number, c: number, r: number) => Math.sqrt(Math.max(0, r * r - (h - c) * (h - c)));
/** Flat-bottomed profile: radius eased in over a small fillet at h = 0. */
export const filletProfile = (h: number, f: number) => (h >= f ? 1 : Math.sqrt(Math.max(0, 1 - ((f - h) / f) ** 2)));

/** Lathe deformer from an absolute-height profile `fn(h)` over height H. */
export const latheProfile = (H: number, depth: number, fn: (h: number) => number) =>
  createLatheDeformer((t) => fn(t * H), { height: H, width: 1, depth });

