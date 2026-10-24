import { registerPreset } from '../../../core/preset/presets.ts';
import type { PresetCycle, PresetSpec } from '../../../core/preset/presets.ts';
import type { DefinedAnimation } from '../../../core/define/defineAnimation.ts';
import type { ChannelSchemaMap } from '../../../core/channel/ChannelSchema.ts';
import { ConsonaHeadSchema } from '../atoms/head.consona.atom.ts';
import { ConsonaEyesSchema } from '../atoms/eyes.consona.atom.ts';
import * as loops from '../animations/presets.consona.animations.ts';

/**
 * Consona presets. Paths are `node.channel` (e.g. `consona:head.yOffset`);
 * values are channel deltas blended with each channel's own blend mode
 * (additive offsets, multiplicative scales), so the neutral value of a path
 * is 0 (additive) or 1 (multiply). The former ambient loops are re-expressed
 * as keyframe cycles sampled from their (periodic) motion functions, so they
 * look the same; `sad` / `surprised` / `love` are authored cycles.
 */
export const CONSONA_PRESET_FAMILY = 'consona';

const SCHEMAS: Record<string, ChannelSchemaMap> = { 'consona:head': ConsonaHeadSchema, 'consona:eyes': ConsonaEyesSchema };

/** Neutral delta of a channel (what "no modulation" means for its blend mode). */
function neutralOf(node: string, channel: string): number {
  const d = SCHEMAS[node]?.[channel];
  return d?.blendMode === 'multiply' ? 1 : 0;
}

/** Sample a periodic loop into keyframe cycles (one per animated numeric channel). */
export function cyclesFromLoop(anim: DefinedAnimation, rate = 60): Record<string, PresetCycle> {
  const evaluate = anim.evaluate;
  if (!evaluate) return {};
  const period = anim.duration;
  const n = Math.max(48, Math.ceil(period * rate));
  const series = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const deltas = evaluate((i / n) * period, period / n) as Record<string, Record<string, unknown>> | undefined;
    if (!deltas) continue;
    for (const node in deltas) {
      const ch = deltas[node]!;
      for (const channel in ch) {
        const v = ch[channel];
        if (typeof v !== 'number') continue;
        const key = `${node}.${channel}`;
        let s = series.get(key);
        if (!s) series.set(key, (s = new Array<number>(n).fill(neutralOf(node, channel))));
        s[i] = v;
      }
    }
  }
  const out: Record<string, PresetCycle> = {};
  for (const [key, keys] of series) {
    const dot = key.lastIndexOf('.');
    const neutral = neutralOf(key.slice(0, dot), key.slice(dot + 1));
    if (keys.every((k) => k === neutral)) continue;
    out[key] = { wave: 'keyframes', mode: 'set', period, keys };
  }
  return out;
}

const fromLoop = (anim: DefinedAnimation, meta: Pick<PresetSpec, 'label' | 'icon' | 'description'>, extra: Partial<PresetSpec> = {}): PresetSpec => ({
  ...meta,
  ...extra,
  cycles: { ...cyclesFromLoop(anim), ...extra.cycles },
});

