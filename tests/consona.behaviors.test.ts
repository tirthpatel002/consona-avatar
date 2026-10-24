import { describe, it } from 'node:test';
import assert from 'node:assert';
import { consonaEngine } from '../src/avatars/consona/sdk/ConsonaEngine.ts';
import { createConsonaAvatarHandle } from '../src/avatars/consona/sdk/consonaHandle.ts';
import { avatarEngine } from '../src/core/engine/AvatarEngine.ts';
import { SvgStringRenderer } from '../src/adapters/svg/index.ts';

const TAU = Math.PI * 2;
const wrap = (a: number) => a - TAU * Math.round(a / TAU);   // (-π, π]

describe('Consona behaviors', () => {
  it('lists one name per motion (no two behaviors share a clip motion)', () => {
    const avatar = consonaEngine.create({ seed: 'dedupe', paletteId: 'light' });
    const handle = createConsonaAvatarHandle(consonaEngine, avatar.id);
    const seen = new Map<string, string>();
    for (const name of handle.behaviors) {
      const clip = avatar.mixer.get(name);
      if (!clip?.evaluate) continue;
      const samples = [0, 0.1, 0.33, 0.5, 0.77, 1].map((f) => clip.evaluate!(f * clip.duration, 1 / 60));
      const signature = JSON.stringify({ d: clip.duration, loop: clip.loop, samples });
      const twin = seen.get(signature);
      assert.strictEqual(twin, undefined, `'${name}' duplicates '${twin}'`);
      seen.set(signature, name);
    }
    avatarEngine.destroyInstance(avatar.id);
  });

  for (const [label, params, node, axis] of [
    ['spin (y)', undefined, 'consona:headGroup', 1],
    ['roll (spin, axis z)', { axis: 'z' }, 'consona:headGroup', 2],
  ] as const) {
    it(`${label}: the angle only moves forward and ends on a full turn (no unwind)`, () => {
      const avatar = consonaEngine.create({ seed: `spin-${axis}`, paletteId: 'light' });
      const handle = createConsonaAvatarHandle(consonaEngine, avatar.id);
      const target = avatar.scene.find(node)!;
      assert(handle.play('spin', params ? { params } : undefined));
      let t = 0, prev = 0, total = 0;
      for (let i = 0; i < 90; i++) {   // 1.5 s: the 0.92 s spin + its rest fade
        avatar.update({ time: (t += 1 / 60), deltaTime: 1 / 60, frame: i });
        const a = target.localTransform.rotation[axis];
        const step = wrap(a - prev);
        assert(step >= -1e-6, `frame ${i}: angle went backwards by ${(-step).toFixed(3)} rad`);
        total += step;
        prev = a;
      }
      assert(Math.abs(total - TAU) < 1e-3, `one full turn, got ${total.toFixed(3)} rad`);
      assert(Math.abs(wrap(prev)) < 1e-6, 'rests facing forward');
      avatarEngine.destroyInstance(avatar.id);
    });
  }

  it('rotate loops until replaced, then returns to rest without a jump (any phase)', () => {
    for (const at of [0.6, 1.1, 1.3, 2.2]) {   // 2.4 s cycle: before / around / after half a turn
      const avatar = consonaEngine.create({ seed: `rotate-${at}`, paletteId: 'light' });
      const handle = createConsonaAvatarHandle(consonaEngine, avatar.id);
      const head = avatar.scene.find('consona:headGroup')!;
      let t = 0, i = 0, prev = 0, maxStep = 0;
      const step = () => {
        avatar.update({ time: (t += 1 / 60), deltaTime: 1 / 60, frame: i++ });
        const a = head.localTransform.rotation[1];
        maxStep = Math.max(maxStep, Math.abs(wrap(a - prev)));
        prev = a;
      };
      assert(handle.play('rotate'));
      while (t < 2.4 + at) step();                                   // past a full cycle: still looping
      assert(avatar.mixer.isPlaying('rotate'));
      assert(handle.play('nod'));
      for (let k = 0; k < 60; k++) step();
      assert.strictEqual(avatar.mixer.isPlaying('rotate'), false);
      assert(maxStep < 0.4, `replaced at ${at}s: no jump (max ${maxStep.toFixed(3)} rad/frame)`);
      assert(Math.abs(wrap(prev)) < 1e-6, 'rests facing forward');
      avatarEngine.destroyInstance(avatar.id);
    }
  });

  it('the ground shadow stays flat while the body spins or rotates on any axis', () => {
    const cases: [string, Record<string, unknown> | undefined][] = [
      ['spin', { axis: 'z' }], ['spin', { axis: 'x' }], ['spin', { axis: 'xy' }], ['spin', { axis: 'xyz' }],
      ['spinZ', undefined], ['rotateZ', undefined], ['rotateXYZ', undefined], ['shake', undefined],
    ];
    const renderer = new SvgStringRenderer();
    for (const [name, params] of cases) {
      const avatar = consonaEngine.create({ seed: `shadow-${name}`, paletteId: 'light' });
      consonaEngine.head.setSurfaceShadow(avatar, true);
      const handle = createConsonaAvatarHandle(consonaEngine, avatar.id);
      assert(handle.play(name, params ? { params } : undefined), `${name} plays`);
      let t = 0, rolled = false;
      for (let i = 0; i < 40; i++) {
        avatar.update({ time: (t += 1 / 60), deltaTime: 1 / 60, frame: i });
        const root = avatar.scene.root.worldTransform.rotation;
        assert.deepStrictEqual([...root], [0, 0, 0], `${name}: the root (shadow parent) never rotates`);
        const svg = renderer.renderToString(avatar);
        const shadow = svg.match(/<ellipse id="head-ground-shadow"[^>]*>/)?.[0];
        assert(shadow, `${name}: shadow rendered`);
        assert(!shadow.includes('transform'), `${name}: shadow takes no transform`);
        assert(!/<g transform="[^"]*rotate/.test(svg), `${name}: no rotating group wraps the shadow`);
        if (/id="head-mesh"[^>]*transform="rotate/.test(svg)) rolled = true;
      }
      const z = name === 'rotateZ' || name === 'spinZ' || name === 'shake' || params?.axis === 'z' || params?.axis === 'xy';
      if (z) assert(rolled, `${name}: the body itself rolls`);
      avatarEngine.destroyInstance(avatar.id);
    }
  });
});
