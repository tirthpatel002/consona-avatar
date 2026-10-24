import { createConsonaAvatarHandle } from '../src/avatars/consona/sdk/consonaHandle.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AvatarEngine } from '../src/core/engine/AvatarEngine.ts';
import { consonaAvatar } from '../src/avatars/consona/consona.avatar.ts';
import { ConsonaEngine } from '../src/avatars/consona/sdk/ConsonaEngine.ts';

test('AvatarEngine: Instance registration, retrieval and CRUD lifecycle', () => {
  const coreEngine = new AvatarEngine();
  coreEngine.registerDescriptor(consonaAvatar);

  const inst1 = coreEngine.createInstance('bot-alpha', 'consona');
  assert.ok(inst1);
  assert.equal(inst1.id, 'bot-alpha');

  const retrieved = coreEngine.getInstance('bot-alpha');
  assert.equal(retrieved?.id, 'bot-alpha');

  const all = coreEngine.getAllInstances();
  assert.equal(all.length, 1);

  // Update channels
  inst1.channels.setValue('head:roundness', 0.9);
  assert.equal(inst1.channels.getValue('head:roundness'), 0.9);

  // Update and tick
  coreEngine.tick(0.016);

  // Unregister
  coreEngine.destroyInstance('bot-alpha');
  assert.equal(coreEngine.getInstance('bot-alpha'), undefined);
  assert.equal(coreEngine.getAllInstances().length, 0);

  coreEngine.destroy();
});

test('ConsonaEngine: Spatial 3D gaze and Behavior triggers', () => {
  const consona = new ConsonaEngine();
  const inst = consona.create({
    seed: 'Spatial-01',
    paletteId: 'blue-dark',
  });

  assert.ok(inst, 'Instance should be created');
  assert.equal(inst.descriptor.id, 'consona');

  // Trigger an behavior through the unified handle
  assert.ok(createConsonaAvatarHandle(consona, inst.id).play('jump'), 'jump behavior runs');
  assert.equal(inst.stateMachine.behavior, 'jump', 'jump runs');
  assert.ok(inst.mixer.getInstance('jump').enabled, 'jump clip started (fading in)');
  const jump = inst.mixer.get('jump');
  assert.ok(jump, 'Jump animation should exist');

  // Trigger Blink
  consona.triggerBlink(inst.id);

  consona.core.destroyInstance(inst.id);
});
