import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AvatarStateMachine } from '../src/core/animation/state-machine/AvatarStateMachine.ts';
import { registerChannel } from '../src/core/channel/channel.ts';
import { registerPreset } from '../src/core/preset/presets.ts';
import type { BehaviorDefinition, AvatarRig, Vec3Like } from '../src/core/types/AvatarDefinition.ts';

const vec = (x = 0, y = 0, z = 0): Vec3Like => ({ x, y, z, set(a: number, b: number, c: number) { this.x = a; this.y = b; this.z = c; return this; } });
const quat = () => ({ x: 0, y: 0, z: 0, w: 1, set(a: number, b: number, c: number, d: number) { this.x = a; this.y = b; this.z = c; this.w = d; } });
const tf = () => ({ position: vec(), rotation: vec(), scale: vec(1, 1, 1), quaternion: quat() });
const makeRig = (): AvatarRig => ({ root: tf(), body: tf(), head: tf(), hand: tf(), baseY: -1, handRest: 0.3, phase: 0 });
const DT = 1 / 60;
const step = (m: AvatarStateMachine, s: number, each?: () => void) => { for (let t = 0; t < s - 1e-9; t += DT) { m.update({ deltaTime: DT }); each?.(); } };

const FAM = 'fam-resolve';
registerChannel({ id: 'gloom', settle: 0.3, mouth: 'flat', eyes: { pose: 'droop' }, pose: { y: -0.2 } }, FAM);
registerPreset(FAM, 'down', { channels: { gloom: 1 } });
const talk: BehaviorDefinition = { name: 'talk', duration: Infinity, update: ({ pose }) => { pose.mouth('open').message('from the behavior'); } };
const bob: BehaviorDefinition = { name: 'bob', duration: 1, update: ({ pose, t }) => { pose.y(Math.sin(t * 6) * 0.05); } };

test('resolver precedence: preset < channels < behavior < handle message', () => {
  const m = new AvatarStateMachine({ rig: makeRig(), family: FAM, behaviors: [talk], useRegistry: false });
  m.apply('down');
  step(m, 1.5);
  assert.equal(m.face.mouth, 'flat', 'the preset drives the channel, its expression fills the mouth');
  m.set('gloom', 0);
  step(m, 1.5);
  assert.equal(m.face.mouth, null, 'set() beats the preset target');
  m.set('gloom', 1);
  step(m, 1.5);
  m.play('talk');
  step(m, 0.5);
  assert.equal(m.face.mouth, 'open', 'the behavior beats the channel fill');
  assert.equal(m.message.text, 'from the behavior');
  m.emit({ type: 'message', text: 'from the handle' });
  step(m, 0.5);
  assert.equal(m.message.text, 'from the handle', 'a handle message beats the behavior message');
});

test('resolver continuity: the channel pose rides on top of behavior switches and eases out without a jump', () => {
  const rig = makeRig();
  const m = new AvatarStateMachine({ rig, family: FAM, behaviors: [bob], useRegistry: false });
  m.set('gloom', 1);
  step(m, 1.5);
  let prev = rig.root.position.y, maxJump = 0;
  const watch = () => { maxJump = Math.max(maxJump, Math.abs(rig.root.position.y - prev)); prev = rig.root.position.y; };
  m.play('bob');
  step(m, 0.4, watch);
  m.set('gloom', null);
  step(m, 2, watch);
  assert.ok(maxJump < 0.03, `no per-frame jump (${maxJump.toFixed(4)})`);
  assert.ok(Math.abs(rig.root.position.y - rig.baseY) < 0.01, 'back at rest');
});

test('events: emit() queues effects and drives the message (text null clears); LinePool picks one line per run', async () => {
  const { LinePool } = await import('../src/core/event/lines.ts');
  const m = new AvatarStateMachine({ rig: makeRig(), family: FAM, useRegistry: false });
  m.emit({ type: 'effect', kind: 'sparkles', anchor: 'head' });
  assert.equal(m.effects.size, 1, 'effect queued for the renderer');
  m.emit({ type: 'message', text: 'hi', duration: 5 });
  step(m, 0.3);
  assert.equal(m.message.text, 'hi');
  m.emit({ type: 'message', text: null });
  step(m, 0.5);
  assert.equal(m.message.text, '', 'cleared (faded out)');
  const pool = new LinePool(['a', 'b']);
  const run1 = {}, run2 = {};
  const first = pool.text(run1);
  assert.equal(pool.text(run1), first, 'stable within a run');
  assert.notEqual(pool.text(run2), first, 'the next run varies');
  assert.equal(pool.text({ message: 'own' }), 'own');
  assert.equal(pool.text({ message: false }), null);
});
