/**
 * Interpolation and Easing functions for continuous animation.
 */

export type EasingFunction = (t: number) => number;

export const Easing = {
  linear: (t: number): number => t,
  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => t * (2 - t),
  easeInOutQuad: (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => (--t) * t * t + 1,
  easeInOutCubic: (t: number): number => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  /** Hermite smoothstep (3t² − 2t³). */
  smoothstep: (t: number): number => t * t * (3 - 2 * t),
  easeOutElastic: (t: number): number => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
} as const;

export function lerp(from: number, to: number, t: number): number {
  const clampedT = Math.max(0, Math.min(1, t));
  return from + (to - from) * clampedT;
}

export function lerpAngle(fromRad: number, toRad: number, t: number): number {
  let diff = (toRad - fromRad) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return fromRad + diff * Math.max(0, Math.min(1, t));
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** GLSL-style smoothstep of `x` between edges `e0` and `e1`. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Move `current` toward `target` by at most `maxDelta` (rate-limited, never overshoots). */
export function moveToward(current: number, target: number, maxDelta: number): number {
  const d = Math.max(0, maxDelta);
  return target > current ? Math.min(target, current + d) : Math.max(target, current - d);
}

export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}
