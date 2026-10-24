import { test } from 'node:test';
import assert from 'node:assert';
import { AvatarStateMachine } from '../src/core/animation/state-machine/AvatarStateMachine.ts';
import type { AvatarEvent } from '../src/core/animation/state-machine/AvatarStateMachine.ts';
import { defineAvatar, registerBehavior, listBehaviors, listEyePoses, resolveShape, registerAvatarShape } from '../src/core/index.ts';
import { alliePresets, allieBehaviors, ALLIE_HAND, registerAllieKit } from '../src/avatars/allie/index.ts';
import type { AvatarRig, Vec3Like } from '../src/core/types/AvatarDefinition.ts';

const vec = (x = 0, y = 0, z = 0): Vec3Like => ({
  x, y, z,
  set(a: number, b: number, c: number) { this.x = a; this.y = b; this.z = c; return this; },
});
const tf = () => ({ position: vec(), rotation: vec(), scale: vec(1, 1, 1) });
const makeRig = (): AvatarRig => ({ root: tf(), body: tf(), head: tf(), hand: tf(), baseY: -1.7, handRest: 0.35, phase: 0 });
const step = (m: AvatarStateMachine, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) m.update({ deltaTime: dt });
};

test('Avatar SM: starts idle with the default preset', () => {
  const m = new AvatarStateMachine({ rig: makeRig(), behaviors: allieBehaviors, useRegistry: false, preset: 'wink' });
  assert.strictEqual(m.behavior, 'idle');
  assert.strictEqual(m.face.preset, 'wink');
  assert.deepStrictEqual(m.behaviorNames.sort(), allieBehaviors.map((a) => a.name).sort());
});

test('Avatar SM: play() switches preset, then returns to idle and the default preset', () => {
  const m = new AvatarStateMachine({ rig: makeRig(), behaviors: allieBehaviors, useRegistry: false, preset: 'neutral' });
  assert.ok(m.play('jump'));
  assert.strictEqual(m.behavior, 'jump');
  assert.strictEqual(m.face.preset, 'surprised');
  step(m, 1.05);
  assert.strictEqual(m.behavior, 'idle');
  assert.strictEqual(m.face.preset, 'neutral');
});

test('Avatar SM: then-chain runs in order and emits start/end events', () => {
  const rig = makeRig();
  const m = new AvatarStateMachine({ rig, behaviors: allieBehaviors, useRegistry: false });
  const events: AvatarEvent[] = [];
  m.subscribe((e) => events.push(e));
  m.play('jump', { then: ['happy', 'wave'] });
  assert.deepStrictEqual(m.getState().queue, ['happy', 'wave']);
  step(m, 1.05);
  assert.strictEqual(m.behavior, 'happy');
  step(m, 1.55);
  assert.strictEqual(m.behavior, 'wave');
  step(m, 2.05);
  assert.strictEqual(m.behavior, 'idle');
  const starts = events.filter((e) => e.type === 'start').map((e) => (e as { behavior: string }).behavior);
  assert.deepStrictEqual(starts, ['jump', 'happy', 'wave', 'idle']);
  assert.strictEqual(rig.root.position.y, rig.baseY, 'settles back at rest after the chain');
});

test('Avatar SM: interrupt vs enqueue', () => {
  const m = new AvatarStateMachine({ rig: makeRig(), behaviors: allieBehaviors, useRegistry: false });
  m.play('sleep');
  m.play('spin'); // interrupts
  assert.strictEqual(m.behavior, 'spin');
  m.play('wave', { interrupt: false }); // queued
  m.enqueue('happy');
  assert.strictEqual(m.behavior, 'spin');
  assert.deepStrictEqual(m.getState().queue, ['wave', 'happy']);
  m.idle();
  assert.strictEqual(m.behavior, 'idle');
  assert.deepStrictEqual(m.getState().queue, []);
  m.enqueue('happy'); // idle -> starts immediately
  assert.strictEqual(m.behavior, 'happy');
});

test('Avatar SM: unknown behaviors are rejected atomically', () => {
  const m = new AvatarStateMachine({ rig: makeRig(), behaviors: allieBehaviors, useRegistry: false });
  assert.strictEqual(m.play('nope'), false);
  assert.strictEqual(m.play('jump', { then: ['nope'] }), false);
  assert.strictEqual(m.behavior, 'idle');
});

test('Avatar SM: apply persists across behaviors; per-call preset override', () => {
  const m = new AvatarStateMachine({ rig: makeRig(), behaviors: allieBehaviors, useRegistry: false });
  m.apply('sparkle');
  m.play('spin', { preset: 'wink' });
  assert.strictEqual(m.face.preset, 'wink');
  step(m, 1.25);
  assert.strictEqual(m.face.preset, 'sparkle');
});

test("Avatar SM: 'clip' behaviors wait for complete() (AnimationMixer path)", () => {
  const m = new AvatarStateMachine({ rig: makeRig(), behaviors: [...allieBehaviors, { name: 'dance', duration: 'clip', preset: 'happy' }], useRegistry: false });
  m.play('dance', { then: 'wave' });
  step(m, 10);
  assert.strictEqual(m.behavior, 'dance');
  m.complete();
  assert.strictEqual(m.behavior, 'wave');
});

test('Avatar SM: think owns gaze and turns the whole body; custom behaviors run headless', () => {
  const m = new AvatarStateMachine({ rig: makeRig(), behaviors: allieBehaviors, useRegistry: false });
  m.play('think');
  step(m, 1);
  assert.ok(m.ownsGaze);
  assert.ok(!('look' in m.face), 'no eye travel state');
  const headless = new AvatarStateMachine({ useRegistry: false });
  assert.deepStrictEqual(headless.behaviorNames, ['idle']);
  headless.update({ deltaTime: 1 });
});

test('Avatar presets: four valid classic Allie definitions with known presets', () => {
  assert.strictEqual(alliePresets.length, 4);
  for (const p of alliePresets) {
    assert.ok(listEyePoses().includes(p.preset), `${p.id} preset`);
    assert.ok(p.fur !== false && p.fur.shells > 0);
  }
  const yellow = alliePresets.find((p) => p.id === 'yellow')!;
  assert.deepStrictEqual(yellow.accessories?.map((a) => a.type), [ALLIE_HAND, ALLIE_HAND]);
  assert.throws(() => defineAvatar({ id: 'x', body: { shape: 'blob', color: 0 }, anchor: { y: 0, width: 0, height: 1 } }));
});

test('Avatar engine: generic registries start empty and accept avatar content', () => {
  assert.strictEqual(listBehaviors().length, 0, 'engine ships no concrete behaviors');
  for (const m of ['neutral', 'happy', 'sleepy', 'surprised', 'wink', 'sad', 'angry', 'love']) assert.ok(listEyePoses().includes(m), `engine preset ${m}`);
  assert.throws(() => resolveShape('blob'));
  registerAvatarShape('egg', (v) => { v.y *= 1.3; });
  assert.strictEqual(typeof resolveShape('egg'), 'function');
  registerBehavior({ name: 'nod', duration: 1 });
  assert.ok(new AvatarStateMachine().has('nod'), 'registry behaviors are picked up by default');
  registerAllieKit();
  assert.strictEqual(typeof resolveShape('blob'), 'function');
  assert.ok(new AvatarStateMachine().has('wave'));
});
