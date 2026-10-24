import type { Animation, ProceduralEvaluator } from '../animation/Animation.ts';
import type { KeyframeTrack } from '../animation/Animation.ts';

export interface AnimationMeta {
  label?: string;
  icon?: string;
  description?: string;
  group?: string;
  /** When false, omit from derived Studio/editor catalogs */
  catalog?: boolean;
}

export interface DefinedAnimation extends Animation {
  id: string;
  meta?: AnimationMeta;
}

export interface DefineAnimationInput {
  name: string;
  duration: number;
  loop?: boolean;
  speed?: number;
  weight?: number;
  timeScale?: number;
  tracks?: KeyframeTrack[];
  evaluate?: ProceduralEvaluator;
  nodeMask?: string[];
  /** See `Animation.blendIn` / `Animation.end`. */
  blendIn?: number;
  end?: 'rest' | 'hold';
  meta?: AnimationMeta;
}

export function defineAnimation(input: DefineAnimationInput): DefinedAnimation {
  return {
    id: input.name,
    name: input.name,
    duration: input.duration,
    loop: input.loop,
    speed: input.speed,
    weight: input.weight,
    timeScale: input.timeScale,
    tracks: input.tracks,
    evaluate: input.evaluate,
    nodeMask: input.nodeMask,
    blendIn: input.blendIn,
    end: input.end,
    meta: input.meta,
  };
}