/** Every Consona preset (shared ids + extras). */
export const CONSONA_PRESETS: Record<string, PresetSpec> = {
  neutral: fromLoop(loops.consonaIdlePresetAnimation, { label: 'Neutral', icon: '🧘', description: 'Serene micro-sway & micro-breathing' }),
  happy: fromLoop(loops.consonaHappyBouncePresetAnimation, { label: 'Happy', icon: '🎈', description: 'Squash-and-stretch spring bounce' }),
  sad: {
    label: 'Sad',
    icon: '🌧️',
    description: 'Lowered, heavy-lidded gaze with a slow sigh',
    targets: { 'consona:eyes.yOffset': 3, 'consona:eyes.openness': 0.72, 'consona:head.yOffset': 1.2, 'blink.rate': 0.6 },
    cycles: {
      'consona:head.yOffset': { wave: 'sine', amp: 0.9, period: 5.6 },
      'consona:eyes.yOffset': { wave: 'sine', amp: 1.2, period: 5.6, phase: 0.05 },
      'consona:eyes.tiltDeg': { wave: 'sine', amp: 1.2, period: 7.2 },
    },
  },
  curious: fromLoop(loops.consonaCuriousTiltPresetAnimation, { label: 'Curious', icon: '🤔', description: 'Inquisitive head cock with attentive saccades' }),
  sleepy: fromLoop(loops.consonaDrowsyPresetAnimation, { label: 'Sleepy', icon: '😴', description: 'Heavy sinking droop & drooping eyelids' }, { targets: { 'blink.rate': 0.5 } }),
  surprised: {
    label: 'Surprised',
    icon: '😮',
    description: 'Wide eyes, lifted head and a light startle tremor',
    targets: { 'consona:eyes.scaleX': 1.1, 'consona:eyes.scaleY': 1.2, 'consona:head.scaleY': 1.03, 'consona:head.yOffset': -1.2, 'blink.rate': 0.35 },
    cycles: {
      'consona:eyes.yOffset': { wave: 'noise', amp: 0.45, period: 0.35, variation: 0.4 },
      'consona:head.scaleX': { wave: 'sine', amp: 0.012, period: 1.6 },
    },
  },
  love: {
    label: 'Love',
    icon: '💗',
    description: 'Soft happy squint with a double-pulse surge',
    targets: { 'consona:eyes.scaleY': 0.82, 'consona:eyes.scaleX': 1.06 },
    cycles: {
      // double beat: lub-dub, rest
      'consona:head.scaleX': { wave: 'keyframes', mode: 'set', period: 1.1, keys: [1, 1.035, 1.0, 1.025, 1, 1, 1, 1] },
      'consona:head.scaleY': { wave: 'keyframes', mode: 'set', period: 1.1, keys: [1, 1.03, 1.0, 1.02, 1, 1, 1, 1] },
      'consona:head.yOffset': { wave: 'sine', amp: 0.8, period: 3.3 },
    },
  },
  thinking: fromLoop(loops.consonaThinkingPresetAnimation, { label: 'Thinking', icon: '💭', description: 'Pondering upward-lateral gaze drift' }),
  // family extras
  calm: fromLoop(loops.consonaNaturalBlinkPresetAnimation, { label: 'Calm', icon: '⚡', description: 'Organic micro-respiration & pupil breathing' }),
  breathing: fromLoop(loops.consonaBreathingPresetAnimation, { label: 'Breathing', icon: '🫧', description: 'Respiration cycle & volumetric expansion' }),
  confused: fromLoop(loops.consonaConfusedPresetAnimation, { label: 'Confused', icon: '🤨', description: 'Alternating head tilt with skeptical squint' }),
  listening: fromLoop(loops.consonaFocusedListeningPresetAnimation, { label: 'Listening', icon: '🎯', description: 'Attentive affirmative micro-nods' }),
  playful: fromLoop(loops.consonaPlayfulWinkPresetAnimation, { label: 'Playful', icon: '😉', description: 'Cheerful micro-sway & playful squint' }),
  excited: fromLoop(loops.consonaJumpingSquishyPresetAnimation, { label: 'Excited', icon: '🦘', description: 'Continuous squash, stretch and hop' }),
  glancing: fromLoop(loops.consonaSaccadesPresetAnimation, { label: 'Glancing', icon: '👀', description: 'Ballistic focal shifts & fixations' }),
  'double-pulse': fromLoop(loops.consonaPulseLoopPresetAnimation, { label: 'Double pulse', icon: '💓', description: 'Rhythmic double-beat surge' }),
  scanning: fromLoop(loops.consonaRadarScanPresetAnimation, { label: 'Scanning', icon: '📡', description: 'Horizon surveillance sweep' }),
  dizzy: fromLoop(loops.consonaDizzySpinPresetAnimation, { label: 'Dizzy', icon: '💫', description: 'Orbital gaze & gyro-tilt' }),
  nervous: fromLoop(loops.consonaTremblePresetAnimation, { label: 'Nervous', icon: '🥶', description: 'High-frequency micro-jitter & alert pupils' }),
  napping: fromLoop(loops.consonaNapPresetAnimation, { label: 'Napping', icon: '🌙', description: 'Closed eyelids & deep slow breath' }, { targets: { 'blink.rate': 0 } }),
};

let done = false;
/** Register Consona's presets (idempotent). */
export function registerConsonaPresets(): void {
  if (done) return;
  done = true;
  for (const id in CONSONA_PRESETS) registerPreset(CONSONA_PRESET_FAMILY, id, CONSONA_PRESETS[id]!);
}
