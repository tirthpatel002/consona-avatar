import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  consonaEngine,
  interpolateConsonaConfig,
} from '../src/index.ts';

test('Avatar SDK: Singleton instance and namespaces are defined', () => {
  assert.ok(consonaEngine);
  assert.ok(consonaEngine.palettes);
  assert.ok(consonaEngine.eyes);
  assert.ok(consonaEngine.head);
  assert.equal(typeof consonaEngine.create, 'function');
  assert.equal(typeof consonaEngine.renderToSvg, 'function');
  assert.equal(typeof interpolateConsonaConfig, 'function');
});

test('Avatar SDK: Create avatar instance and render to SVG', () => {
  const instance = consonaEngine.create({ seed: 'Test-Bot-01', paletteId: 'blue-dark' });
  assert.ok(instance);
  assert.equal(instance.descriptor.id, 'consona');

  const svg = consonaEngine.renderToSvg({
    seed: 'Test-Bot-01',
    paletteId: 'blue-dark',
    head: { shape: 'circle', roundness: 0.85 },
    eyes: { shape: 'capsule' },
  });

  assert.ok(svg.includes('<svg'), 'Rendered output should be valid SVG');
  assert.ok(svg.includes('consona:head'), 'Rendered output contains head atom');

  consonaEngine.core.destroyInstance(instance.id);
});

test('Avatar SDK: Per-avatar and Global Pupil Control', () => {
  const avatar1 = consonaEngine.create({ seed: 'avatar-1', paletteId: 'dark' });
  const avatar2 = consonaEngine.create({ seed: 'avatar-2', paletteId: 'dark' });

  // Turn on for avatar 1 specifically
  consonaEngine.eyes.setPupil(avatar1, { enabled: true, scale: 0.5 });
  assert.equal(avatar1.channels.getValue('eyes:pupilEnabled'), true);
  assert.equal(avatar1.channels.getValue('eyes:pupilScale'), 0.5);

  // Turn on globally
  consonaEngine.eyes.setGlobalPupil({ enabled: true, scale: 0.4 }, true);
  assert.equal(avatar2.channels.getValue('eyes:pupilEnabled'), true);

  // Reset global
  consonaEngine.eyes.setGlobalPupil(false, true);
  assert.equal(avatar1.channels.getValue('eyes:pupilEnabled'), false);
  assert.equal(avatar2.channels.getValue('eyes:pupilEnabled'), false);

  consonaEngine.core.destroyInstance(avatar1.id);
  consonaEngine.core.destroyInstance(avatar2.id);
});

test('Avatar SDK: Switchable Ground Surface Shadow', () => {
  const avatar = consonaEngine.create({ seed: 'Shadow-Bot-01', paletteId: 'mono-dark' });

  // 1. Set to true
  consonaEngine.head.setSurfaceShadow(avatar, true);
  assert.equal(avatar.channels.getValue('head:surfaceShadow'), true);

  // 2. Set to false
  consonaEngine.head.setSurfaceShadow(avatar, false);
  assert.equal(avatar.channels.getValue('head:surfaceShadow'), false);

  consonaEngine.core.destroyInstance(avatar.id);
});
