/**
 * Body-relative colour tinting (renderer-agnostic).
 *
 * Accessories and character-tinted eye parts are authored against the
 * character's default body colour (`body.colorRef`). Their colour is stored as
 * a relative offset from that reference (hue shift, saturation ratio,
 * lightness shift in HSL), and re-applied to the live body colour, so:
 *  - at the default colour every preset looks exactly as authored;
 *  - when the body colour changes, accessories / irises follow as the same
 *    relative tint / shade / hue offset.
 * Neutrals (near-grey, near-black, near-white) stay fixed so black beads,
 * white sclera and dark pupils keep reading as such.
 */
import type { ColorLike } from '../types/AvatarDefinition.ts';
import { colorToRgb, oklabToRgb, rgbToOklab } from './color.ts';
import type { Rgb } from './color.ts';
import { clamp01, smoothstep } from '../math/Interpolation.ts';

export type TintMode = 'accessory' | 'eye';

export function rgbToHsl([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max - min < 1e-9) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb([h, s, l]: Rgb): Rgb {
  if (s < 1e-9) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** Whether a colour follows the body in this mode (neutrals stay fixed). */
export function isTintable(c: Rgb, mode: TintMode = 'accessory'): boolean {
  const [, s, l] = rgbToHsl(c);
  // eyes: only clearly character-tinted parts (bare-face 3D eyes)
  if (mode === 'eye') return s > 0.5 && l > 0.25 && l < 0.85;
  return s > 0.1 && l > 0.08 && l < 0.95;
}

/**
 * `base` was authored against body colour `ref`; return its colour on `body`.
 * Exact identity when `body == ref`; neutrals are returned unchanged.
 */
export function tintFromBody(base: Rgb, ref: Rgb, body: Rgb, mode: TintMode = 'accessory'): Rgb {
  if (!isTintable(base, mode)) return [base[0], base[1], base[2]];
  if (Math.abs(body[0] - ref[0]) + Math.abs(body[1] - ref[1]) + Math.abs(body[2] - ref[2]) < 1e-6) return [base[0], base[1], base[2]];
  const [hb, sb, lb] = rgbToHsl(base);
  const [hr, sr, lr] = rgbToHsl(ref);
  const [hn, sn, ln] = rgbToHsl(body);
  // greyish reference: no meaningful hue → keep the part's own hue and saturation
  const h = sr < 0.05 ? hb : hn + (hb - hr);
  const s = sr < 0.05 ? sb : clamp01(sn * Math.min(4, sb / sr));
  return hslToRgb([h, s, clamp01(ln + (lb - lr))]);
}

/** Convenience on colour-likes. */
export function tintColor(base: ColorLike, ref: ColorLike, body: ColorLike, mode: TintMode = 'accessory'): Rgb {
  return tintFromBody(colorToRgb(base), colorToRgb(ref), colorToRgb(body), mode);
}

/** sRGB 0..1 → '#rrggbb'. */
export function rgbToHex([r, g, b]: Rgb): string {
  const h = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ---------------------------------------------------------------- contrast-aware derived colours


/** Perceptual lightness of a colour (OKLab L, 0 black .. 1 white). */
export function perceivedLightness(c: Rgb): number {
  return rgbToOklab(c)[0];
}

/** WCAG relative luminance (linear-light, 0..1). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (u: number) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Luminance where black and white text give equal contrast (√(1.05·0.05) − 0.05 ≈ 0.179). */
export const CONTRAST_PIVOT = Math.sqrt(1.05 * 0.05) - 0.05;

/**
 * How "dark" an accent reads, 0 (light) .. 1 (dark), from its relative
 * luminance around the equal-contrast pivot. A smooth ramp of `width`
 * (luminance units), so derived colours cross over continuously (no jump)
 * while a colour tween passes the middle.
 */
export function darkness(c: Rgb, width = 0.16): number {
  const y = relativeLuminance(c);
  return 1 - smoothstep(CONTRAST_PIVOT - width / 2, CONTRAST_PIVOT + width / 2, y);
}

/**
 * Eye outline / eyelid colour for an accent: a darker, slightly richer shade
 * on light accents, a lighter shade on dark ones (continuous in the accent).
 */
export function contrastBorder(accent: Rgb): Rgb {
  const [L, A, B] = rgbToOklab(accent);
  const dark: Rgb = [L * 0.52, A * 1.05, B * 1.05];
  const lightL = L + (1 - L) * 0.55;
  const light: Rgb = [lightL, A * 0.8, B * 0.8];
  const t = darkness(accent);
  return oklabToRgb([dark[0] + (light[0] - dark[0]) * t, dark[1] + (light[1] - dark[1]) * t, dark[2] + (light[2] - dark[2]) * t]).map(clamp01) as Rgb;
}

/**
 * Eye colour for an accent: pure black or pure white, whichever contrasts the
 * accent better (white on dark bodies, black on light ones). Never a hue.
 * Softly mixes only in a narrow band around the equal-contrast pivot so a
 * colour tween fades black ↔ white without a jump; away from the pivot the
 * result is exactly `#000` or `#fff`.
 */
export function contrastEyeColor(accent: Rgb): Rgb {
  const t = darkness(accent, 0.06); // 0 → black, 1 → white
  // snap to the endpoints outside the blend band (no mid-grey resting colours)
  const v = t < 0.02 ? 0 : t > 0.98 ? 1 : t;
  return [v, v, v];
}

/** Below this saturation a colour is treated as neutral (its hue is meaningless): the mouth stays neutral too. */
const NEUTRAL_SAT = 0.08;

/**
 * Mouth line colour derived from an accent / body colour: the accent's own
 * hue (no fixed tint), with contrast-aware lightness so it reads on any body —
 * dark accents get a light mouth, light accents a deep one. Neutral accents
 * give a neutral mouth.
 */
export function mouthColorFromAccent(accent: Rgb): Rgb {
  const [h, s, l] = rgbToHsl(accent);
  const sat = s < NEUTRAL_SAT ? s : Math.min(0.7, Math.max(0.35, s * 0.9 + 0.1));
  // smooth blend around mid luminance so dragging the colour never pops
  const luma = 0.2126 * accent[0] + 0.7152 * accent[1] + 0.0722 * accent[2];
  const lumaN = luma > 1 ? luma / 255 : luma;
  const t = Math.min(1, Math.max(0, (lumaN - 0.3) / 0.2));
  const k = t * t * (3 - 2 * t);
  const deep = Math.min(0.34, Math.max(0.18, l * 0.42));
  const pale = Math.min(0.86, Math.max(0.72, 0.72 + l * 0.3));
  return hslToRgb([h, sat, pale + (deep - pale) * k]);
}

/** Inner colour of open mouth shapes, from the line colour: same hue, lightness flipped for contrast. */
export function mouthInnerFromLine(line: Rgb): Rgb {
  const [h, s, l] = rgbToHsl(line);
  // inner stays readable against the line: pale line gets a deeper inside, deep line a pale one
  const inner = l > 0.5 ? Math.max(0.42, l - 0.3) : 0.78;
  return hslToRgb([h, s < NEUTRAL_SAT ? s : Math.min(0.75, Math.max(0.45, s)), inner]);
}

/**
 * Hairband (fabric accessory) colour derived from an accent / body colour: a
 * warm counter-hue (~150° round the wheel: coral on periwinkle, teal on pink)
 * at a saturated mid lightness, nudged lighter on dark bodies and deeper on
 * light ones so the band always separates from the fur. Neutral accents get a
 * soft coral. Continuous in the accent (colour tweens never pop).
 */
export function hairbandColorFromAccent(accent: Rgb): Rgb {
  const [h, s] = rgbToHsl(accent);
  const hue = s < NEUTRAL_SAT ? 0.97 : (h + 150 / 360) % 1;
  const t = darkness(accent); // 0 light accent → 1 dark accent
  return hslToRgb([hue, 0.68, 0.5 + 0.16 * t]);
}
