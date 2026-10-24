import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GazeController,
  AvatarStateMachine,
  axisAngleQuaternion,
  deadZone,
  responseCurve,
  gazeTargetFromDirection,
  parseAvatarAxis,
  resolveSpinParams,
  rotateByQuaternion,
  spinQuaternion,
  AVATAR_EASINGS,
  DEFAULT_GAZE,
} from '../src/core/index.ts';
import { allieSpinBehavior } from '../src/avatars/allie/index.ts';

const run = (g: GazeController, target: { x: number; y: number } | null, seconds: number, onFrame?: (o: ReturnType<GazeController['solve']>, t: number) => void, weight = 1) => {
  let o = g.solve({ dt: 0, target });
  for (let t = 0; t < seconds; t += 1 / 60) {
    o = g.solve({ dt: 1 / 60, target, moved: true, weight });
    onFrame?.(o, t);
  }
  return o;
};

test('gaze moves only the whole body: lead layer first, then the slow body layer', () => {
  const g = new GazeController({ mode: 'body',  idle: false }, 1);
  const prog: { l: number; b: number }[] = [];
  const o0 = run(g, { x: 0.9, y: 0 }, 0.25, (o) => prog.push({ l: o.layers.lead.x, b: o.layers.body.x }));
  const at = prog[5]!; // ~0.1 s
  assert.ok(at.l > at.b, `lead ${at.l} > body ${at.b}`);
  const half = (k: 'l' | 'b') => prog.findIndex((p) => p[k] > 0.45);
  assert.ok(half('l') < half('b') || half('b') === -1, 'lead before body');
  // no eye / face output any more: just body angles
  assert.deepEqual(Object.keys(o0).sort(), ['attention', 'body', 'idling', 'layers']);
});

test('gaze: limits, overshoot and settle', () => {
  const g = new GazeController({ mode: 'body',  idle: false, bodyYaw: 0.45 }, 1);
  let maxBody = 0;
  let maxLead = 0;
  const o = run(g, { x: 5, y: 0 }, 4, (x) => {
    maxBody = Math.max(maxBody, x.layers.body.x);
    maxLead = Math.max(maxLead, x.layers.lead.x);
  });
  // target clamped to the unit disc → settles at the limit
  assert.ok(Math.abs(o.body.yaw - 0.45) < 1e-3, `body yaw ${o.body.yaw}`);
  assert.ok(maxBody > 1.02, `body overshoots (${maxBody})`);
  assert.ok(maxLead > 1.0 && maxLead < 1.2, `lead overshoots a little (${maxLead})`);
  assert.ok(o.body.roll < 0 && o.body.roll >= -DEFAULT_GAZE.bodyRoll - 1e-9, 'body leans toward the target within limits');
  const up = run(new GazeController({ mode: 'body',  idle: false }, 1), { x: 0, y: 0.8 }, 3);
  assert.ok(up.body.pitch < 0, 'looking up tips the body back (negative pitch)');
});

test('gaze: strength preserved — body limits grew to absorb the removed eye/face layers', () => {
  assert.ok(DEFAULT_GAZE.bodyYaw >= 0.78 && DEFAULT_GAZE.bodyYaw <= 0.9, 'bigger body turn');
  assert.ok(DEFAULT_GAZE.bodyPitch >= 0.42 && DEFAULT_GAZE.bodyRoll >= 0.18, 'bigger tilt / lean');
  assert.ok(DEFAULT_GAZE.deadZone <= 0.03 && DEFAULT_GAZE.stiffness > 1.3 && DEFAULT_GAZE.gain > 1);
  assert.ok(!('eyeRange' in DEFAULT_GAZE) && !('faceYaw' in DEFAULT_GAZE), 'no eye / face layers');
  // a corner target (clamped to the rim): the body turns, tilts and leans a lot
  const o = run(new GazeController({ mode: 'body',  idle: false }, 1), { x: 0.75, y: 0.75 }, 4);
  const r = responseCurve(0.75, 0.75, DEFAULT_GAZE.gain).x;
  assert.ok(Math.abs(o.body.yaw - DEFAULT_GAZE.bodyYaw * r) < 0.02, `body yaw ${o.body.yaw}`);
  assert.ok(o.body.yaw > 0.43 && o.body.pitch < -0.23, `body ${o.body.yaw}/${o.body.pitch}`);
  assert.ok(o.body.roll < -0.09, `noticeable lean ${o.body.roll}`);
  const t = (k: number) => { const g = new GazeController({ mode: 'body',  idle: false, stiffness: k }, 1); let n = 0; for (; n < 300; n++) if (g.solve({ dt: 1 / 60, target: { x: 1, y: 0 }, moved: true, weight: 1 }).layers.body.x > 0.5) break; return n; };
  assert.ok(t(DEFAULT_GAZE.stiffness) < t(1));
});

