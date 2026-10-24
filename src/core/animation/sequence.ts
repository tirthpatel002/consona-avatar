import type { BehaviorContext, BehaviorCue, BehaviorDefinition, BehaviorParam, AvatarRig, PresetName } from '../types/AvatarDefinition.ts';
import type { BehaviorEnd } from './timeline.ts';

/**
 * Sequenced behaviors (renderer-agnostic): an behavior made of ordered steps
 * (e.g. the 5-4-3-2-1 grounding exercise), each optionally counted in beats
 * (5 things you can see → 5 beats). The helper
 *
 *  - lays the steps out after an intro, before an outro; `params.duration`
 *    scales the whole run (steps keep their proportions),
 *  - emits cues the host UI syncs to: `step` (data: index, id, label, count,
 *    beats + the step's `data`), `beat` (step, beat 1-based, beats) and
 *    `complete` (after the last step), as `cue` events on the machine,
 *  - hands `update` the live step info (index, seconds into the step,
 *    progress, continuous beat count), allocation-free.
 *
 * Families supply the choreography in `update` (e.g. counting on their limbs).
 */
export interface AvatarSequenceStep {
  id: string;
  label?: string;
  /** Seconds (before `params.duration` scaling). */
  duration: number;
  /** Counted beats in this step (0 = none). */
  beats?: number;
  data?: Readonly<Record<string, unknown>>;
}

export interface AvatarSequenceInfo {
  /** Step index (-1 = intro, `count` = outro). */
  index: number;
  step: AvatarSequenceStep | null;
  /** Seconds into the current step / intro / outro (scaled). */
  t: number;
  /** Its duration (scaled). */
  duration: number;
  /** 0..1 through it. */
  progress: number;
  /** Continuous beats elapsed in this step: 0 before the first, `k` exactly at beat k, up to `beats`. */
  beat: number;
  beats: number;
  count: number;
  /** Run scale (run duration / base duration). */
  scale: number;
}

export interface AvatarSequenceTiming {
  /** Seconds before the first step (default 0.6). */
  intro?: number;
  /** Seconds after the last step (default 0.8). */
  outro?: number;
  /** Seconds into a step before its first beat (default 0.6). */
  beatLead?: number;
  /** Share of a step its beats spread over (default 0.7; the rest holds). */
  beatSpan?: number;
}

export interface AvatarSequenceOptions<R extends AvatarRig = AvatarRig> extends AvatarSequenceTiming {
  name: string;
  steps: readonly AvatarSequenceStep[];
  preset?: PresetName | null;
  gaze?: number;
  hidden?: boolean;
  channels?: Readonly<Record<string, number>>;
  end?: BehaviorEnd;
  params?: Record<string, BehaviorParam>;
  /** Per-frame choreography with the live step info. */
  update?(ctx: BehaviorContext<R>, seq: Readonly<AvatarSequenceInfo>): void;
}

/** Base (unscaled) duration of a sequence. */
export function sequenceDuration(steps: readonly AvatarSequenceStep[], timing: AvatarSequenceTiming = {}): number {
  let d = (timing.intro ?? 0.6) + (timing.outro ?? 0.8);
  for (const s of steps) d += s.duration;
  return d;
}

/** Beat spacing of a step (unscaled s). */
function beatSpacing(step: AvatarSequenceStep, timing: AvatarSequenceTiming): number {
  const beats = step.beats ?? 0;
  const lead = timing.beatLead ?? 0.6;
  if (beats <= 1) return Math.max(0.1, step.duration * (timing.beatSpan ?? 0.7) - lead);
  return Math.max(0.1, (step.duration * (timing.beatSpan ?? 0.7) - lead) / (beats - 1));
}

/** Step info at `t` s into a run scaled by `scale` (writes `out`; allocation-free). */
export function sequenceInfoAt(steps: readonly AvatarSequenceStep[], timing: AvatarSequenceTiming, t: number, scale: number, out: AvatarSequenceInfo): AvatarSequenceInfo {
  const intro = (timing.intro ?? 0.6) * scale;
  out.count = steps.length;
  out.scale = scale;
  out.beat = 0;
  out.beats = 0;
  if (t < intro) {
    out.index = -1;
    out.step = null;
    out.t = t;
    out.duration = intro;
    out.progress = intro > 0 ? t / intro : 1;
    return out;
  }
  let start = intro;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    const d = s.duration * scale;
    if (t < start + d) {
      const u = t - start;
      out.index = i;
      out.step = s;
      out.t = u;
      out.duration = d;
      out.progress = d > 0 ? u / d : 1;
      const beats = s.beats ?? 0;
      out.beats = beats;
      if (beats > 0) {
        const lead = (timing.beatLead ?? 0.6) * scale, sp = beatSpacing(s, timing) * scale;
        out.beat = u < lead ? 0 : Math.min(beats, 1 + (u - lead) / sp);
      }
      return out;
    }
    start += d;
  }
  const outro = (timing.outro ?? 0.8) * scale;
  out.index = steps.length;
  out.step = null;
  out.t = t - start;
  out.duration = outro;
  out.progress = outro > 0 ? Math.min(1, (t - start) / outro) : 1;
  return out;
}

/** The cues of a run (step / beat / complete), sorted by time. */
export function sequenceCues(steps: readonly AvatarSequenceStep[], timing: AvatarSequenceTiming, scale: number): BehaviorCue[] {
  const cues: BehaviorCue[] = [];
  let start = (timing.intro ?? 0.6) * scale;
  const lead = (timing.beatLead ?? 0.6) * scale;
  steps.forEach((s, index) => {
    const beats = s.beats ?? 0;
    cues.push({ at: start, name: 'step', data: { ...s.data, index, id: s.id, label: s.label ?? s.id, count: steps.length, beats } });
    const sp = beatSpacing(s, timing) * scale;
    for (let b = 1; b <= beats; b++) cues.push({ at: start + lead + (b - 1) * sp, name: 'beat', data: { step: index, id: s.id, beat: b, beats } });
    start += s.duration * scale;
  });
  cues.push({ at: start, name: 'complete', data: { count: steps.length } });
  return cues;
}

/** Define a sequenced behavior (see the module doc). */
export function defineSequenceBehavior<R extends AvatarRig = AvatarRig>(o: AvatarSequenceOptions<R>): BehaviorDefinition<R> {
  const base = sequenceDuration(o.steps, o);
  const info: AvatarSequenceInfo = { index: -1, step: null, t: 0, duration: 0, progress: 0, beat: 0, beats: 0, count: o.steps.length, scale: 1 };
  return {
    name: o.name,
    duration: base,
    preset: o.preset,
    gaze: o.gaze,
    hidden: o.hidden,
    channels: o.channels,
    end: o.end,
    params: { duration: { kind: 'number', label: 'Duration', default: base, min: base * 0.4, max: base * 3, step: 1 }, ...o.params },
    cues: ({ duration }) => sequenceCues(o.steps, o, duration / base),
    update(ctx) {
      if (!o.update) return;
      o.update(ctx, sequenceInfoAt(o.steps, o, ctx.t, ctx.duration / base, info));
    },
  };
}
