/**
 * The `vibe` reference plugin (src/plugins/vibe) — also a worked example of
 * testing a plugin: install its content into a bare state machine and drive
 * channels / behaviors through the machine, no renderer needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AvatarStateMachine } from '../../src/core/animation/state-machine/AvatarStateMachine.ts';
import type { AvatarEvent } from '../../src/core/animation/state-machine/AvatarStateMachine.ts';
import type { AvatarRig } from '../../src/core/types/AvatarDefinition.ts';
import { vibe, FOCUS_MARKS } from '../../src/plugins/vibe/index.ts';
import { CHEER_DURATION } from '../../src/plugins/vibe/behaviors.ts';
import '../../src/avatars/allie/index.ts';

const vec = (x = 0, y = 0, z = 0) => ({
  x, y, z,
  set(a: number, b: number, c: number) { this.x = a; this.y = b; this.z = c; return this; },
});
const tf = () => ({ position: vec(), rotation: vec(), scale: vec(1, 1, 1) });
const makeRig = (): AvatarRig => ({ root: tf(), body: tf(), head: tf(), hand: tf(), baseY: -1.7, handRest: 0.35, phase: 0 });
const dt = 1 / 60;
const step = (m: AvatarStateMachine, s: number) => { for (let t = 0; t < s - 1e-9; t += dt) m.update({ deltaTime: dt }); };

const makeMachine = () => {
  const rig = makeRig();
  const m = new AvatarStateMachine({ rig, useRegistry: false });
  m.install('vibe', vibe.content('allie'));
  return { m, rig };
};

test('vibe: the plugin declares its ids and the content installs them', () => {
  assert.deepEqual([...vibe.behaviors], ['cheer']);
  assert.deepEqual([...vibe.channels], ['focus']);
  assert.deepEqual([...vibe.presets], ['focused']);
  const { m } = makeMachine();
  assert.ok(m.plugins.includes('vibe'));
  assert.equal(m.set('focus', 1), true, 'focus channel installed');
  m.apply('focused');
  assert.equal(m.channels.target('focus'), 1, 'the focused preset sets the focus level');
});

test('vibe: focus level eases in at the settle rate and the api helper clamps', () => {
  const { m } = makeMachine();
  m.set('focus', 1);
  // the target is immediate; the level eases (~1 s settle)
  assert.equal(m.channels.target('focus'), 1);
  step(m, 0.1);
  const early = m.channels.value('focus');
  step(m, 2);
  const late = m.channels.value('focus');
  assert.ok(late > early + 0.5, `level eases in (${early.toFixed(2)} → ${late.toFixed(2)})`);
  assert.ok(late > 0.9, 'fully leaned in after the settle');
  // the plugin's api helpers are thin typed wrappers over the machine
  const api = vibe.api({ id: 't', play: () => true, set: (c, v) => m.set(c, v ?? 0), apply: (p) => m.apply(p) });
  api.focus(3);
  assert.equal(m.channels.target('focus'), 1, 'clamped to the range');
  api.focus(false);
  assert.equal(m.channels.target('focus'), 0);
  assert.equal(FOCUS_MARKS.length, 3);
});

test('vibe: cheer hops, fires its cues (hop / sparkle effect / land) and returns to rest', () => {
  const { m, rig } = makeMachine();
  const cues: AvatarEvent[] = [];
  m.subscribe((e) => cues.push(e));
  assert.ok(m.play('cheer', { params: { message: 'Ship it!' } }));
  m.update({ deltaTime: dt }); // settle into the start pose (rest = baseY)
  const restY = rig.root.position.y;
  let peakY = -Infinity, endY = Infinity;
  for (let t = dt; t < CHEER_DURATION + 0.5 - 1e-9; t += dt) {
    m.update({ deltaTime: dt });
    peakY = Math.max(peakY, rig.root.position.y);
    if (t > CHEER_DURATION) endY = rig.root.position.y;
  }
  const names = cues.filter((e) => e.type === 'cue').map((e) => e.cue);
  assert.ok(names.includes('hop') && names.includes('land'), `cues fired: ${names.join(',')}`);
  // cue `effect`s go to the renderer-facing effect queue, not the event stream
  assert.equal(m.effects.size, 1, 'sparkles queued once at take-off');
  assert.ok(peakY > restY + 0.1, `hop lifts the root (${(peakY - restY).toFixed(3)})`);
  assert.ok(Math.abs(endY - restY) < 0.01, 'back at rest after the run');
});

test('vibe: no plugin → no behavior; installing enables it', () => {
  const rig = makeRig();
  const m = new AvatarStateMachine({ rig, useRegistry: false });
  assert.equal(m.play('cheer'), false, 'not installed yet');
  m.install('vibe', vibe.content('allie'));
  assert.ok(m.play('cheer'));
  assert.ok(m.play('cheer'), 'a new run still interrupts the previous one');
});
