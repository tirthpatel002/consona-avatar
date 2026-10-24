import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultAvatarConfig,
  type ConsonaAvatarConfig,
} from '../src/avatars/consona/consona.config.ts';
import {
  normalizeToCanvas,
  canvasToNormalized,
  CANVAS_DOMAIN,
} from '../src/avatars/consona/layout/consona.layout.ts';

test('CoordinateTransformer: Default configuration produces canonical canvas units', () => {
  const config = createDefaultAvatarConfig('TestSeed-01', 'light');
  const state = normalizeToCanvas(config);

  assert.equal(state.seed, 'TestSeed-01');
  assert.equal(state.paletteId, 'light');
  assert.equal(state.eyes.spacing, 22); // midpoint: 10 + 0.5 * 24 = 22
  assert.equal(state.eyes.yOffset, 44); // center: 44 + 0 * 14 = 44
  assert.equal(state.eyes.xOffset, 0);
  assert.ok(Math.abs(state.eyes.gazeExcursion - 2.27) < 0.05); // midpoint: 0.5^2.4 * 12 ~= 2.27 (desensitized low-end response)
  assert.equal(state.eyes.leftEye.openness, 1.0);
  assert.equal(state.eyes.leftEye.shape, 'capsule');
  assert.equal(state.head.shape, 'circle');
});

test('CoordinateTransformer: Clamping and boundary mappings work accurately', () => {
  const minConfig = createDefaultAvatarConfig('MinSeed', 'dark', {
    eyes: {
      shape: 'dot',
      tiltMode: 'parallel',
      tiltAngle: -45,
      spacing: 0.0,
      yOffset: -1.0,
      xOffset: -1.0,
      size: 0.0,
      openness: 0.0,
      gazeExcursion: 0.0,
    },
  });
  const minState = normalizeToCanvas(minConfig);
  assert.equal(minState.eyes.spacing, CANVAS_DOMAIN.SPACING_MIN);
  assert.equal(minState.eyes.yOffset, CANVAS_DOMAIN.Y_OFFSET_CENTER - CANVAS_DOMAIN.Y_OFFSET_RANGE);
  assert.equal(minState.eyes.xOffset, -CANVAS_DOMAIN.X_OFFSET_RANGE);
  assert.equal(minState.eyes.gazeExcursion, CANVAS_DOMAIN.GAZE_EXCURSION_MIN);
  assert.equal(minState.eyes.leftEye.openness, 0.0);

  const maxConfig = createDefaultAvatarConfig('MaxSeed', 'indigo-light', {
    eyes: {
      shape: 'archUp',
      tiltMode: 'mirrored',
      tiltAngle: 45,
      spacing: 1.0,
      yOffset: 1.0,
      xOffset: 1.0,
      size: 1.0,
      openness: 1.0,
      gazeExcursion: 2.0,
    },
  });
  const maxState = normalizeToCanvas(maxConfig);
  assert.equal(maxState.eyes.spacing, CANVAS_DOMAIN.SPACING_MAX);
  assert.equal(maxState.eyes.yOffset, CANVAS_DOMAIN.Y_OFFSET_CENTER + CANVAS_DOMAIN.Y_OFFSET_RANGE);
  assert.equal(maxState.eyes.xOffset, CANVAS_DOMAIN.X_OFFSET_RANGE);
  assert.equal(maxState.eyes.gazeExcursion, CANVAS_DOMAIN.GAZE_EXCURSION_MAX);
  assert.equal(maxState.eyes.leftEye.openness, 1.0);
});

test('CoordinateTransformer: Bidirectional roundtrip mapping is consistent', () => {
  const original = createDefaultAvatarConfig('Roundtrip-01', 'purple-dark', {
    head: { shape: 'squircle', roundness: 0.9 },
    eyes: {
      shape: 'capsule',
      tiltMode: 'spatial3D',
      tiltAngle: 12,
      spacing: 0.75,
      yOffset: -0.3,
      xOffset: 0.2,
      size: 0.6,
      openness: 0.85,
      gazeExcursion: 0.4,
    },
  });

  const state = normalizeToCanvas(original);
  const normalizedBack = canvasToNormalized(state);

  assert.equal(normalizedBack.seed, original.seed);
  assert.equal(normalizedBack.paletteId, original.paletteId);
  assert.equal(normalizedBack.head.shape, original.head.shape);
  assert.ok(Math.abs(normalizedBack.eyes.spacing! - original.eyes.spacing!) < 0.01);
  assert.ok(Math.abs(normalizedBack.eyes.yOffset! - original.eyes.yOffset!) < 0.01);
  assert.ok(Math.abs(normalizedBack.eyes.xOffset! - original.eyes.xOffset!) < 0.01);
  assert.ok(Math.abs(normalizedBack.eyes.openness! - original.eyes.openness!) < 0.01);
  assert.ok(Math.abs(normalizedBack.eyes.gazeExcursion! - original.eyes.gazeExcursion!) < 0.01);
});
