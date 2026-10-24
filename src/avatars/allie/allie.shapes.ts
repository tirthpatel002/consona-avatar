import { hypot2, hypot3 } from '../../core/math/hypot.ts';
import type { ShapeDeformer } from '../../core/types/AvatarDefinition.ts';
import { capsuleProfile, circleProfile as circle, filletProfile as fillet, latheProfile as lathe, chainDeformers, createLatheDeformer, createSuperellipsoidDeformer, registerAvatarShape } from '../../core/scenegraph/bodyShapes.ts';

/** Max of sinθ·(sin^2(θ/2)+0.14): normalises the teardrop bulb to radius 1. */
const TEAR_MAX = (() => {
  let m = 0;
  for (let i = 0; i <= 2000; i++) {
    const t = (i / 2000) * Math.PI;
    m = Math.max(m, Math.sin(t) * (Math.pow(Math.sin(t / 2), 2.0) + 0.14));
  }
  return m;
})();

/** Allie-style body silhouettes (unit-sphere deformers). */
export const allieShapes = {
  /**
   * Teardrop: round bulb flowing in one smooth curve into a softly rounded tip
   * (x = sinθ·(sin^m(θ/2) + ε), y = cosθ — no cone sides, no hard point).
   */
  teardrop: (v) => {
    const len = hypot3(v.x, v.y, v.z) || 1;
    const y = Math.max(-1, Math.min(1, v.y / len));
    const ring = hypot2(v.x, v.z);
    const dx = ring > 1e-9 ? v.x / ring : 0;
    const dz = ring > 1e-9 ? v.z / ring : 0;
    const th = Math.acos(y); // 0 = tip, π = bottom
    const m = 2.0;
    const eps = 0.14; // tip roundness
    const r = (Math.sin(th) * (Math.pow(Math.sin(th / 2), m) + eps)) / TEAR_MAX;
    v.x = dx * r;
    v.z = dz * r;
    v.y = -1 + ((1 + y) / 2) * 2.55; // bottom -1 .. tip 1.55
  },
  /**
   * Flower: 8 identical tulip petals around a flat-ish centre (radially even).
   * Build it on a sphere whose poles face ±z (the 'allie:flower' body geometry)
   * so every petal gets the same tessellation.
   */
  flower: (v) => {
    const len = hypot3(v.x, v.y, v.z) || 1;
    const x = v.x / len;
    const y = v.y / len;
    const z = v.z / len;
    const a = Math.atan2(y, x);
    const c = Math.abs(Math.cos(4 * a)); // 8 lobes, one pointing straight up
    // broad rounded tulip petal with a gently pointed tip, narrow notches between petals
    const petal = 0.64 + 0.3 * Math.pow(c, 0.55) + 0.06 * Math.pow(c, 10);
    const inPlane = hypot2(x, y);
    const k = 1 + (petal - 1) * Math.min(1, inPlane * 1.25);
    v.x = x * k * 1.08;
    v.y = y * k * 1.08;
    v.z = z * 0.6 * (1 - 0.25 * inPlane * inPlane);
  },
  blob: (v) => {
    const k = 1 - 0.1 * Math.max(0, v.y);
    v.x *= k * 1.03;
    v.z *= k * 0.95;
  },
  dome: (v) => {
    v.y *= v.y > 0 ? 1.15 : 1;
    v.x *= 0.95;
    v.z *= 0.9;
  },
} satisfies Record<string, ShapeDeformer>;

export type AllieShapeName = keyof typeof allieShapes;


/**
 * Heart outline radius by polar angle (front view, x right / y up), measured
 * from the shape centre: the classic heart curve, resampled on a polar table,
 * circularly smoothed (soft point at the bottom, rounded cleft on top) and
 * normalised so the bottom tip sits at y = -1 and the width is ~2.2.
 */
const HEART = (() => {
  const N = 720;
  const pts: [number, number][] = [];
  for (let i = 0; i < 4000; i++) {
    const t = (i / 4000) * Math.PI * 2;
    pts.push([16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]);
  }
  // centre between the cleft and the tip so every polar ray hits the outline once
  const cy = 1.5;
  const r = new Float64Array(N);
  for (const [x, y] of pts) {
    const a = Math.atan2(y - cy, x);
    const k = Math.round(((a + Math.PI) / (2 * Math.PI)) * N) % N;
    r[k] = Math.max(r[k]!, hypot2(x, y - cy));
  }
  // fill gaps, then smooth (soft tip / cleft)
  for (let k = 0; k < N; k++) if (!r[k]) r[k] = r[(k + N - 1) % N]!;
  let out = Array.from(r);
  for (let pass = 0; pass < 3; pass++) {
    const w = 9;
    out = out.map((_, k) => {
      let sum = 0;
      for (let j = -w; j <= w; j++) sum += out[(k + j + N) % N]!;
      return sum / (2 * w + 1);
    });
  }
  // normalise: tip (angle -π/2) to radius such that bottom = -1 after centring at 0
  const tip = out[Math.round(N / 4) % N]!;
  const scale = 1 / tip;
  return { N, r: out.map((x) => x * scale), sx: 1.12 };
})();

