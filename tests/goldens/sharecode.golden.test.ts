import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeAvatarConfig,
  decodeAvatarConfig,
} from '../../src/avatars/consona/sdk/AvatarConfigCoder.ts';
import {
  assertMatchesFixture,
  defaultConfig,
  readFixture,
  UPDATE_GOLDENS,
  writeFixture,
  fixturePath,
} from './helpers.ts';
import { existsSync } from 'node:fs';

describe('W0 goldens: share codes', () => {
  it('default config encode fixture + round trip', () => {
    const config = defaultConfig({
      head: { shape: 'squircle', roundness: 0.9, surfaceShadow: true },
      eyes: { shape: 'star', spacing: 0.6, showPupil: true },
      behavior: { preset: 'curious', interactive: true },
    });
    const code = encodeAvatarConfig(config);
    assertMatchesFixture('sharecode/default.code.txt', code + '\n');

    const restored = decodeAvatarConfig(code.trim());
    assert.equal(restored.seed, config.seed);
    assert.equal(restored.head.shape, config.head.shape);
    assert.equal(restored.eyes.shape, config.eyes.shape);
  });

  it('partial JSON share code fixture', () => {
    const rel = 'sharecode/partial.code.txt';
    if (UPDATE_GOLDENS || !existsSync(fixturePath(rel))) {
      const partial =
        'avatar-' +
        Buffer.from(JSON.stringify({ seed: 'PartialBot', head: { shape: 'egg' } })).toString(
          'base64url'
        );
      writeFixture(rel, partial + '\n');
    }
    const code = readFixture(rel).trim();
    const decoded = decodeAvatarConfig(code);
    assert.equal(decoded.seed, 'PartialBot');
    assert.equal(decoded.head.shape, 'egg');
  });
});
