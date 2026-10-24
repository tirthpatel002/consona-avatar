import type { AvatarIcon } from '../catalog/catalog.ts';
import { getEyeShape, type EyeSdf } from './eyes.ts';

/**
 * Picker icons for the relief eyes, traced from the SAME normalised SDFs the
 * 3D eye rig uses (`getEyeShape`), so tile silhouettes match what renders.
 * Pure math (marching squares), no DOM / canvas; cached per shape + layout.
 */

/**
 * Closed outline(s) of `sdf(x, y) < level` as SVG path data (y flipped to SVG
 * down), sampled on an n×n grid over ±`half`, offset by `dx`.
 */
export function sdfOutlinePath(sdf: EyeSdf, opts: { half?: number; n?: number; level?: number; dx?: number } = {}): string {
  const half = opts.half ?? 1.4, n = opts.n ?? 48, level = opts.level ?? 0, dx = opts.dx ?? 0;
  const step = (2 * half) / n;
  const val: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) val.push(sdf(-half + i * step, -half + j * step) - level);
  const v = (i: number, j: number) => val[j * (n + 1) + i]!;
  // edge ids: horizontal (i,j)-(i+1,j) = 'h', vertical (i,j)-(i,j+1) = 'v'
  const pts = new Map<string, [number, number]>();
  const point = (key: string, i0: number, j0: number, i1: number, j1: number) => {
    if (!pts.has(key)) {
      const a = v(i0, j0), b = v(i1, j1), t = a / (a - b);
      pts.set(key, [-half + (i0 + (i1 - i0) * t) * step, -half + (j0 + (j1 - j0) * t) * step]);
    }
    return key;
  };
  const next = new Map<string, string>();
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const c = [v(i, j) < 0, v(i + 1, j) < 0, v(i + 1, j + 1) < 0, v(i, j + 1) < 0];
      const e = {
        b: () => point(`h${i},${j}`, i, j, i + 1, j),
        r: () => point(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1),
        t: () => point(`h${i},${j + 1}`, i, j + 1, i + 1, j + 1),
        l: () => point(`v${i},${j}`, i, j, i, j + 1),
      };
      const idx = (c[0] ? 1 : 0) | (c[1] ? 2 : 0) | (c[2] ? 4 : 0) | (c[3] ? 8 : 0);
      // segments oriented with the inside on their right (saddles kept separate)
      const segs: [() => string, () => string][] = (
        {
          1: [[e.l, e.b]], 2: [[e.b, e.r]], 3: [[e.l, e.r]], 4: [[e.r, e.t]], 5: [[e.l, e.b], [e.r, e.t]], 6: [[e.b, e.t]], 7: [[e.l, e.t]],
          8: [[e.t, e.l]], 9: [[e.t, e.b]], 10: [[e.b, e.r], [e.t, e.l]], 11: [[e.t, e.r]], 12: [[e.r, e.l]], 13: [[e.r, e.b]], 14: [[e.b, e.l]],
        } as Record<number, [() => string, () => string][]>
      )[idx] ?? [];
      for (const [a, b] of segs) next.set(a(), b());
    }
  const f = (x: number) => +x.toFixed(3);
  let d = '';
  const seen = new Set<string>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    let k: string | undefined = start;
    let first = true;
    while (k && !seen.has(k)) {
      seen.add(k);
      const [x, y] = pts.get(k)!;
      d += `${first ? 'M' : 'L'}${f(x + dx)} ${f(-y)}`;
      first = false;
      k = next.get(k);
    }
    d += 'Z';
  }
  return d;
}

const cache = new Map<string, AvatarIcon>();

/**
 * Pair-of-eyes icon for a relief eye shape: each eye traced from its SDF, a
 * thin outline ring (`outlineWidth`, eye units) behind it, centres spaced like
 * `eyeLayout` (spacing / size ratio, never closer than the shape allows).
 */
export function reliefEyesIcon(shape: string, o: { spacing?: number; size?: number; outlineWidth?: number; family?: string } = {}): AvatarIcon {
  const spacing = o.spacing ?? 0.5, size = o.size ?? 0.4, ow = o.outlineWidth ?? 0.2;
  const key = `${o.family ?? ''}|${shape}|${spacing}|${size}|${ow}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const info = getEyeShape(shape, o.family);
  // eyeLayout (width-limited anchor): half spacing / radius = spacing / (1.2 size), min (extent + outline) × 1.28
  const dx = Math.max(spacing / (1.2 * size), (info.extent.x + ow) * 1.28);
  const half = 1 + ow + 0.1;
  const outline = [-dx, dx].map((x) => sdfOutlinePath(info.sdf, { half, level: ow, dx: x })).join('');
  const feature = [-dx, dx].map((x) => sdfOutlinePath(info.sdf, { half, dx: x })).join('');
  const w = dx + half;
  const icon: AvatarIcon = {
    viewBox: [-w, -half, 2 * w, 2 * half],
    paths: [
      ...(ow > 0 ? [{ d: outline, fill: 'outline' as const }] : []),
      { d: feature, fill: 'feature' as const },
    ],
  };
  cache.set(key, icon);
  return icon;
}
