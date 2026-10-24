import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeAvatarConfig,
  decodeAvatarConfig,
  isAvatarCode,
  createDefaultAvatarConfig,
  type ConsonaAvatarConfig,
} from '../src/index.ts';

describe('AvatarConfigCoder (Scalable State Encoding & Decoding)', () => {
  it('encodes an avatar config with the avatar- prefix', () => {
    const config = createDefaultAvatarConfig('test-user', 'blue-dark', {
      head: { shape: 'squircle', roundness: 0.92 },
      eyes: { shape: 'star', spacing: 0.65, openness: 0.8 },
    });

    const code = encodeAvatarConfig(config);
    assert.ok(code.startsWith('avatar-'), `Expected code to start with "avatar-", got ${code}`);
    assert.ok(isAvatarCode(code));
  });

  it('losslessly decodes and restores complete avatar configurations', () => {
    const original: ConsonaAvatarConfig = createDefaultAvatarConfig('Alex-42', 'emerald-dark', {
      head: { shape: 'hexagon', roundness: 0.75, surfaceShadow: true },
      eyes: {
        shape: 'archUp',
        tiltMode: 'mirrored',
        tiltAngle: 18,
        spacing: 0.7,
        yOffset: 2.5,
        openness: 0.9,
        pupil: true,
        pupilScale: 0.55,
      },
      behavior: {
        interactive: true,
        preset: 'curious',
      },
    });

    const code = encodeAvatarConfig(original);
    const restored = decodeAvatarConfig(code);

    assert.equal(restored.seed, original.seed);
    assert.equal(restored.paletteId, original.paletteId);
    assert.equal(restored.head.shape, original.head.shape);
    assert.equal(restored.head.roundness, original.head.roundness);
    assert.equal(restored.eyes.shape, original.eyes.shape);
    assert.equal(restored.eyes.tiltMode, original.eyes.tiltMode);
    assert.equal(restored.eyes.tiltAngle, original.eyes.tiltAngle);
    assert.equal(restored.eyes.spacing, original.eyes.spacing);
    assert.equal(restored.eyes.yOffset, original.eyes.yOffset);
    assert.equal(restored.eyes.pupil, original.eyes.pupil);
    assert.equal(restored.behavior?.preset, original.behavior?.preset);
  });

  it('handles decoding with or without avatar- prefix seamlessly', () => {
    const config = createDefaultAvatarConfig('demo', 'mono-light', {
      head: { shape: 'triangle' },
    });
    const codeWithPrefix = encodeAvatarConfig(config);
    const codeWithoutPrefix = codeWithPrefix.replace(/^avatar-/, '');

    const fromWith = decodeAvatarConfig(codeWithPrefix);
    const fromWithout = decodeAvatarConfig(codeWithoutPrefix);

    assert.equal(fromWith.head.shape, 'triangle');
    assert.equal(fromWithout.head.shape, 'triangle');
    assert.deepEqual(fromWith.head, fromWithout.head);
  });

  it('fills defaults for partial share codes', () => {
    // Minimal delta payload (e.g. only seed and head shape)
    const partialCode =
      'avatar-' +
      Buffer.from(JSON.stringify({ seed: 'PartialBot', head: { shape: 'egg' } })).toString(
        'base64url'
      );
    const decoded = decodeAvatarConfig(partialCode);

    assert.equal(decoded.seed, 'PartialBot');
    assert.equal(decoded.head.shape, 'egg');
    // All other fields are cleanly populated with default values
    assert.equal(decoded.paletteId, 'light');
    assert.equal(decoded.eyes.shape, 'capsule');
    assert.equal(decoded.behavior?.preset, 'neutral');
  });

  it('validates invalid codes correctly', () => {
    assert.equal(isAvatarCode(''), false);
    assert.equal(isAvatarCode('not-a-valid-code'), false);
    assert.equal(isAvatarCode('avatar-%%%invalid-base64%%%'), false);
    assert.throws(() => decodeAvatarConfig('avatar-%%%invalid%%%'));
  });
});
