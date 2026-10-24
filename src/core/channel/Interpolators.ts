import { lerp, lerpAngle, clamp } from '../math/Interpolation.ts';
import { Vector2D, type IVector2D } from '../math/Vector2D.ts';

/**
 * Standard typed interpolators and blenders for channels.
 */

export function lerpScalar(a: number, b: number, t: number): number {
  return lerp(a, b, t);
}

export function lerpBoolean(a: boolean, b: boolean, t: number): boolean {
  return t >= 0.5 ? b : a;
}

export function lerpEnum<T extends string>(a: T, b: T, t: number): T {
  return t >= 0.5 ? b : a;
}

/**
 * Parses and interpolates hex/rgb/hsl color strings smoothly.
 */
export function lerpColor(fromColor: string, toColor: string, t: number): string {
  if (fromColor === toColor || t <= 0) return fromColor;
  if (t >= 1) return toColor;

  const c1 = parseColorToRgb(fromColor);
  const c2 = parseColorToRgb(toColor);
  if (!c1 || !c2) return t < 0.5 ? fromColor : toColor;

  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  const a = lerp(c1[3], c2[3], t);

  if (a < 0.999) {
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

function parseColorToRgb(color: string): [number, number, number, number] | null {
  if (!color) return null;
  const str = color.trim();

  // Hex #RGB or #RRGGBB
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      const r = parseInt((hex[0] ?? '0') + (hex[0] ?? '0'), 16);
      const g = parseInt((hex[1] ?? '0') + (hex[1] ?? '0'), 16);
      const b = parseInt((hex[2] ?? '0') + (hex[2] ?? '0'), 16);
      return [r, g, b, 1.0];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b, 1.0];
    }
    if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return [r, g, b, a];
    }
  }

  // rgb/rgba
  const rgbMatch = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbMatch) {
    return [
      parseFloat(rgbMatch[1] ?? '0'),
      parseFloat(rgbMatch[2] ?? '0'),
      parseFloat(rgbMatch[3] ?? '0'),
      rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1.0,
    ];
  }

  return null;
}

/**
 * Standard blending operations.
 */
export function blendAdditiveScalar(base: number, delta: number, weight: number): number {
  return base + delta * weight;
}

export function blendMultiplyScalar(base: number, factor: number, weight: number): number {
  // factor = 1.0 means no change. If weight is 0.5 and factor is 0.8, blend factor = 1 + (0.8 - 1) * 0.5 = 0.9
  const effectiveFactor = 1.0 + (factor - 1.0) * weight;
  return base * effectiveFactor;
}

export function blendOverrideScalar(base: number, target: number, weight: number): number {
  return lerp(base, target, weight);
}
