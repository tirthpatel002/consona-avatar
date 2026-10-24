/**
 * Damped springs, tweens and easing for smooth avatar prop / pose transitions
 * (renderer-agnostic; used by every family). Springs live in `./Spring.ts`.
 */
import { Easing } from './Interpolation.ts';

/** Fixed-duration tween progress (0..1) with easing. */
export class Tween {
  t = 0;
  duration: number;
  ease: (k: number) => number;
  constructor(duration: number, ease: (k: number) => number = easeInOutCubic) {
    this.duration = duration;
    this.ease = ease;
  }
  update(dt: number): number {
    this.t = Math.min(this.duration, this.t + dt);
    return this.value;
  }
  get value(): number {
    return this.ease(this.duration > 0 ? this.t / this.duration : 1);
  }
  get done(): boolean {
    return this.t >= this.duration;
  }
}

export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeInCubic = Easing.easeInCubic;
export const easeOutBack = (k: number, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
/** Gentle jelly overshoot for body morph / pattern crossfades (s ≈ 1.15). */
export const easeOutSoftBack = (k: number) => easeOutBack(k, 1.15);

