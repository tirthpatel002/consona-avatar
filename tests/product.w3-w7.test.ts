import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../src/core/registry/Registry.ts';
import { defineAnimation } from '../src/core/define/defineAnimation.ts';
import { AvatarEngine } from '../src/core/engine/AvatarEngine.ts';
import { consonaAvatar } from '../src/avatars/consona/consona.avatar.ts';
import { HEAD_SHAPE_IDS } from '../src/avatars/consona/variants/head.variants.ts';

describe('W3–W7 product layers', () => {
  it('Registry throws on duplicate id', () => {
    const reg = new Registry<{ id: string }>();
    reg.register({ id: 'a' });
    assert.throws(() => reg.register({ id: 'a' }));
  });

  it('one name per clip: no aliases (nod has no yes / agree twins)', () => {
    const core = new AvatarEngine();
    core.registerDescriptor(consonaAvatar);
    const inst = core.createInstance('t', 'consona');
    assert.ok(inst.mixer.get('nod'));
    assert.strictEqual(inst.mixer.get('yes'), undefined);
    assert.strictEqual(inst.mixer.get('agree'), undefined);
    core.destroy();
  });

  it('AvatarEngine.play resolves for one-shot', async () => {
    const core = new AvatarEngine();
    core.registerDescriptor(consonaAvatar);
    const inst = core.createInstance('play-test', 'consona');
    const p = core.play('play-test', 'blink', { loop: false });
    for (let i = 0; i < 40; i++) core.tick(0.05);
    await p;
    core.destroy();
  });

  it('exposes all 14 head shape variants', () => {
    assert.equal(HEAD_SHAPE_IDS.length, 14);
    assert.ok(HEAD_SHAPE_IDS.includes('square'));
    assert.ok(HEAD_SHAPE_IDS.includes('pear'));
  });

  it('defineAnimation helper shape', () => {
    const anim = defineAnimation({
      name: 'x',
      duration: 1,
      loop: true,
      meta: { label: 'X' },
    });
    assert.equal(anim.id, 'x');
    assert.equal(anim.meta?.label, 'X');
  });
});
