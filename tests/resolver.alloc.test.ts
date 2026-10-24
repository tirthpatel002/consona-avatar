import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHeapSpaceStatistics, setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { AvatarStateMachine } from '../src/core/animation/state-machine/AvatarStateMachine.ts';
import { registerChannel } from '../src/core/channel/channel.ts';
import type { BehaviorDefinition, AvatarRig, Vec3Like } from '../src/core/types/AvatarDefinition.ts';

const vec = (x = 0, y = 0, z = 0): Vec3Like => ({ x, y, z, set(a: number, b: number, c: number) { this.x = a; this.y = b; this.z = c; return this; } });
const quat = () => ({ x: 0, y: 0, z: 0, w: 1, set(a: number, b: number, c: number, d: number) { this.x = a; this.y = b; this.z = c; this.w = d; } });
const tf = () => ({ position: vec(), rotation: vec(), scale: vec(1, 1, 1), quaternion: quat() });
const makeRig = (): AvatarRig => ({ root: tf(), body: tf(), head: tf(), hand: tf(), baseY: -1, handRest: 0.3, phase: 0 });
const DT = 1 / 60;
const step = (m: AvatarStateMachine, s: number) => { for (let t = 0; t < s - 1e-9; t += DT) m.update({ deltaTime: DT }); };

// Own file = own process: the per-frame path is measured without other tests' shapes in the JIT feedback.
const FAM = 'fam-resolve-alloc';
registerChannel({ id: 'gloom', settle: 0.3, mouth: 'flat', eyes: { pose: 'droop' }, pose: { y: -0.2 } }, FAM);

test('resolver: no per-frame allocation (one reused behavior context, steady heap)', () => {
  const ctxs = new Set<object>();
  const spy: BehaviorDefinition = { name: 'spy', duration: Infinity, update: (c) => { ctxs.add(c); c.pose.mouth('open').y(0.01).message('hi'); } };
  const m = new AvatarStateMachine({ rig: makeRig(), family: FAM, behaviors: [spy], useRegistry: false });
  m.set('gloom', 0.7);
  m.play('spy');
  step(m, 400); // warm up: measure optimized code, not tiering
  assert.equal(ctxs.size, 1, 'the same context object every frame');
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  // young-generation bytes per frame (min of a few rounds: JIT tiering / feedback is not the frame's)
  const young = () => getHeapSpaceStatistics().find((h) => h.space_name === 'new_space')!.space_used_size;
  const frame = { deltaTime: DT };
  let grown = Infinity;
  for (let round = 0; round < 4; round++) {
    gc();
    const before = young();
    for (let i = 0; i < 2000; i++) m.update(frame);
    grown = Math.min(grown, young() - before);
  }
  // V8 boxes doubles stored in object fields (~16 B each, a handful per frame: engine-level, not ours).
  // One object / array / closure per frame (the old per-frame context, a variadic Math call) crosses this.
  const perFrame = grown / 2000;
  assert.ok(perFrame < 144, `no per-frame objects (${perFrame.toFixed(0)} B / frame)`);
});
