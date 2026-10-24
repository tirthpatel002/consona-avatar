import type { Animation } from './Animation.ts';
import type { SpinAxis } from '../types/Transform3D.ts';

export interface PlayOptions {
  weight?: number;
  timeScale?: number;
  speed?: number;
  loop?: boolean;
  fadeDuration?: number;
  axis?: SpinAxis;
  /** Override the clip's ending ('rest' fades out from the last frame, 'hold' keeps it). */
  end?: 'rest' | 'hold';
  /** Start this many seconds into the clip (timelines). */
  offset?: number;
}

/** Fade-out after a one-shot clip ends (s). */
export const ANIMATION_REST_FADE = 0.35;
/** Crossfade when a running clip is restarted / interrupted (s). */
export const ANIMATION_CROSSFADE = 0.15;

/**
 * AnimationInstance: A live playback state for an Animation on an AnimationMixer.
 */
export class AnimationInstance {
  public readonly animation: Animation;
  public time: number = 0;
  public timeScale: number = 1.0;
  public weight: number = 1.0;
  public loop: boolean = true;
  public enabled: boolean = false;
  public paused: boolean = false;

  private fadeDuration: number = 0;
  private fadeTargetWeight: number = 1.0;
  private isFading: boolean = false;

  private finishCallbacks: Array<() => void> = [];
  private end: 'rest' | 'hold' = 'rest';
  /** Finished its clip, now only fading out (or holding) its last frame. */
  private tail = false;

  constructor(animation: Animation) {
    this.animation = animation;
    this.loop = animation.loop ?? true;
    this.timeScale = animation.speed ?? animation.timeScale ?? 1.0;
    this.weight = animation.weight ?? 1.0;
  }

  /** The clip has finished; only its last frame is still easing out (or held). */
  get settling(): boolean {
    return this.tail;
  }

  /** Target weight of this run. */
  private fullWeight = 1;

  play(options?: PlayOptions): this {
    this.time = Math.max(0, options?.offset ?? 0);
    this.enabled = true;
    this.paused = false;
    this.isFading = false;
    this.tail = false;
    this.fullWeight = options?.weight ?? this.animation.weight ?? 1.0;
    this.weight = this.fullWeight;
    this.timeScale = options?.timeScale ?? options?.speed ?? this.animation.speed ?? this.animation.timeScale ?? 1.0;
    if (options?.loop !== undefined) this.loop = options.loop;
    this.end = options?.end ?? this.animation.end ?? 'rest';
    const fade = options?.fadeDuration ?? this.animation.blendIn ?? Math.min(ANIMATION_CROSSFADE, this.animation.duration / 4);
    if (fade > 0) this.fadeIn(fade);
    return this;
  }

  stop(): this {
    this.enabled = false;
    this.paused = false;
    this.weight = 0;
    this.time = 0;
    this.notifyFinished();
    return this;
  }

  pause(): this {
    this.paused = true;
    return this;
  }

  resume(): this {
    this.paused = false;
    return this;
  }

  reset(): this {
    this.time = 0;
    this.enabled = true;
    this.paused = false;
    return this;
  }

  setWeight(weight: number): this {
    this.weight = Math.max(0, weight);
    return this;
  }

  fadeIn(duration: number): this {
    this.weight = 0;
    this.fadeTargetWeight = this.fullWeight;
    this.fadeDuration = Math.max(0.001, duration);
    this.isFading = true;
    this.enabled = true;
    return this;
  }

  fadeOut(duration: number): this {
    this.fadeTargetWeight = 0.0;
    this.fadeDuration = Math.max(0.001, duration);
    this.isFading = true;
    return this;
  }

  onFinish(callback: () => void): this {
    this.finishCallbacks.push(callback);
    return this;
  }

  get finished(): Promise<void> {
    return this.toPromise();
  }

  toPromise(): Promise<void> {
    if ((!this.enabled && this.time > 0) || this.tail) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.onFinish(resolve);
    });
  }

  update(deltaTime: number): void {
    if (!this.enabled || this.paused) return;

    // a clip fading out holds its pose (like the rest tail): the faded delta stays fixed, so a
    // periodic (angle) channel blends the shortest way to rest and never flips side mid-fade
    if (!(this.isFading && this.fadeTargetWeight === 0)) this.time += deltaTime * this.timeScale;

    // fades run in real time (not clip time) so a slowed clip still crossfades in 0.15 s
    if (this.isFading) {
      const up = this.fadeTargetWeight > this.weight;
      const step = (deltaTime / this.fadeDuration) * Math.max(this.fullWeight, 1e-3) * (up ? 1 : -1);
      this.weight = up ? Math.min(this.fadeTargetWeight, this.weight + step) : Math.max(this.fadeTargetWeight, this.weight + step);
      if (this.weight === this.fadeTargetWeight) {
        this.isFading = false;
        if (this.weight <= 0) {
          this.enabled = false;
          if (!this.tail) this.notifyFinished();
          return;
        }
      }
    }

    const duration = this.animation.duration;
    if (!this.tail && duration > 0 && this.time >= duration) {
      if (this.loop) {
        this.time = this.time % duration;
      } else {
        // the clip is done (promises resolve now, so a chain hands off on the beat); its last frame eases out / holds
        this.time = duration;
        this.tail = true;
        this.notifyFinished();
        if (this.end === 'rest') this.fadeOut(ANIMATION_REST_FADE);
      }
    }
    if (this.tail) this.time = duration;
  }

  private notifyFinished(): void {
    const callbacks = this.finishCallbacks.slice();
    this.finishCallbacks = [];
    for (const callback of callbacks) {
      callback();
    }
  }
}
