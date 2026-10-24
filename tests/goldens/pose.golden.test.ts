import { describe, it } from 'node:test';
import { assertMatchesFixture, sampleMixerPose, samplePresetPose } from './helpers.ts';

describe('W0 goldens: mixer pose samples', () => {
  // The idle loop is now the 'neutral' preset (seamless config modulation).
  it('neutral preset (former idle loop) at fixed times', () => {
    assertMatchesFixture('pose/neutral-preset.json', samplePresetPose('neutral', [0, 1, 2, 3.9]));
  });

  it('nod one-shot samples', () => {
    assertMatchesFixture(
      'pose/nod.json',
      sampleMixerPose('nod', [0, 0.25, 0.5, 0.75])
    );
  });

  it('nod with gaze corner', () => {
    assertMatchesFixture('pose/nod-gaze-corner.json', sampleMixerPose('nod', [0, 0.25], { x: 8.5, y: -8.5 }));
  });
});
