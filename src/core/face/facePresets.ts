import { registerPreset } from '../preset/presets.ts';
import type { PresetSpec } from '../preset/presets.ts';
import { listEyePoses } from './eyes.ts';
import { MOUTH_IDLE_SHAPE, MOUTH_PRESET_SHAPE } from './mouth.ts';

/** Preset → mouth (a preset picks a mouth like it picks an eye pose); unmapped presets keep the selected mouth. */
export const FACE_PRESET_MOUTHS: Readonly<Record<string, string>> = {
  happy: 'grin',
  joyful: 'grin',
  excited: 'grin',
  sparkle: 'grin',
  playful: 'cat',
  wink: 'cat',
  love: 'kiss',
  content: 'smile',
  surprised: 'o',
  curious: 'o',
  calm: 'flat',
  angry: 'flat',
  sleepy: 'flat',
  determined: 'pout',
  sad: 'frown',
  nervous: 'wobbly',
  shy: 'wobbly',
};

/**
 * Face presets of the embedded-face (Three) families as preset specs: the eye
 * pose and mouth are variant targets (`eyes.pose`, `mouth.presetShape`; the eye
 * and mouth parts morph between them), idle variations are seeded
 * `variations` (sleepy: an occasional yawn), and `thinking` is a gaze-bias
 * cycle. Same look as before; add `cycles` (e.g. `pose.bob`, `body.scale`,
 * `plush.*`, `mouth.curve`) to make a preset move.
 */
export function facePresetSpecs(family?: string): Record<string, PresetSpec> {
  const out: Record<string, PresetSpec> = {};
  const poses = listEyePoses(family);
  for (const pose of poses) {
    const targets: Record<string, string> = { 'eyes.pose': pose };
    const mouth = FACE_PRESET_MOUTHS[pose];
    if (mouth) targets[MOUTH_PRESET_SHAPE] = mouth;
    out[pose] = { targets };
  }
  out.sleepy = { ...out.sleepy, variations: [{ path: MOUTH_IDLE_SHAPE, value: 'yawn', every: [5, 11], hold: 2.4 }] };
  out.thinking = {
    targets: { 'eyes.pose': poses.includes('look') ? 'look' : 'neutral', 'gaze.y': 0.35 },
    cycles: { 'gaze.x': { wave: 'noise', amp: 0.35, period: 2.6 } },
  };
  return out;
}

/** Register the face presets for `families` (idempotent per family; call after the eye poses are installed). */
const installed = new Set<string>();
export function installFacePresets(families: readonly string[]): void {
  for (const f of families) {
    if (installed.has(f)) continue;
    installed.add(f);
    const specs = facePresetSpecs(f);
    for (const id in specs) registerPreset(f, id, specs[id]!);
  }
}
