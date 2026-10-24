import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AvatarStateMachine } from '../src/core/animation/state-machine/AvatarStateMachine.ts';
import { AvatarTimelinePlayer, defineTimeline, type AvatarTimelineTarget } from '../src/core/animation/timeline.ts';
import { allieBehaviors } from '../src/avatars/allie/index.ts';
import { consonaEngine } from '../src/avatars/consona/sdk/ConsonaEngine.ts';
import { playConsonaClip } from '../src/avatars/consona/sdk/consonaClips.ts';
import type { AvatarRig, Vec3Like } from '../src/core/types/AvatarDefinition.ts';

const vec = (x = 0, y = 0, z = 0): Vec3Like => ({ x, y, z, set(a: number, b: number, c: number) { this.x = a; this.y = b; this.z = c; return this; } });
const quat = () => ({ x: 0, y: 0, z: 0, w: 1, set(a: number, b: number, c: number, d: number) { Object.assign(this, { x: a, y: b, z: c, w: d }); } });
const tf = () => ({ position: vec(), rotation: vec(), scale: vec(1, 1, 1), quaternion: quat() });
const makeRig = (): AvatarRig => ({ root: tf(), body: tf(), head: tf(), hand: tf(), baseY: -1, handRest: 0.3, phase: 0 });
const DT = 1 / 60;
const step = (m: AvatarStateMachine, s: number, dt = DT) => {
  for (let t = 0; t < s - 1e-9; t += dt) m.update({ deltaTime: dt });
};
const snapshot = (r: AvatarRig) => {
  const q = r.body.quaternion as unknown as { x: number; y: number; z: number; w: number };
  // orientation as rotated basis vectors (q and −q are the same rotation)
  const rot = (vx: number, vy: number, vz: number) => {
    const tx = 2 * (q.y * vz - q.z * vy), ty = 2 * (q.z * vx - q.x * vz), tz = 2 * (q.x * vy - q.y * vx);
    return [vx + q.w * tx + (q.y * tz - q.z * ty), vy + q.w * ty + (q.z * tx - q.x * tz), vz + q.w * tz + (q.x * ty - q.y * tx)];
  };
  return [r.root.position.y, r.body.scale.x, r.body.scale.y, ...rot(0, 0, 1), ...rot(0, 1, 0), r.hand!.rotation.z];
};
const maxDiff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

test('interrupt mid-behavior continues from the live pose (no snap to rest), then settles', () => {
  const rig = makeRig();
  const m = new AvatarStateMachine({ rig, behaviors: allieBehaviors, useRegistry: false });
  m.play('jump');
  step(m, 0.5); // mid-air
  const before = snapshot(rig);
  assert.ok(before[0]! - rig.baseY > 0.5, 'airborne');
  m.play('wave');
  m.update({ deltaTime: DT });
  const after = snapshot(rig);
  // 0.15 s crossfade: the jump height relaxes over a few frames, never jumps back to rest
  assert.ok(Math.abs(after[0]! - before[0]!) < 0.2, `no snap: Δy ${after[0]! - before[0]!}`);
  assert.ok(after[0]! - rig.baseY > 0.8, 'still airborne on the first frame');
  step(m, 0.6);
  assert.ok(Math.abs(rig.root.position.y - rig.baseY) < 0.02, 'jump height relaxed away');
});

test('velocity carries across an interrupt (rising vs falling at the same height)', () => {
  // jump height is symmetric: same y at t = 0.3 (rising) and t = 0.7 (falling)
  const interruptAt = (t: number) => {
    const rig = makeRig();
    const m = new AvatarStateMachine({ rig, behaviors: allieBehaviors, useRegistry: false });
    m.play('jump');
    m.update({ deltaTime: t - DT });
    m.update({ deltaTime: DT });
    const y0 = rig.root.position.y;
    assert.ok(m.play('wave'));
    m.update({ deltaTime: DT });
    return { y0, y1: rig.root.position.y };
  };
  const up = interruptAt(0.3);
  const down = interruptAt(0.7);
  assert.ok(Math.abs(up.y0 - down.y0) < 1e-3, 'same height');
  assert.ok(up.y1 > down.y1 + 0.05, `momentum carried (${up.y1} vs ${down.y1})`);
});

test('queued behaviors hand off continuously; one-shots ease back to rest', () => {
  const rig = makeRig();
  const m = new AvatarStateMachine({ rig, behaviors: allieBehaviors, useRegistry: false });
  m.play('happy', { then: ['spin'] });
  m.update({ deltaTime: DT });
  let prev = snapshot(rig);
  let worst = 0;
  for (let i = 0; i < 180; i++) {
    m.update({ deltaTime: DT });
    const s = snapshot(rig);
    worst = Math.max(worst, maxDiff(s, prev));
    prev = s;
  }
  assert.ok(worst < 0.2, `per-frame change stays small through the hand-off (${worst})`);
  step(m, 1.5);
  assert.equal(m.behavior, 'idle');
  assert.ok(Math.abs(rig.root.position.y - rig.baseY) < 0.02);
});

