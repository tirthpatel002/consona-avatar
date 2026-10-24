/** Perceptual (OKLab) colour helpers shared by every avatar family. */
import type { ColorLike } from '../types/AvatarDefinition.ts';
import { COLOR_SPRING, Spring } from '../math/Spring.ts';
import type { SpringParams } from '../math/Spring.ts';

// ---------------- perceptual colour ----------------

export type Rgb = [number, number, number];

export function colorToRgb(c: ColorLike): Rgb {
  if (typeof c === 'number') return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  let h = String(c).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isFinite(n) ? colorToRgb(n) : [0, 0, 0];
}

const toLin = (u: number) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
const toSrgb = (u: number) => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(Math.max(0, u), 1 / 2.4) - 0.055);

/** sRGB (0..1) → OKLab. */
export function rgbToOklab([r0, g0, b0]: Rgb): Rgb {
  const r = toLin(r0), g = toLin(g0), b = toLin(b0);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** OKLab → sRGB (0..1, clamped), written into `out` (allocation-free variant for per-frame use). */
export function oklabToRgbInto([L, A, B]: Rgb, out: Rgb): Rgb {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  const c = (u: number) => Math.min(1, Math.max(0, toSrgb(u)));
  out[0] = c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  out[1] = c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  out[2] = c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return out;
}

/** OKLab → sRGB (0..1, clamped). */
export function oklabToRgb(lab: Rgb): Rgb {
  return oklabToRgbInto(lab, [0, 0, 0]);
}

/** Mix two colours in OKLab (perceptually even, no muddy midpoints). */
export function mixColorOklab(a: ColorLike, b: ColorLike, t: number): Rgb {
  const A = rgbToOklab(colorToRgb(a));
  const B = rgbToOklab(colorToRgb(b));
  return oklabToRgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** Spring-driven colour that moves through OKLab. */
export class ColorSpring {
  private readonly ch: Spring[];
  private readonly tmp: Rgb = [0, 0, 0];
  constructor(c: ColorLike, params: SpringParams = COLOR_SPRING) {
    this.ch = rgbToOklab(colorToRgb(c)).map((x) => new Spring(x, params));
  }
  set(c: ColorLike): this {
    rgbToOklab(colorToRgb(c)).forEach((x, i) => this.ch[i]!.set(x));
    return this;
  }
  /** Jump to a colour with no motion. */
  snap(c: ColorLike): this {
    rgbToOklab(colorToRgb(c)).forEach((x, i) => this.ch[i]!.snap(x));
    return this;
  }
  update(dt: number): Rgb {
    for (let i = 0; i < 3; i++) this.tmp[i] = this.ch[i]!.update(dt);
    return oklabToRgbInto(this.tmp, this.tmp);
  }
  get settled(): boolean {
    return this.ch.every((s) => s.settled);
  }
}

