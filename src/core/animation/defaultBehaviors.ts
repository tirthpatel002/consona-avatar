import type { BehaviorDefinition } from '../types/AvatarDefinition.ts';
import { AVATAR_AXIS_PRESETS, AVATAR_EASINGS, avatarEnvelope, registerBehavior, spinQuaternion } from './behaviors.ts';

/**
 * Opt-in generic procedural behaviors for body-style rigs (`AvatarRig`: root /
 * body / head / optional hand). Nothing registers them automatically: call
 * `installDefaultBehaviors()` or register a family's own tuned copies. Any of
 * these can be replaced per-avatar by a glTF clip via `model.clips`.
 */


export const defaultIdleBehavior: BehaviorDefinition = {
  name: 'idle',
  duration: Infinity,
  preset: null,
  update({ rig, pose, t }) {
    const s = Math.sin(t * 2.2 + rig.phase);
    pose.scale(1 + s * 0.015, 1 - s * 0.02, 1 + s * 0.015);
    pose.body(0, 0, Math.sin(t * 1.1 + rig.phase) * 0.02);
  },
};

export const defaultWaveBehavior: BehaviorDefinition = {
  name: 'wave',
  duration: 2.0,
  preset: 'happy',
  update({ rig, pose, t }) {
    const e = avatarEnvelope(t, 2, 4);
    if (rig.hand) pose.hand((0.4 + Math.sin(t * 14) * 0.35) * e);
    else pose.body(0, 0, Math.sin(t * 9) * 0.12 * e);
  },
};

export const defaultJumpBehavior: BehaviorDefinition = {
  name: 'jump',
  duration: 1.0,
  preset: 'surprised',
  update({ pose, t }) {
    // anticipation squash -> stretch in air -> landing squash
    const s =
      t < 0.2
        ? 1 - Math.sin((t / 0.2) * Math.PI) * 0.22
        : t < 0.8
          ? 1 + Math.sin(((t - 0.2) / 0.6) * Math.PI) * 0.14
          : 1 - Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.18;
    const w = 1 / Math.sqrt(s);
    pose.scale(w, s, w);
    pose.y((t > 0.2 && t < 0.8 ? Math.sin(((t - 0.2) / 0.6) * Math.PI) * 1.1 : 0));
  },
};

/**
 * Spin about any axis: `do('spin', { params: { axis: [1, 1, 0] | 'xz', turns: 1, duration: 1.2, easing: 'smooth' } })`.
 * Quaternion based (no gimbal lock); the default is one smooth turn about Y.
 */
export const defaultSpinBehavior: BehaviorDefinition = {
  name: 'spin',
  duration: 1.2,
  preset: 'sparkle',
  gaze: 0,
  params: {
    axis: { kind: 'vector3', label: 'Axis', default: [0, 1, 0], presets: AVATAR_AXIS_PRESETS },
    turns: { kind: 'number', label: 'Turns', default: 1, min: -4, max: 4, step: 0.25 },
    duration: { kind: 'number', label: 'Duration', default: 1.2, min: 0.3, max: 6, step: 0.1 },
    easing: { kind: 'select', label: 'Easing', default: 'smooth', options: Object.keys(AVATAR_EASINGS) },
  },
  update({ pose, t, params, duration }) {
    const k = duration > 0 ? t / duration : 1;
    const [x, y, z, w] = spinQuaternion(params, k);
    pose.bodyQuaternion(x, y, z, w);
    pose.y(Math.sin(k * Math.PI) * 0.3);
  },
};

export const defaultThinkBehavior: BehaviorDefinition = {
  name: 'think',
  duration: 3.0,
  preset: 'look',
  ownsGaze: true,
  gaze: 0.2,
  update({ pose, t }) {
    const e = avatarEnvelope(t, 3, 3);
    // the eyes are fixed on the body: the whole body turns up and aside to think
    pose.body(-0.12 * e, 0.34 * e, 0.14 * e);
    pose.hand(0.3 * e);
  },
};

export const defaultSleepBehavior: BehaviorDefinition = {
  name: 'sleep',
  duration: 5.0,
  preset: 'sleepy',
  update({ pose, t }) {
    const e = avatarEnvelope(t, 5, 2);
    const b = Math.sin(t * 1.6) * 0.03 * e;
    pose.scale(1 + 0.05 * e + b, 1 - 0.08 * e - b, 1 + 0.05 * e + b);
    pose.body(0.12 * e, 0, 0);
  },
};

export const defaultHappyBehavior: BehaviorDefinition = {
  name: 'happy',
  duration: 1.5,
  preset: 'happy',
  update({ pose, t }) {
    pose.body(0, 0, Math.sin(t * 10) * 0.1 * (1.5 - t));
    pose.y(Math.abs(Math.sin(t * 8)) * 0.15);
  },
};

/** Ids of the default behaviors every family gets (for typed handles). */
export type DefaultBehaviorId =
  | 'idle' | 'wave' | 'jump' | 'spin' | 'think' | 'sleep' | 'happy' | 'wink'
  | 'bounce' | 'shake' | 'rock' | 'squash' | 'nod' | 'breathe' | 'wiggle' | 'tilt' | 'wobble';

export const defaultBehaviors: BehaviorDefinition[] = [
  defaultIdleBehavior,
  defaultWaveBehavior,
  defaultJumpBehavior,
  defaultSpinBehavior,
  defaultThinkBehavior,
  defaultSleepBehavior,
  defaultHappyBehavior,
];

