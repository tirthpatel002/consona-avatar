import type { Rgb } from './color.ts';

/**
 * Valence → colour: the `valence` channel (−1 low … +1 bright) shades the
 * body warm and a touch richer when bright, soft, cooler and slightly paler
 * when low, and leans the glow (rim / halo) the same way. The shift is subtle;
 * the channel's ease makes it slow. Allocation-free (callers pass `out`).
 */
/** How a family shades with the valence channel (OKLab amounts; defaults are deliberately subtle). */
export interface ValencePalette {
  /** Warm direction (sRGB 0..1) the body leans toward when well, and how far at valence 1 (0..1, OKLab mix). */
  warm: Rgb;
  warmAmount: number;
  /** Cool direction when low, and how far at valence −1. */
  cool: Rgb;
  coolAmount: number;
  /** Chroma kept at valence −1 (1 = unchanged): low presets look softer, never grey. */
  lowChroma: number;
  /** Lightness lift at valence −1 (OKLab L, small): soft, a little paler. */
  lowLift: number;
  /** Chroma multiplier at valence 1 (1 = unchanged) and lightness lift there (OKLab L, small). */
  highChroma: number;
  highLift: number;
  /** Glow (rim / halo) colours at both ends and the glow strength at |valence| = 1 (0..1). */
  glowWarm: Rgb;
  glowCool: Rgb;
  glowAmount: number;
}

export const DEFAULT_VALENCE_PALETTE: ValencePalette = {
  warm: [1, 0.66, 0.42],
  warmAmount: 0.2,
  cool: [0.56, 0.66, 0.9],
  coolAmount: 0.24,
  lowChroma: 0.78,
  lowLift: 0.035,
  highChroma: 1,
  highLift: 0.01,
  glowWarm: [1, 0.78, 0.5],
  glowCool: [0.62, 0.74, 1],
  glowAmount: 0.55,
};

// ---------- allocation-free OKLab ----------
const toLin = (u: number) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
const toSrgb = (u: number) => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(Math.max(0, u), 1 / 2.4) - 0.055);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function toOklab(r0: number, g0: number, b0: number, out: Rgb): Rgb {
  const r = toLin(r0), g = toLin(g0), b = toLin(b0);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return out;
}
function fromOklab(L: number, A: number, B: number, out: Rgb): Rgb {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  out[0] = clamp01(toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s));
  out[1] = clamp01(toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s));
  out[2] = clamp01(toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s));
  return out;
}
/**
 * Lean `base` toward `to` in OKLab by `amount` (hue / chroma), scale its chroma by `chroma` and add
 * `lift` to the lightness (allocation-free; e.g. a channel tint over the valence tint).
 */
export function leanColor(base: Readonly<Rgb>, to: Readonly<Rgb>, amount: number, chroma: number, lift: number, out: Rgb): Rgb {
  const lab = toOklab(base[0], base[1], base[2], LAB_A);
  const tgt = toOklab(to[0], to[1], to[2], LAB_B);
  const A = lab[1] * chroma, B = lab[2] * chroma;
  return fromOklab(Math.max(0, Math.min(0.97, lab[0] + lift)), A + (tgt[1] - A) * amount, B + (tgt[2] - B) * amount, out);
}

const LAB_A: Rgb = [0, 0, 0];
const LAB_B: Rgb = [0, 0, 0];

/**
 * Body colour for a valence: `base` mixed (OKLab, so the hue turns
 * evenly) toward the palette's warm (v > 0) or cool (v < 0) direction by
 * |v| · amount; low presets also soften (less chroma, a touch lighter). `v` = 0
 * returns `base` exactly. Allocation-free; `out` may alias `base`.
 */
export function tintForValence(base: Readonly<Rgb>, v: number, out: Rgb, p: ValencePalette = DEFAULT_VALENCE_PALETTE): Rgb {
  if (v === 0 || !Number.isFinite(v)) {
    out[0] = base[0]; out[1] = base[1]; out[2] = base[2];
    return out;
  }
  const k = Math.min(1, Math.abs(v));
  const lab = toOklab(base[0], base[1], base[2], LAB_A);
  const dir = v > 0 ? p.warm : p.cool;
  const tgt = toOklab(dir[0], dir[1], dir[2], LAB_B);
  const amt = (v > 0 ? p.warmAmount : p.coolAmount) * k;
  // keep the body's own lightness: only hue / chroma lean toward the target (it is a preset, not a repaint)
  let L = lab[0], A = lab[1], B = lab[2];
  if (v < 0) {
    // low: soften the body's own chroma first, then lean toward the cool tone (always reads cooler, never louder)
    const c = 1 - (1 - p.lowChroma) * k;
    A *= c;
    B *= c;
    L = Math.min(0.97, L + p.lowLift * k);
  } else {
    // bright: a touch richer and lighter, then lean warm
    const c = 1 + (p.highChroma - 1) * k;
    A *= c;
    B *= c;
    L = Math.min(0.97, L + p.highLift * k);
  }
  A += (tgt[1] - A) * amt;
  B += (tgt[2] - B) * amt;
  return fromOklab(L, A, B, out);
}

const familyPalettes = new Map<string, ValencePalette>();
/** Declare how `family` shades with valence (unset fields keep the defaults). */
export function configureValencePalette(family: string, palette: Partial<ValencePalette>): void {
  familyPalettes.set(family, { ...DEFAULT_VALENCE_PALETTE, ...familyPalettes.get(family), ...palette });
}
/** The valence palette of `family` (the default when it declares none). */
export function valencePaletteOf(family?: string): ValencePalette {
  return (family && familyPalettes.get(family)) || DEFAULT_VALENCE_PALETTE;
}

/** Glow colour (written to `out`) and strength 0..1 for a valence (0 → no glow). */
export function glowForValence(v: number, out: Rgb, p: ValencePalette = DEFAULT_VALENCE_PALETTE): number {
  const c = v >= 0 ? p.glowWarm : p.glowCool;
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  return Number.isFinite(v) ? Math.min(1, Math.abs(v)) * p.glowAmount : 0;
}