test("end modes: pose holds until the next behavior; 'rest' eases back", () => {
  const rig = makeRig();
  const m = new AvatarStateMachine({ rig, behaviors: allieBehaviors, useRegistry: false });
  m.pose({ y: 0.5, body: [0, 0.4, 0] }, { duration: 0.3 });
  step(m, 1.5);
  assert.equal(m.behavior, 'idle');
  assert.ok(Math.abs(rig.root.position.y - rig.baseY - 0.5) < 1e-6, 'held through idle');
  assert.ok(m.play('wave'));
  step(m, 0.05);
  assert.ok(rig.root.position.y - rig.baseY > 0.2, 'released smoothly, not snapped');
  step(m, 0.6);
  assert.ok(Math.abs(rig.root.position.y - rig.baseY) < 0.02, 'hold released');
  m.pose({ y: 0.4 }, { duration: 0.2, end: 'rest' });
  step(m, 0.25);
  step(m, 0.8);
  assert.ok(Math.abs(rig.root.position.y - rig.baseY) < 0.02, "'rest' returns");
});

/** Timeline target over a bare machine (what AvatarRuntime does, minus gaze). */
const machineTarget = (m: AvatarStateMachine): AvatarTimelineTarget => ({
  durationOf: (a, p) => m.durationOf(a, p),
  behavior: (name, o) => void m.play(name, { params: o.params, preset: o.preset, end: o.end, blend: o.blend, offset: o.offset }),
  pose: (p, o) => m.pose(p, o),
  preset: (preset) => m.apply(preset),
  reset: () => m.reset('neutral'),
  step: (dt) => m.update({ deltaTime: dt }),
});

const SCRIPT = defineTimeline(
  [{ behavior: 'jump' }, { preset: 'love' }, { behavior: 'spin', params: { turns: 1, duration: 1 } }, { pose: { body: [0, 0.3, 0.1] }, duration: 0.4 }, { wait: 0.3 }, { behavior: 'happy' }],
  { blink: { seed: 9 } },
);

test('timeline: sequential schedule, deterministic seek, frame-rate independent beats', () => {
  const run = (dt: number, until: number) => {
    const rig = makeRig();
    const m = new AvatarStateMachine({ rig, behaviors: allieBehaviors, useRegistry: false });
    const p = new AvatarTimelinePlayer(SCRIPT, machineTarget(m));
    for (let t = 0; t < until - 1e-9; t += dt) m.update({ deltaTime: p.update(dt) });
    return { rig, m, p };
  };
  const a = run(DT, 2.4);
  assert.equal(a.p.duration, 1 + 1 + 0.4 + 0.3 + 1.5);
  const rig = makeRig();
  const m = new AvatarStateMachine({ rig, behaviors: allieBehaviors, useRegistry: false });
  const p = new AvatarTimelinePlayer(SCRIPT, machineTarget(m));
  p.seek(2.4);
  assert.ok(maxDiff(snapshot(rig), snapshot(a.rig)) < 1e-9, 'seek == playback');
  assert.equal(m.face.preset, a.m.face.preset);
  p.seek(1.2);
  const again = snapshot(rig);
  p.seek(1.2);
  assert.ok(maxDiff(snapshot(rig), again) < 1e-12, 'seek is repeatable');
  const slow = run(1 / 30, 2.4);
  assert.ok(maxDiff(snapshot(slow.rig), snapshot(a.rig)) < 0.03, 'same pose at 30 fps');
  const b1 = new AvatarTimelinePlayer(SCRIPT, machineTarget(new AvatarStateMachine({ useRegistry: false, behaviors: allieBehaviors })));
  const b2 = new AvatarTimelinePlayer(SCRIPT, machineTarget(new AvatarStateMachine({ useRegistry: false, behaviors: allieBehaviors })));
  const blinks: number[] = [];
  for (let i = 0; i < 300; i++) {
    b1.update(DT);
    b2.update(DT);
    assert.equal(b1.blink, b2.blink, 'seeded blinks reproduce');
    blinks.push(b1.blink);
  }
  assert.ok(blinks.some((v) => v > 0.9), 'blinks happen');
  assert.throws(() => new AvatarTimelinePlayer(defineTimeline([{ behavior: 'nope' }]), machineTarget(m)), /unknown behavior/);
});

test('SVG (Consona): replaying a running clip crossfades instead of rewinding', () => {
  const inst = consonaEngine.create({ seed: 'continuity' });
  const head = inst.scene.find('consona:headGroup')!;
  const y = () => head.channels.get('yOffset') as number;
  void playConsonaClip(inst, 'jump');
  for (let i = 0; i < 30; i++) inst.update({ time: i * DT, deltaTime: DT, frame: i });
  const mid = y();
  assert.ok(Math.abs(mid) > 5, 'mid-jump offset');
  void playConsonaClip(inst, 'jump');
  inst.update({ time: 31 * DT, deltaTime: DT, frame: 31 });
  // the running copy keeps moving and fades out (a rewind would drop the offset to ~0)
  assert.ok(Math.abs(y()) > Math.abs(mid) * 0.5, `no rewind snap (${mid} → ${y()})`);
  for (let i = 0; i < 120; i++) inst.update({ time: (32 + i) * DT, deltaTime: DT, frame: 32 + i });
  assert.ok(Math.abs(y()) < 0.5, 'eases back to rest after the clip');
  consonaEngine.core.destroyInstance(inst.id);
});
