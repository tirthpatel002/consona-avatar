import { test } from 'node:test';
import assert from 'node:assert';
import { AvatarStateMachine } from '../src/core/animation/state-machine/AvatarStateMachine.ts';
import { listAvatarBehaviors } from '../src/core/controls/controls.ts';
import { defaultWinkBehavior, defaultExtraBehaviors, WINK_TIMING } from '../src/core/animation/defaultBehaviors.ts';
import { allieBehaviors, registerAllieKit } from '../src/avatars/allie/index.ts';
import { eyePoseForPreset, installDefaultEyePoses, overlayEyePose } from '../src/core/face/eyes.ts';
import type { AvatarRig, Vec3Like } from '../src/core/types/AvatarDefinition.ts';

const vec = (x = 0, y = 0, z = 0): Vec3Like => ({
  x, y, z,
  set(a: number, b: number, c: number) { this.x = a; this.y = b; this.z = c; return this; },
});
const tf = () => ({ position: vec(), rotation: vec(), scale: vec(1, 1, 1) });
const makeRig = (): AvatarRig => ({ root: tf(), body: tf(), head: tf(), hand: tf(), baseY: -1.7, handRest: 0.35, phase: 0 });
const dt = 1 / 120;
const step = (m: AvatarStateMachine, s: number) => { for (let t = 0; t < s - 1e-9; t += dt) m.update({ deltaTime: dt }); };

test('wink: overlays the wink preset eye (relative), shows wobbly, tilts, then returns to rest', () => {
  const rig = makeRig();
  const m = new AvatarStateMachine({ rig, behaviors: [...allieBehaviors, ...defaultExtraBehaviors], useRegistry: false });
  m.play('wink');
  step(m, WINK_TIMING.in + WINK_TIMING.hold * 0.5);
  assert.deepStrictEqual(m.face.eyeOverlay, { pose: 'wink', weight: 1, mirror: false });
  assert.strictEqual(m.face.mouth, 'wobbly');
  assert.ok(rig.head.rotation.z < -0.01, 'head tilts toward the +X (right) eye');
  step(m, WINK_TIMING.duration);
  assert.strictEqual(m.behavior, 'idle');
  assert.strictEqual(m.face.eyeOverlay, null);
  assert.strictEqual(m.face.mouth, null);
});

test('wink: overlayEyePose adds the wink eye relatively (mirrored for left), keeps the other eye', () => {
  installDefaultEyePoses();
  const wink = eyePoseForPreset('wink');
  const base = eyePoseForPreset('happy');
  const out = overlayEyePose(eyePoseForPreset('happy'), { pose: 'wink', weight: 1, mirror: true });
  assert.deepStrictEqual(out.right, base.right);
  assert.ok(Math.abs(out.left.upper - (base.left.upper + wink.right.upper)) < 1e-9);
  assert.ok(Math.abs(out.left.arc - (base.left.arc + wink.right.arc)) < 1e-9);
  const half = overlayEyePose(eyePoseForPreset('neutral'), { pose: 'wink', weight: 0.5 });
  assert.ok(Math.abs(half.right.lower - wink.right.lower * 0.5) < 1e-9);
});

test('wink: left side + no mouth param', () => {
  const m = new AvatarStateMachine({ rig: makeRig(), behaviors: [...allieBehaviors, defaultWinkBehavior], useRegistry: false });
  m.play('wink', { params: { side: 'left', mouth: 'none' } });
  step(m, 0.3);
  assert.strictEqual(m.face.eyeOverlay?.mirror, true);
  assert.strictEqual(m.face.mouth, null);
  m.play('jump');
  m.update({ deltaTime: dt });
  assert.strictEqual(m.face.eyeOverlay, null, 'interrupting hands the eye back (the rig eases it)');
});

test('wink: listed for the 3D families', () => {
  registerAllieKit();
  for (const family of ['allie']) assert.ok(listAvatarBehaviors({ family }).includes('wink'), family);
});
