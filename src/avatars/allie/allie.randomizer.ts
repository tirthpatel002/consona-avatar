import { registerAvatarRandomizer, type AvatarRandomizerSpec, type AvatarRandomRule } from '../../core/studio/randomizer.ts';
import { ALLIE_FAMILY, ALLIE_THREADIES_FAMILY } from './allie.family.ts';

/**
 * Allie randomizers: start from a random preset, keep its character most of
 * the time (body / eyes swap ~half the time, weighted towards the friendliest
 * silhouettes), pick a pleasant preset with a matching mouth, colour from a
 * curated family palette, nudge face / jelly within tasteful bands.
 * Scale, fur layer count, gaze and toggles that change rendering cost stay fixed.
 */

const BODY_WEIGHTS: Record<string, number> = {
  blob: 2.5, dome: 2.5, teardrop: 2, 'capsule-sprout': 2, 'nub-dome': 2, beanie: 2, flower: 1.5, 'scallop-flower': 1.5, heart: 1.5,
  'boucle-cube': 1, 'horned-fluff': 1, snowman: 0.8, 'ring-donut': 0.7, 'loop-box': 0.7, 'cable-arch': 0.6,
};
const EYE_WEIGHTS: Record<string, number> = { pill: 4, sphere: 3, star: 1, heart: 1, cube: 0.3 };
const PRESET_WEIGHTS: Record<string, number> = {
  happy: 3, joyful: 2, content: 2, curious: 2, playful: 2, calm: 1.5, look: 1.5, excited: 1.5, sparkle: 1, wink: 1, love: 1,
  neutral: 0.5, surprised: 0.6, determined: 0.6, sleepy: 0.4, sad: 0.1, angry: 0.1,
};
/** Mouth that reads with each preset. */
export const ALLIE_PRESET_MOUTHS: Record<string, Record<string, number>> = {
  happy: { smile: 3, grin: 2, cat: 1 },
  joyful: { grin: 3, smile: 2, tongue: 1 },
  content: { smile: 3, cat: 1, flat: 0.5 },
  curious: { o: 2, smile: 1, wobbly: 1 },
  calm: { smile: 2, flat: 1, none: 1 },
  look: { smile: 2, none: 1 },
  excited: { grin: 3, o: 1, tongue: 1 },
  sparkle: { smile: 2, grin: 2 },
  wink: { smile: 2, tongue: 1, cat: 1 },
  love: { kiss: 2, smile: 2 },
  playful: { tongue: 2, cat: 2, grin: 1 },
  neutral: { flat: 2, smile: 1, none: 1 },
  surprised: { o: 3 },
  determined: { flat: 2, pout: 1 },
  sleepy: { yawn: 2, flat: 1, none: 1 },
  sad: { frown: 3, wobbly: 1 },
  angry: { frown: 2, pout: 2 },
};

export const ALLIE_PALETTES: Record<string, readonly string[]> = {
  // glossy candy brights
  [ALLIE_FAMILY]: ['#2f7bff', '#ff6fb1', '#f7c531', '#3ec46d', '#ff8a3d', '#8b5cf6', '#22c1c3', '#ff5a5f', '#5b8cff'],
  // knitted pastels / earthy yarns
  [ALLIE_THREADIES_FAMILY]: ['#f7b52a', '#e98a9b', '#7fb7e6', '#9ccf8a', '#c49bdf', '#f2a65a', '#e8d5b0', '#6fc3b2', '#d96c5f'],
};

const sometimes = (p: number, weights: Record<string, number>) => (_: unknown, rng: () => number) => (rng() < p ? weights : ('pin' as const));

const FACE_AND_JELLY: Record<string, AvatarRandomRule> = {
  'eyes.spacing': { range: [0.36, 0.6], dist: 'gaussian' },
  'eyes.size': { range: [0.34, 0.56], dist: 'gaussian' },
  'eyes.lid': { choices: { 0: 5, 0.15: 1, 0.3: 1 } },
  'eyes.pupil': { chance: 0.15 },
  'eyes.outlineWidth': { range: [0.1, 0.28], dist: 'gaussian' },
  'anchor.y': { jitter: 0.03 },
  'anchor.width': { jitter: 0.04 },
  'mouth.width': { range: [0.22, 0.36], dist: 'gaussian' },
  'mouth.open': { jitter: 0.1 },
  'mouth.colorAuto': { value: true },
  'jelly.amount': { range: [0.7, 1.5], dist: 'gaussian' },
  'jelly.stiffness': { range: [80, 160], dist: 'gaussian' },
  'jelly.damping': { range: [0.12, 0.26], dist: 'gaussian' },
  'jelly.idle': { range: [0.2, 0.6], dist: 'gaussian' },
  'jelly.poke': { range: [0.8, 1.4], dist: 'gaussian' },
};

const allieSpec = (family: string): AvatarRandomizerSpec => ({
  atoms: {
    body: sometimes(0.5, BODY_WEIGHTS),
    eyes: sometimes(0.5, EYE_WEIGHTS),
    preset: PRESET_WEIGHTS,
    mouth: (atoms) => ALLIE_PRESET_MOUTHS[atoms.preset ?? ''] ?? { smile: 1 },
  },
  controls: {
    ...FACE_AND_JELLY,
    'body.color': { palette: ALLIE_PALETTES[family]! },
    'fur.length': { jitter: 0.08 },
    'fur.patternShade': { jitter: 0.15 },
    'fur.density': { jitter: 0.05 },
    'fur.droop': { jitter: 0.06 },
  },
  others: 'pin',
  derive(d, rng) {
    if (rng() < 0.25) delete d.values['body.color']; // keep the preset colour sometimes
    // wide-set eyes read better smaller; novelty eyes need size to read
    const spacing = d.get<number>('eyes.spacing');
    if (spacing > 0.54) d.values['eyes.size'] = Math.min(d.get<number>('eyes.size'), 0.48);
    if (d.atoms.eyes === 'star' || d.atoms.eyes === 'heart') d.values['eyes.size'] = Math.max(d.get<number>('eyes.size'), 0.42);
    // mouth width follows the eye span
    const mw = d.get<number | undefined>('mouth.width');
    if (typeof mw === 'number') d.values['mouth.width'] = Math.min(0.36, Math.max(0.22, mw + (spacing - 0.46) * 0.3));
  },
  // eyes must not touch
  reject: (d) => d.get<number>('eyes.size') > d.get<number>('eyes.spacing') * 1.15,
});

/** Register both Allie families' randomizers (idempotent). */
export function registerAllieRandomizers(): void {
  registerAvatarRandomizer(ALLIE_FAMILY, allieSpec(ALLIE_FAMILY));
  registerAvatarRandomizer(ALLIE_THREADIES_FAMILY, allieSpec(ALLIE_THREADIES_FAMILY));
}
