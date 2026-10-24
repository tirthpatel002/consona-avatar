import type { ChannelInterpolator } from '../channel/ChannelSchema.ts';
import { lerpScalar, lerpColor, lerpBoolean, lerpEnum } from '../channel/Interpolators.ts';

/**
 * KeyframeTrack: Animates a specific channel on a target node over time.
 */
export class KeyframeTrack {
  readonly nodeId: string;
  readonly channelName: string;
  readonly times: number[];
  readonly values: any[];
  readonly interpolator?: ChannelInterpolator;

  constructor(
    nodeId: string,
    channelName: string,
    times: number[],
    values: any[],
    interpolator?: ChannelInterpolator
  ) {
    this.nodeId = nodeId;
    this.channelName = channelName;
    this.times = times;
    this.values = values;
    this.interpolator = interpolator;
  }

  evaluate(time: number): any {
    const times = this.times;
    const values = this.values;
    const count = times.length;

    if (count === 0) return undefined;
    const firstTime = times[0] ?? 0;
    if (count === 1 || time <= firstTime) return values[0];
    const lastTime = times[count - 1] ?? 0;
    if (time >= lastTime) return values[count - 1];

    // Binary search for keyframe segment
    let low = 0;
    let high = count - 1;

    while (low < high) {
      const mid = (low + high) >> 1;
      const midTime = times[mid] ?? 0;
      if (midTime <= time) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const i1 = low;
    const i0 = low - 1;

    const t0 = times[i0] ?? 0;
    const t1 = times[i1] ?? t0;
    const v0 = values[i0];
    const v1 = values[i1];

    const segmentT = t1 > t0 ? (time - t0) / (t1 - t0) : 0;

    if (this.interpolator) {
      return this.interpolator(v0, v1, segmentT);
    }

    if (typeof v0 === 'number' && typeof v1 === 'number') {
      return lerpScalar(v0, v1, segmentT);
    }
    if (typeof v0 === 'string' && typeof v1 === 'string' && v0.startsWith('#')) {
      return lerpColor(v0, v1, segmentT);
    }
    if (typeof v0 === 'boolean' && typeof v1 === 'boolean') {
      return lerpBoolean(v0, v1, segmentT);
    }
    return lerpEnum(v0, v1, segmentT);
  }
}

/**
 * ProceduralEvaluator: A continuous mathematical function for evaluating procedural animations.
 */
export type ProceduralEvaluator = (
  time: number,
  deltaTime: number,
  params?: Record<string, any>
) => Record<string, Record<string, any>>;

/**
 * Animation: Declarative animation comprising keyframe tracks or a procedural evaluator.
 */
export interface Animation {
  name: string;
  duration: number; // in seconds
  loop?: boolean;
  speed?: number;
  weight?: number;
  timeScale?: number;
  tracks?: KeyframeTrack[];
  evaluate?: ProceduralEvaluator;
  nodeMask?: string[]; // If set, only applies to these node IDs
  /**
   * Seconds to fade in when (re)started (default min(0.15, duration / 4)).
   * Channel deltas are relative (added to rest + other layers), so a clip
   * fades in on top of whatever the avatar is doing; a restart crossfades
   * with the running copy instead of rewinding it.
   */
  blendIn?: number;
  /** One-shot ending: 'rest' (default) fades out over ~0.35 s from the last frame; 'hold' keeps the last frame until stopped. */
  end?: 'rest' | 'hold';
}
