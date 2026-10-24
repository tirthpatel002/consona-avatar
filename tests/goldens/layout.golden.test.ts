import { describe, it } from 'node:test';
import {
  assertMatchesFixture,
  defaultConfig,
  layoutSnapshot,
} from './helpers.ts';

describe('W0 goldens: layout mapping', () => {
  it('default normalizeToCanvas', () => {
    assertMatchesFixture('layout/default.json', layoutSnapshot(defaultConfig()));
  });

  it('gaze excursion mid curve', () => {
    const snap = layoutSnapshot(
      defaultConfig({
        eyes: { shape: 'capsule', gazeExcursion: 0.5, spacing: 0.5, size: 0.5 },
      })
    );
    assertMatchesFixture('layout/gaze-mid.json', snap);
  });
});
