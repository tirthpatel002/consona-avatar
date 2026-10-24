import { describe, it } from 'node:test';
import {
  assertMatchesFixture,
  defaultConfig,
  renderConfigSvg,
} from './helpers.ts';

describe('W0 goldens: render SVG', () => {
  it('default config', () => {
    const svg = renderConfigSvg(defaultConfig());
    assertMatchesFixture('render/default.svg', svg);
  });

  it('head shape smoke matrix', () => {
    for (const shape of ['circle', 'squircle', 'hexagon'] as const) {
      const svg = renderConfigSvg(defaultConfig({ head: { shape, roundness: 0.85 } }));
      assertMatchesFixture(`render/head-${shape}.svg`, svg);
    }
  });

  it('eye shape smoke matrix', () => {
    for (const shape of ['capsule', 'dot', 'star'] as const) {
      const svg = renderConfigSvg(
        defaultConfig({ eyes: { shape, openness: 1, spacing: 0.5 } })
      );
      assertMatchesFixture(`render/eyes-${shape}.svg`, svg);
    }
  });

  it('pupil on + surface shadow on', () => {
    const svg = renderConfigSvg(
      defaultConfig({
        head: { shape: 'circle', surfaceShadow: true },
        eyes: { shape: 'capsule', showPupil: true, pupil: true },
      })
    );
    assertMatchesFixture('render/pupil-shadow.svg', svg);
  });
});