test('gaze: dead zone keeps the body still for small looks', () => {
  const g = new GazeController({ mode: 'body',  idle: false, deadZone: 0.2, gain: 1 }, 1);
  const o = run(g, { x: 0.15, y: 0.05 }, 2);
  assert.equal(o.body.yaw, 0);
  assert.deepEqual(deadZone(0.1, 0, 0.2), { x: 0, y: 0 });
  assert.ok(Math.abs(deadZone(1, 0, 0.2).x - 1) < 1e-9, 'full value at the rim');
});

test('gaze: returns to neutral / idle wander when the target leaves', () => {
  const still = new GazeController({ mode: 'body',  idle: false }, 1);
  run(still, { x: 0.8, y: 0.3 }, 2);
  const back = run(still, null, 3);
  assert.ok(Math.abs(back.body.yaw) < 1e-3, 'neutral');
  const wander = new GazeController({ mode: 'body',  idle: true, idleAmount: 0.35, deadZone: 0 }, 7);
  const seen = new Set<string>();
  let max = 0;
  run(wander, null, 12, (o) => {
    seen.add(o.layers.lead.x.toFixed(2));
    max = Math.max(max, Math.hypot(o.layers.lead.x, o.layers.lead.y));
  });
  assert.ok(seen.size > 20, 'the body wanders (saccades)');
  assert.ok(max < 0.5, 'wander stays small');
});

test('gaze: behaviors blend the body turn out', () => {
  const g = new GazeController({ mode: 'body',  idle: false }, 1);
  const o = run(g, { x: 0.9, y: 0 }, 3, undefined, 0);
  assert.ok(Math.abs(o.body.yaw) < 1e-3);
  const m = new AvatarStateMachine({ behaviors: [allieSpinBehavior] });
  assert.equal(m.gazeWeight, 1, 'idle: full gaze');
  m.play('spin');
  assert.equal(m.gazeWeight, 0, 'spin suppresses the body gaze');
  const m2 = new AvatarStateMachine({ behaviors: [{ name: 'wave', duration: 1, update() {} } as never] });
  m2.play('wave');
  assert.equal(m2.gazeWeight, 0.8, 'other behaviors keep most of the gaze');
});

test('gaze target from a 3D direction', () => {
  assert.deepEqual(gazeTargetFromDirection(0, 0, 1), { x: 0, y: 0 });
  const r = gazeTargetFromDirection(1, 0, 1);
  assert.ok(Math.abs(r.x - 1) < 1e-9, '45° fills the ±45° range');
  assert.ok(Math.abs(gazeTargetFromDirection(1, 0, 1, Math.PI / 3).x - 0.75) < 1e-9, 'custom range');
  assert.ok(gazeTargetFromDirection(0, 1, 1).y > 0.9);
});

test('spin axis parsing', () => {
  assert.deepEqual(parseAvatarAxis(undefined), [0, 1, 0]);
  assert.deepEqual(parseAvatarAxis('x'), [1, 0, 0]);
  const xy = parseAvatarAxis('XY');
  assert.ok(Math.abs(xy[0] - Math.SQRT1_2) < 1e-12 && Math.abs(xy[1] - Math.SQRT1_2) < 1e-12 && xy[2] === 0);
  const v = parseAvatarAxis([2, 0, 0]);
  assert.deepEqual(v, [1, 0, 0]);
  assert.deepEqual(parseAvatarAxis({ x: 0, y: 0, z: 3 }), [0, 0, 1]);
  assert.deepEqual(parseAvatarAxis([0, 0, 0]), [0, 1, 0], 'zero → Y');
  assert.deepEqual(parseAvatarAxis(['a', 1, 2]), [0, 1, 0], 'invalid → Y');
  const xyz = parseAvatarAxis('xyz');
  assert.ok(Math.abs(Math.hypot(...xyz) - 1) < 1e-12);
});