const heartRadius = (a: number) => {
  const f = ((a + Math.PI) / (2 * Math.PI)) * HEART.N;
  const i = Math.floor(f);
  const t = f - i;
  return HEART.r[((i % HEART.N) + HEART.N) % HEART.N]! * (1 - t) + HEART.r[(((i + 1) % HEART.N) + HEART.N) % HEART.N]! * t;
};

// ---------- "Threadies" silhouettes (measured from the reference lineup) ----------
// Profiles are written in absolute body units (radius at height h above the
// bottom pole); the lathe spans y in [-1, -1 + H].

/** Translate so the lowest point sits at y = -1 (keeps the standard body footing). */
const footAt = (bottom: number) => (v: { y: number }) => {
  v.y += -1 - bottom;
};

export const allieThreadiesShapes = {
  /** Pippo: tall vertical capsule (1 : 2). */
  capsule: lathe(2.2, 0.92, (h) => capsuleProfile(h, 2.2, 0.55) * (1 + 0.035 * Math.sin((h / 2.2) * Math.PI))),
  /** Tuff: plump rounded cube, slightly wider than tall. */
  cube: chainDeformers(createSuperellipsoidDeformer(4.2, [1, 0.9, 0.86]), footAt(-0.9)),
  /** Spirou: two stacked spheres (small head on a big belly) with a soft neck. */
  snowman: lathe(2.02, 0.96, (h) => Math.max(circle(h, 0.62, 0.62), circle(h, 1.46, 0.56), 0.42 * Math.exp(-(((h - 1.1) / 0.13) ** 2)) * (h > 0.8 && h < 1.5 ? 1 : 0))),
  /** Moko: beanie — rounded cone over a folded ribbed cuff. */
  beanie: lathe(1.72, 0.94, (h) => {
    const cuffTop = 0.34;
    if (h <= cuffTop) {
      const edge = 0.07;
      const base = h < edge ? 0.8 - edge + Math.sqrt(Math.max(0, edge * edge - (edge - h) ** 2)) : 0.8;
      return base - 0.03 * Math.exp(-(((h - cuffTop) / 0.035) ** 2));
    }
    const s = (h - cuffTop) / (1.72 - cuffTop);
    return 0.775 * Math.pow(Math.max(0, 1 - Math.pow(s, 2.1)), 0.6) - 0.03 * Math.exp(-(((h - cuffTop) / 0.035) ** 2));
  }),
  /** Fifi: 8-lobed scalloped flower disc with popcorn bobbles. */
  scallop: (v) => {
    const len = hypot3(v.x, v.y, v.z) || 1;
    const x = v.x / len;
    const y = v.y / len;
    const z = v.z / len;
    const a = Math.atan2(y, x);
    const rim = 1 + 0.042 * Math.cos(8 * a + Math.PI / 2) * Math.min(1, hypot2(x, y) * 1.4);
    const pop = (Math.sin(17 * x) * Math.sin(17 * y + 1.3) * Math.sin(17 * z + 0.7) + 1) * 0.5;
    const k = rim * (1 + 0.035 * Math.pow(pop, 2));
    v.x = x * k * 1.0;
    v.y = y * k * 1.02;
    v.z = z * k * 0.74;
  },
  /** Chobi: flat-bottomed wide dome (1.4 : 1). */
  nubdome: lathe(1.43, 0.86, (h) => fillet(h, 0.12) * Math.pow(Math.max(0, 1 - Math.pow(h / 1.43, 2.6)), 1 / 2.6)),
  /** Poko: tall soft dome with a flat base. */
  puffdome: lathe(1.95, 0.88, (h) => 0.95 * fillet(h, 0.14) * Math.pow(Math.max(0, 1 - Math.pow(h / 1.95, 2.2)), 1 / 2.2)),
  /** Lilo: soft horizontal rounded box / barrel. */
  barrel: chainDeformers(createSuperellipsoidDeformer(3.6, [1, 0.74, 0.8]), footAt(-0.74)),
  /**
   * Hearty: symmetric plush heart — two rounded lobes on top, a soft point at
   * the bottom, puffy depth (thickest in the middle, rounded at the rim).
   * Written onto the same unit-sphere grid as every body (fixed topology), so
   * it morphs to and from any other character.
   */
  heart: (v) => {
    const len = hypot3(v.x, v.y, v.z) || 1;
    const x = v.x / len;
    const y = v.y / len;
    const z = v.z / len;
    const inPlane = hypot2(x, y);
    const a = Math.atan2(y, x);
    const R = heartRadius(a);
    // ×1.15 and lifted so the soft tip stands on the standard footing (y = -1)
    v.x = x * R * HEART.sx * 1.15;
    v.y = y * R * 1.15 + 0.15;
    // pillow: full depth in the middle, thinning toward the outline and the tip
    v.z = z * 0.62 * (1 - 0.18 * inPlane * inPlane);
  },
} satisfies Record<string, ShapeDeformer>;

export type AllieThreadiesShapeName = keyof typeof allieThreadiesShapes;

/** Register the Allie shapes by name ('teardrop', 'flower', 'blob', 'dome', + Threadies incl. 'heart'). */
export function registerAllieShapes(): void {
  for (const [name, fn] of Object.entries(allieShapes)) registerAvatarShape(name, fn);
  for (const [name, fn] of Object.entries(allieThreadiesShapes)) registerAvatarShape(name, fn);
}
