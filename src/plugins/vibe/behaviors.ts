/**
 * Vibe plugin behaviors. A behavior is a named motion the host plays with
 * `handle.play('cheer')`: the state machine blends it in over `blendIn`,
 * calls `update` every frame with `ctx.t` (seconds in) and hands `ctx.pose`
 * — a writer whose per-frame values are layered onto the live pose
 * (relative mode) — then eases back to rest when it ends. `cues` emit timed
 * events hosts can sync UI to, and a cue's `effect` is queued for the
 * renderer (e.g. sparkles).
 */
import { defineBehavior, avatarEnvelope } from '../../core/animation/behaviors.ts';
import type { BehaviorCue } from '../../core/types/AvatarDefinition.ts';
import { smoothstep } from '../../core/math/Interpolation.ts';

/** 0 → 1 over [a, b]. */
const ramp = (t: number, a: number, b: number) => smoothstep(a, b, t);

/** Base run length (s); `params.duration` scales a run. */
export const CHEER_DURATION = 1.8;

/**
 * A little celebratory hop: crouch, spring up with a spin of the head,
 * land, settle. Optional `params.message` rides along as a line while the
 * avatar is up. A `sparkles` effect fires at take-off (renderers draw it;
 * hosts can also listen for the `hop` cue).
 */
export const cheerBehavior = defineBehavior({
  name: 'cheer',
  duration: CHEER_DURATION,
  // don't fight the pointer while celebrating
  gaze: 0.2,
  blendIn: 0.1,
  params: {
    duration: { kind: 'number', label: 'Duration (s)', default: CHEER_DURATION, min: 1.2, max: 4, step: 0.1 },
    message: { kind: 'text', label: 'Line', default: '' },
  },
  // cues are declarative: the state machine crosses them and emits `cue`
  // events; `effect` payloads are queued for the renderer automatically
  cues: ({ duration }): readonly BehaviorCue[] => {
    const s = duration / CHEER_DURATION;
    return [
      { at: 0.35 * s, name: 'hop' },
      { at: 0.4 * s, name: 'sparkle', effect: { kind: 'sparkles', count: 12, anchor: 'head' } },
      { at: 0.95 * s, name: 'land' },
    ];
  },
  update(ctx) {
    const { pose, t, duration, params } = ctx;
    const s = duration / CHEER_DURATION; // all keyframes below are authored for the base run
    // crouch (0–0.35), airborne (0.35–0.95), land and settle (0.95–1)
    const crouch = ramp(t, 0, 0.3 * s) * (1 - ramp(t, 0.3 * s, 0.35 * s));
    const air = ramp(t, 0.35 * s, 0.5 * s) * (1 - ramp(t, 0.85 * s, 0.95 * s));
    // 0..1..0 over the whole run: everything fades in and back out
    const e = avatarEnvelope(t, duration, 3 / duration);
    // root height: dip into the crouch, arc through the hop
    pose.y((-0.05 * crouch + 0.22 * air) * e);
    // a squash-and-stretch pair, the classic hop read
    pose.scale(1 + 0.05 * crouch - 0.05 * air, 1 - 0.06 * crouch + 0.07 * air, 1 + 0.05 * crouch - 0.05 * air);
    // a small twist while airborne + a happy face
    pose.body(0, 0.5 * air * e, 0);
    pose.head(0, 0.35 * air * e, 0);
    pose.eyePose('excited', 0.7 * e);
    // optional line, visible while airborne
    if (typeof params.message === 'string' && params.message) pose.message(params.message, ramp(t, 0.3 * s, 0.45 * s) * (1 - ramp(t, 0.85 * s, 1.05 * s)));
  },
});
