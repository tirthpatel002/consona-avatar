import type { PresetName } from '../types/AvatarDefinition.ts';
import type { AvatarPoseTarget } from './pose.ts';
import { createAvatarRng } from '../math/random.ts';

/**
 * Timelines: scripted, deterministic, seekable sequences for promos / long
 * predefined animations. Steps start at `at` (seconds) or, without `at`,
 * right after the previous step ends (behaviors hand off from the live pose —
 * no return to rest in between). Gaze and blink are scripted while a timeline
 * plays: pointer follow and random blinking pause; blinks come from `blink`
 * steps plus an optional seeded series, so a recording reproduces exactly.
 *
 *   avatar.playTimeline(defineTimeline([
 *     { behavior: 'jump' },
 *     { preset: 'love' },
 *     { behavior: 'spin', params: { turns: 2 } },
 *     { pose: { body: [0, 0.3, 0.12] }, duration: 0.5 },   // absolute pose, held
 *     { gaze: { x: 0.6, y: 0.2 } },
 *     { wait: 0.8 },
 *     { behavior: 'wave', end: 'rest' },
 *   ], { blink: { seed: 7 } }));
 */
export type BehaviorEnd = 'rest' | 'hold';

interface StepBase {
  /** Absolute start (s). Default: when the previous step ends. */
  at?: number;
}
export type AvatarTimelineStep =
  | (StepBase & { behavior: string; params?: Record<string, unknown>; preset?: PresetName; end?: BehaviorEnd; blend?: number })
  | (StepBase & { preset: PresetName })
  | (StepBase & { pose: AvatarPoseTarget; duration?: number; ease?: string; end?: BehaviorEnd })
  | (StepBase & { gaze: { x: number; y: number } | null })
  | (StepBase & { blink: true })
  | (StepBase & { wait: number });

export interface AvatarTimelineOptions {
  /** Seeded automatic blinks during playback (`false` = only `blink` steps). Default `{ seed: 1 }`. */
  blink?: { seed: number; interval?: [number, number] } | false;
}

export interface AvatarTimeline {
  readonly steps: readonly AvatarTimelineStep[];
  readonly options: AvatarTimelineOptions;
}

export function defineTimeline(steps: AvatarTimelineStep[], options: AvatarTimelineOptions = {}): AvatarTimeline {
  return { steps, options };
}

/** What a timeline drives (implemented by `AvatarRuntime` and Consona's `AvatarInstance`). */
export interface AvatarTimelineTarget {
  /** Seconds an behavior runs with these params (`undefined` = unknown behavior). */
  durationOf(behavior: string, params?: Record<string, unknown>): number | undefined;
  /** `offset`: seconds the behavior has already run when the next `step` begins (may be slightly negative). */
  behavior(name: string, o: { params?: Record<string, unknown>; preset?: PresetName; end?: BehaviorEnd; blend?: number; offset: number }): void;
  preset?(preset: PresetName): void;
  gaze?(target: { x: number; y: number } | null): void;
  pose?(pose: AvatarPoseTarget, o: { duration: number; ease?: string; end?: BehaviorEnd; offset: number }): void;
  /** Back to the state at t = 0 (seek). */
  reset(): void;
  /** Advance the target's own animation by `dt` (seek fast-forward). */
  step(dt: number): void;
  /** Scripted playback on / off (pause pointer gaze + random blink). */
  scripted?(on: boolean): void;
  /** A scripted blink starts now (targets that blink by clip; value-based targets read `player.blink`). */
  blinkPulse?(): void;
}

interface TimelineEvent {
  t: number;
  step: AvatarTimelineStep;
  duration: number;
}

export type AvatarTimelineEvent = { type: 'step'; index: number; time: number } | { type: 'end' };

const BLINK_CLOSE = 0.06;
const BLINK_LENGTH = 0.14;
/** Seek fast-forward step (s). */
export const AVATAR_TIMELINE_STEP = 1 / 60;

/**
 * Plays a timeline on a target. Drive it with `update(dt)` once per frame,
 * before the target advances its animation by the same `dt`.
 */
export class AvatarTimelinePlayer {
  readonly duration: number;
  /** Seconds since the start. */
  time = 0;
  playing = true;
  rate = 1;
  private readonly events: TimelineEvent[] = [];
  private readonly blinks: number[] = [];
  private next = 0;
  private nextBlink = 0;
  private readonly listeners = new Set<(e: AvatarTimelineEvent) => void>();

