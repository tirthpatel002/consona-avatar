import { registerAvatarRandomizer, type AvatarRandomizerSpec } from '../../core/studio/randomizer.ts';
import { CONSONA_FAMILY } from './atoms/eyes.consona.atom.ts';

/**
 * Consona randomizer (absolute rules: config has no presets, so nothing drifts
 * across rolls). Friendly silhouettes and readable eyes weighted up, spiky
 * head + spiky eye combos rejected, eye geometry in tasteful bands, accent from
 * the curated palettes. Behaviour switches (gaze / blink / loops) and gaze
 * sensitivities stay as they are.
 */
const SPIKY_HEADS = new Set(['triangle', 'star', 'diamond']);
const SPIKY_EYES = new Set(['star', 'cross', 'diamond']);
const SMALL_HEADS = new Set(['triangle', 'star', 'heart', 'diamond']);
const LINE_EYES = new Set(['line', 'cross', 'archUp', 'archDown']);

export const CONSONA_RANDOMIZER: AvatarRandomizerSpec = {
  atoms: {
    head: { circle: 3, squircle: 3, egg: 2, capsule: 2, pillHorizontal: 1.5, pillVertical: 1.5, arch: 1.5, square: 1, pear: 1, hexagon: 1, heart: 0.8, diamond: 0.6, triangle: 0.4, star: 0.4 },
    eyes: { capsule: 3, dot: 3, squircle: 2, archUp: 2, halfPill: 1.5, ring: 1.2, diamond: 0.8, heart: 0.8, star: 0.6, line: 0.5, archDown: 0.4, cross: 0.2 },
  },
  controls: {
    mode: { choices: { light: 3, dark: 2 } },
    paletteId: { choices: { mono: 0.6, red: 1, blue: 1.2, purple: 1, green: 1, indigo: 1, orange: 1, yellow: 0.8, brown: 0.6, emerald: 1, gold: 0.8 } },
    'eyes.bgMode': { choices: { accent: 3, white: 2, softAccent: 2, black: 1 } },
    'eyes.pupil': { chance: 0.3 },
    'head.surfaceShadow': { chance: 0.5 },
    'eyes.openness': { range: [0.8, 1] },
    'eyes.size': { range: [0.35, 0.75] },
    'eyes.aspectRatio': { range: [0.7, 1.4] },
    'eyes.tiltMode': { choices: { spatial3D: 4, mirrored: 1, parallel: 1 } },
    'eyes.tiltAngle': { range: [-12, 12] },
    'eyes.spacing': { range: [0.38, 0.62] },
    'eyes.xOffset': { value: 0 },
    'eyes.yOffset': { range: [-0.12, 0.08] },
    'head.roundness': { range: [0.6, 1] },
    'eyes.borderWidth': { choices: { 0: 3, 0.15: 1, 0.3: 1 } },
    'eyes.borderMode': { choices: { accent: 2, contrast: 1, white: 1, black: 1 } },
    'eyes.pupilScale': { range: [0.35, 0.6] },
  },
  others: 'pin',
  derive(d, rng) {
    if (rng() < 0.6) d.values['eyes.tiltAngle'] = 0; // mostly level eyes
    if (SMALL_HEADS.has(d.atoms.head ?? '')) {
      d.values['eyes.size'] = Math.min(d.get<number>('eyes.size'), 0.5);
      d.values['eyes.spacing'] = Math.min(d.get<number>('eyes.spacing'), 0.48);
    }
    // stroke-like eyes have no room for a pupil; pupils sit on a light sclera
    if (LINE_EYES.has(d.atoms.eyes ?? '')) d.values['eyes.pupil'] = false;
    if (d.get('eyes.pupil') === true && d.get('eyes.bgMode') !== 'white') d.values['eyes.bgMode'] = 'white';
  },
  reject: (d) => SPIKY_HEADS.has(d.atoms.head ?? '') && SPIKY_EYES.has(d.atoms.eyes ?? ''),
};

export function registerConsonaRandomizer(): void {
  registerAvatarRandomizer(CONSONA_FAMILY, CONSONA_RANDOMIZER);
}