test('spin quaternion maths', () => {
  const close = (a: number[], b: number[], eps = 1e-9) => a.every((x, i) => Math.abs(x - b[i]!) < eps);
  // 90° about Y takes +Z to +X (right-handed)
  assert.ok(close(rotateByQuaternion(axisAngleQuaternion([0, 1, 0], Math.PI / 2), [0, 0, 1]), [1, 0, 0]));
  // 90° about X takes +Y to +Z
  assert.ok(close(rotateByQuaternion(axisAngleQuaternion([1, 0, 0], Math.PI / 2), [0, 1, 0]), [0, 0, 1]));
  // the axis itself is invariant; vectors keep their length
  const ax = parseAvatarAxis([1, 1, 0]);
  const q = axisAngleQuaternion(ax, 1.234);
  assert.ok(close(rotateByQuaternion(q, ax), ax));
  assert.ok(Math.abs(Math.hypot(...rotateByQuaternion(q, [0.3, -2, 5])) - Math.hypot(0.3, -2, 5)) < 1e-9);
  // 120° about XYZ cycles the axes x → y → z
  assert.ok(close(rotateByQuaternion(axisAngleQuaternion(parseAvatarAxis('xyz'), (2 * Math.PI) / 3), [1, 0, 0]), [0, 1, 0]));
  // whole turns end at the identity orientation (q = ±identity), half way is a half turn
  for (const axis of ['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz', [0.2, -1, 3]]) {
    const end = spinQuaternion({ axis, turns: 1 }, 1);
    assert.ok(close(rotateByQuaternion(end, [0.4, 0.5, 0.6]), [0.4, 0.5, 0.6], 1e-9), `full turn about ${axis}`);
    const mid = spinQuaternion({ axis, turns: 1, easing: 'linear' }, 0.5);
    assert.ok(Math.abs(mid[3]) < 1e-9, 'half way = 180°');
  }
  assert.ok(close(spinQuaternion({ axis: 'x', turns: 2 }, 0.25), axisAngleQuaternion([1, 0, 0], resolveSpinParams({ turns: 2 }).easing(0.25) * 4 * Math.PI)));
  // default spin = the original (Y, one smooth turn)
  const def = resolveSpinParams({});
  assert.deepEqual(def.axis, [0, 1, 0]);
  assert.equal(def.turns, 1);
  assert.equal(def.easingName, 'smooth');
  for (const [name, f] of Object.entries(AVATAR_EASINGS)) {
    assert.ok(Math.abs(f(0)) < 1e-9 && Math.abs(f(1) - 1) < 1e-9, name);
  }
});

test('spin behavior uses params (axis, turns, duration) on a quaternion rig', () => {
  const q = { x: 0, y: 0, z: 0, w: 1, set(x: number, y: number, z: number, w: number) { Object.assign(this, { x, y, z, w }); } };
  const v3 = () => ({ x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { Object.assign(this, { x, y, z }); } });
  const rig = { root: { position: v3(), rotation: v3(), scale: v3() }, body: { position: v3(), rotation: v3(), scale: v3(), quaternion: q }, head: { position: v3(), rotation: v3(), scale: v3() }, baseY: 0, handRest: 0, phase: 0 };
  const m = new AvatarStateMachine({ rig, behaviors: [allieSpinBehavior] });
  m.play('spin', { params: { axis: [1, 0, 0], turns: 0.25, duration: 2, easing: 'linear' } });
  m.update({ deltaTime: 1 });
  const exp = axisAngleQuaternion([1, 0, 0], Math.PI / 4);
  assert.ok(Math.abs(q.x - exp[0]) < 1e-9 && Math.abs(q.w - exp[3]) < 1e-9, 'half of a quarter turn about X at t = 1 of 2 s');
  assert.equal(m.behavior, 'spin', 'duration param extends the run');
  m.update({ deltaTime: 1.01 });
  assert.equal(m.behavior, 'idle');
});

test('gaze: sensitivity — small pointer offsets turn the body more, still clamped and continuous', () => {
  // response curve: steeper near the centre, exactly 1 at the rim, never beyond
  assert.ok(responseCurve(0.2, 0, 1.6).x > 0.3, 'small offsets amplified');
  assert.ok(Math.abs(responseCurve(1, 0, 1.6).x - 1) < 1e-9 && Math.abs(responseCurve(5, 0, 1.6).x - 1) < 1e-9, 'clamped at the rim');
  assert.deepEqual(responseCurve(0.3, 0.1, 1), { x: 0.3, y: 0.1 }, 'gain 1 = linear');
  let prev = 0;
  for (let m = 0; m <= 1.0001; m += 0.05) { const v = responseCurve(m, 0, 1.6).x; assert.ok(v >= prev - 1e-12); prev = v; }
  const settle = (opts: object) => run(new GazeController({ mode: 'body',  idle: false, ...opts }, 1), { x: 0.2, y: 0 }, 4).body.yaw;
  const now = settle({});
  const before = settle({ bodyYaw: 0.66, deadZone: 0.05, gain: 1 });
  assert.ok(now > before * 1.8, `stronger response to a small offset (${now} vs ${before})`);
  assert.ok(now < DEFAULT_GAZE.bodyYaw);
});
