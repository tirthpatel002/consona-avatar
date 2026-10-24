import { clamp } from './Interpolation.ts';
import { Vector2D } from './Vector2D.ts';

/**
 * Mathematical Waveform and Procedural Physics Generators
 * Used for building continuous, organic, and life-like animations with high granularity.
 */

/**
 * Evaluates an organic respiratory (breathing) wave with continuous C2 derivatives.
 * Inhale is smooth acceleration and expansion; exhale is relaxed deceleration and settling.
 * @param t Elapsed time in seconds
 * @param period Total breath cycle duration in seconds (default 4.0s)
 * @param inhaleRatio Ratio of cycle spent inhaling (default 0.45 = 45%)
 * @returns Normalized breath value in [0, 1] (0 = full exhale, 1 = full inhale)
 */
export function evaluateRespirationWave(
  t: number,
  period: number = 4.0,
  inhaleRatio: number = 0.45
): number {
  const phase = ((t % period) + period) % period / period;
  if (phase < inhaleRatio) {
    const p = phase / inhaleRatio;
    return 0.5 - 0.5 * Math.cos(p * Math.PI);
  } else {
    const p = (phase - inhaleRatio) / (1 - inhaleRatio);
    return 0.5 + 0.5 * Math.cos(p * Math.PI);
  }
}

/**
 * Evaluates an asymmetric double-beat pulse wave using smooth Gaussian wavelets.
 * Generates a rhythmic, organic dual-peak surge ("lub-dub") without piecewise stepping.
 * @param t Elapsed time in seconds
 * @param cycleDuration Duration between beats in seconds (default 1.1s ≈ 55 BPM)
 * @returns Pulse amplitude in [0, 1]
 */
export function evaluateCardiacWave(
  t: number,
  cycleDuration: number = 1.1
): number {
  const localT = ((t % cycleDuration) + cycleDuration) % cycleDuration;
  
  // Primary Beat (lub) centered at 0.08s with sigma 0.038s
  const t1 = (localT - 0.08) / 0.038;
  const beat1 = Math.exp(-0.5 * t1 * t1);

  // Secondary Beat (dub) centered at 0.28s with sigma 0.048s
  const t2 = (localT - 0.28) / 0.048;
  const beat2 = Math.exp(-0.5 * t2 * t2) * 0.62;

  const combined = beat1 + beat2;
  if (combined < 1e-6) return 0.0;
  return Math.max(0, Math.min(1, combined));
}

/**
 * Evaluates squash-and-stretch bounce physics.
 */
export interface BounceEvaluation {
  yOffset: number;     // Vertical position delta (negative = airborne)
  scaleX: number;      // Horizontal scale multiplier (squash on impact)
  scaleY: number;      // Vertical scale multiplier (stretch at apex)
  isPeak: boolean;     // True when near apex
}

export function evaluateBouncePhysics(
  t: number,
  frequency: number = 4.4,
  maxLift: number = 7.5
): BounceEvaluation {
  const rawPhase = Math.sin(t * frequency);
  const phase = Math.abs(rawPhase); // 0 = floor impact, 1 = apex
  const smoothedPhase = phase * phase * (3 - 2 * phase); // Smooth cubic hermite curve
  const yOffset = -smoothedPhase * maxLift;
  
  const squash = Math.max(0, 1 - phase);
  const stretch = Math.max(0, phase);
  const scaleX = 1.0 + squash * 0.16 - stretch * 0.08;
  const scaleY = 1.0 - squash * 0.15 + stretch * 0.12;

  return {
    yOffset,
    scaleX,
    scaleY,
    isPeak: phase > 0.88,
  };
}

/**
 * Asymmetric biological eyelid closure curve with quintic smoothstep transitions.
 * Fast closing snap (35%), micro-hold apex (15%), smooth ease-out reopening (50%).
 * @param progress Blink progress in [0, 1]
 * @returns Eyelid aperture in [0, 1]
 */
export function evaluateBlinkAperture(progress: number): number {
  const p = clamp(progress, 0, 1);
  if (p < 0.35) {
    const closeP = p / 0.35;
    const smooth = closeP * closeP * (3 - 2 * closeP);
    return Math.max(0, 1.0 - smooth);
  } else if (p < 0.48) {
    return 0.0;
  } else {
    const openP = (p - 0.48) / 0.52;
    const smooth = openP * openP * openP * (openP * (openP * 6 - 15) + 10);
    return Math.min(1.0, smooth);
  }
}