  readonly timeline: AvatarTimeline;
  private readonly target: AvatarTimelineTarget;

  constructor(timeline: AvatarTimeline, target: AvatarTimelineTarget) {
    this.timeline = timeline;
    this.target = target;
    let cursor = 0;
    for (const step of timeline.steps) {
      const t = step.at ?? cursor;
      let duration = 0;
      if ('behavior' in step) {
        const d = target.durationOf(step.behavior, step.params);
        if (d === undefined) throw new Error(`Timeline: unknown behavior "${step.behavior}"`);
        if (!Number.isFinite(d)) throw new Error(`Timeline: behavior "${step.behavior}" has no finite duration`);
        duration = d;
      } else if ('pose' in step) duration = step.duration ?? 0.4;
      else if ('wait' in step) duration = step.wait;
      if ('blink' in step) this.blinks.push(t);
      this.events.push({ t, step, duration });
      cursor = t + duration;
    }
    this.events.sort((a, b) => a.t - b.t);
    this.duration = this.events.reduce((m, e) => Math.max(m, e.t + e.duration), 0);
    const auto = timeline.options.blink === undefined ? { seed: 1 } : timeline.options.blink;
    if (auto) {
      const rnd = createAvatarRng(auto.seed);
      const [lo, hi] = auto.interval ?? [2, 5];
      for (let t = 0.6 + rnd() * 1.5; t < this.duration; t += lo + rnd() * (hi - lo)) this.blinks.push(t);
    }
    this.blinks.sort((a, b) => a - b);
    target.reset();
    target.scripted?.(true);
  }

  get finished(): boolean {
    return this.time >= this.duration && this.next >= this.events.length;
  }

  subscribe(fn: (e: AvatarTimelineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  play(): void {
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }
  /** Stop: hand control back (pointer gaze / random blink resume). */
  stop(): void {
    this.playing = false;
    this.target.scripted?.(false);
  }

  /** Advance by `dt` (scaled by `rate`) and dispatch due steps. Returns the scaled dt the target should advance. */
  update(dt: number): number {
    if (!this.playing) return 0;
    const d = dt * this.rate;
    this.advance(d);
    if (this.finished) {
      this.playing = false;
      this.target.scripted?.(false);
      for (const l of this.listeners) l({ type: 'end' });
    }
    return d;
  }

  /** Deterministic seek: reset the target, then replay from 0 in fixed steps. */
  seek(time: number): void {
    const end = Math.max(0, Math.min(this.duration, time));
    this.target.reset();
    this.time = 0;
    this.next = 0;
    this.nextBlink = 0;
    while (this.time < end - 1e-9) {
      const h = Math.min(AVATAR_TIMELINE_STEP, end - this.time);
      this.advance(h);
      this.target.step(h);
    }
  }

  /** Scripted blink 0..1 at the current time (same curve as the runtime's random blink). */
  get blink(): number {
    let v = 0;
    for (const tb of this.blinks) {
      const k = this.time - tb;
      if (k < 0) break;
      if (k < BLINK_LENGTH) v = Math.max(v, Math.min(1, k / BLINK_CLOSE));
    }
    return v;
  }

  private advance(d: number): void {
    this.time += d;
    while (this.next < this.events.length && this.events[this.next]!.t <= this.time + 1e-9) {
      const i = this.next++;
      const ev = this.events[i]!;
      this.dispatch(ev, this.time - ev.t - d);
      for (const l of this.listeners) l({ type: 'step', index: i, time: ev.t });
    }
    while (this.nextBlink < this.blinks.length && this.blinks[this.nextBlink]! <= this.time + 1e-9) {
      this.nextBlink++;
      this.target.blinkPulse?.();
    }
  }

  private dispatch({ step, duration }: TimelineEvent, offset: number): void {
    const tg = this.target;
    if ('behavior' in step) tg.behavior(step.behavior, { params: step.params, preset: step.preset, end: step.end, blend: step.blend, offset });
    else if ('pose' in step) tg.pose?.(step.pose, { duration, ease: step.ease, end: step.end, offset });
    else if ('preset' in step) tg.preset?.(step.preset);
    else if ('gaze' in step) tg.gaze?.(step.gaze);
  }
}