// ---------- extra one-shot motions (bounce, shake, rock, ...) ----------

const env = (t: number, d: number) => avatarEnvelope(t, d, 4);

const smooth01 = (x: number): number => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** Wink timing (s): the winking eye eases in, holds, eases out; mouth / head follow. */
export const WINK_TIMING = { in: 0.12, hold: 0.42, out: 0.2, duration: 0.95 };

/**
 * The 'wink' PRESET's winking eye (its eye pose, overlaid relatively on the live
 * preset eyes via `pose.eyePose`, so the eye rig eases in / out like a preset
 * change), a small head tilt + squash toward that side, and `params.mouth`
 * ('wobbly') meanwhile; the mouth then morphs back to the configured / preset
 * mouth (avatars without a mouth keep none). Relative to the live pose.
 */
export const defaultWinkBehavior: BehaviorDefinition = {
  name: 'wink',
  duration: WINK_TIMING.duration,
  preset: null,
  params: {
    side: { kind: 'select', label: 'Eye', options: ['right', 'left'], default: 'right' },
    mouth: { kind: 'select', label: 'Mouth', options: ['wobbly', 'none'], default: 'wobbly' },
  },
  update({ pose, t, params, duration }) {
    const T = WINK_TIMING;
    const w = smooth01(t / T.in) * (1 - smooth01((t - T.in - T.hold) / T.out));
    // the wink preset winks its right eye; mirror it for a left wink
    const left = params.side === 'left';
    pose.eyePose('wink', w, left);
    // head / body lean toward the winking side: +Z lowers the -X (left) side
    const e = smooth01(t / 0.18) * (1 - smooth01((t - (duration - 0.4)) / 0.4));
    const dir = left ? 1 : -1;
    pose.head(0, 0, 0.09 * dir * e);
    pose.body(0, 0, 0.035 * dir * e);
    const sq = 0.035 * e;
    pose.scale(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    const m = typeof params.mouth === 'string' ? params.mouth : 'wobbly';
    if (m !== 'none' && t < duration - 0.3) pose.mouth(m);
  },
};

export const defaultExtraBehaviors: BehaviorDefinition[] = [
  {
    name: 'bounce',
    duration: 1.6,
    preset: null,
    update({ pose, t }) {
      const ph = (t * 2.5) % 1;
      const h = Math.sin(ph * Math.PI);
      const s = ph < 0.12 || ph > 0.9 ? 0.9 : 1 + h * 0.06;
      pose.scale(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      pose.y(h * 0.45 * env(t, 1.6));
    },
  },
  {
    name: 'shake',
    duration: 1.2,
    preset: null,
    update({ pose, t }) {
      const e = env(t, 1.2);
      pose.body(0, Math.sin(t * 53) * 0.05 * e, Math.sin(t * 46) * 0.07 * e);
    },
  },
  {
    name: 'rock',
    duration: 2.4,
    preset: null,
    update({ pose, t }) {
      pose.body(0, 0, Math.sin(t * 4.2) * 0.16 * env(t, 2.4));
    },
  },
  {
    name: 'squash',
    duration: 1.4,
    preset: null,
    update({ pose, t }) {
      const s = 1 + Math.sin(t * 9) * 0.14 * env(t, 1.4);
      const w = 1 / Math.sqrt(s);
      pose.scale(w, s, w);
    },
  },
  {
    name: 'nod',
    duration: 1.6,
    preset: null,
    update({ pose, t }) {
      const e = env(t, 1.6);
      pose.body(Math.max(0, Math.sin(t * 8)) * 0.16 * e, 0, 0);
      pose.head(Math.max(0, Math.sin(t * 8 - 0.4)) * 0.06 * e, 0, 0);
    },
  },
  {
    name: 'breathe',
    duration: 4,
    preset: null,
    update({ pose, t }) {
      const b = (1 - Math.cos((t / 4) * Math.PI * 4)) * 0.5 * env(t, 4);
      pose.scale(1 + b * 0.06, 1 + b * 0.05, 1 + b * 0.06);
    },
  },
  {
    name: 'wiggle',
    duration: 1.8,
    preset: null,
    update({ rig, pose, t }) {
      const e = env(t, 1.8);
      if (rig.hand) pose.hand(Math.sin(t * 16) * 0.35 * e);
      pose.body(0, Math.sin(t * 8) * 0.12 * e, Math.sin(t * 8) * 0.04 * e);
    },
  },
  {
    name: 'tilt',
    duration: 2.0,
    preset: null,
    update({ pose, t }) {
      const e = env(t, 2);
      pose.body(0, 0, 0.22 * e);
      pose.head(0, 0, 0.05 * e);
    },
  },
  {
    name: 'wobble',
    duration: 2.0,
    preset: null,
    update({ pose, t }) {
      const e = env(t, 2);
      pose.body(Math.sin(t * 7) * 0.08 * e, 0, Math.cos(t * 7) * 0.1 * e);
    },
  },  defaultWinkBehavior,
];

/** Register the default behaviors (globally, or for one family scope). */
export function installDefaultBehaviors(family?: string): void {
  for (const a of defaultBehaviors) registerBehavior(a, family);
  for (const a of defaultExtraBehaviors) registerBehavior(a, family);
}
