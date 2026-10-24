import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANNEL_ENERGY, CHANNEL_VALENCE, ChannelBank } from '../src/core/channel/channel.ts';
import type { ChannelSpec } from '../src/core/channel/channel.ts';
import { AvatarStateMachine } from '../src/core/animation/state-machine/AvatarStateMachine.ts';
import { registerPreset } from '../src/core/preset/presets.ts';

const dt = 1 / 60;
const run = (b: ChannelBank, s: number) => { for (let t = 0; t < s - 1e-9; t += dt) b.step(dt); };
const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≈ ${b} ±${eps}`);

test('channels: core valence / energy in fixed slots; install-time indexing, idempotent, unlimited extra channels', () => {
  const b = new ChannelBank();
  assert.equal(b.index('valence'), CHANNEL_VALENCE);
  assert.equal(b.index('energy'), CHANNEL_ENERGY);
  assert.equal(b.index('nope'), -1);
  const specs: ChannelSpec[] = Array.from({ length: 64 }, (_, i) => ({ id: `c${i}` }));
  const slots = specs.map((s) => b.install(s));
  assert.deepEqual(slots, specs.map((_, i) => i + 2), 'appended in order');
  assert.equal(b.install(specs[3]!), 5, 'same id → same slot');
  assert.equal(b.slots.length, 66);
  assert.equal(b.set('c40', 1), true);
  assert.equal(b.set('missing', 1), false);
  run(b, 2);
  assert.equal(b.value(42), 1);
});

test('channels: level easing (critically damped, clamped, null = back to rest, immediate jumps)', () => {
  const b = new ChannelBank([{ id: 'x', settle: 1 }]);
  const x = b.slots[b.index('x')]!;
  b.set('x', 5);
  assert.equal(x.target, 1, 'clamped to the range');
  b.step(0.25);
  assert.ok(x.value > 0 && x.value < 1, 'eases');
  run(b, 3);
  assert.equal(x.value, 1);
  b.set('x', null);
  run(b, 3);
  assert.equal(x.value, 0, 'rest');
  b.set('x', 0.5, true);
  assert.equal(x.value, 0.5, 'immediate');
  assert.equal(b.step(dt), false, 'settled: idle');
});

test('channels: layered targets — preset < set() < behavior hold (rhythm: a set rate is a measurement and wins)', () => {
  const b = new ChannelBank([{ id: 'x', settle: 0 }, { id: 'r', kind: 'rhythm' }]);
  const x = b.index('x'), r = b.index('r');
  b.applyPreset({ x: 0.2, r: 50 });
  assert.equal(b.target(x), 0.2);
  b.set(x, 0.5);
  assert.equal(b.target(x), 0.5, 'set beats the preset');
  b.hold(x, 0.9);
  assert.equal(b.target(x), 0.9, 'behavior beats set');
  b.hold(x, NaN);
  assert.equal(b.target(x), 0.5);
  b.set(x, null);
  assert.equal(b.target(x), 0.2, 'back to the preset');
  b.applyPreset(undefined);
  assert.equal(b.target(x), 0, 'rest');
  b.hold(r, 60);
  b.set(r, 72);
  assert.equal(b.target(r), 72, 'measured rate wins');
  b.set(r, null);
  assert.equal(b.target(r), 60);
});

test('channels: rhythm timing at 60 and 120 per minute (integrated phase, no jump on a rate change)', () => {
  const b = new ChannelBank([{ id: 'r', kind: 'rhythm', settle: 0.01 }]);
  const s = b.slots[b.index('r')]!;
  b.set('r', 60);
  run(b, 10);
  near(s.cycles, 10, 0.05, '60/min');
  const c0 = s.cycles + s.phase;
  b.set('r', 120);
  const before = s.phase;
  b.step(dt);
  assert.ok(Math.abs(s.phase - before) < 0.05, 'phase continuous on a rate change');
  run(b, 10);
  near(s.cycles + s.phase - c0, 20, 0.1, '120/min');
});

test('presets: channel targets blend with the preset (applied on switch, behaviors / set win)', () => {
  registerPreset('fam-ch', 'glum', { channels: { valence: -0.6, energy: -0.4 } });
  const m = new AvatarStateMachine({ family: 'fam-ch', useRegistry: false });
  m.apply('glum');
  assert.equal(m.channels.target('valence'), -0.6);
  m.set('valence', 0.3);
  assert.equal(m.channels.target('valence'), 0.3, 'set wins over the preset');
  m.apply('neutral');
  assert.equal(m.channels.target('energy'), 0, 'preset target released');
  assert.equal(m.channels.target('valence'), 0.3);
});
