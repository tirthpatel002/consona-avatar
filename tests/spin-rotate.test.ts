import { createConsonaAvatarHandle } from '../src/avatars/consona/sdk/consonaHandle.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  resolveNormalizedSpinAxis,
  evaluate3DSpinPose,
  createSpinAnimation,
  createRotateAnimation,
  consonaSpinAnimation,
  consonaRotateAnimation,
} from '../src/avatars/consona/animations/spin.consona.animation.ts';
import { consonaAvatar } from '../src/avatars/consona/consona.avatar.ts';
import { avatarEngine } from '../src/core/engine/AvatarEngine.ts';
import { consonaEngine } from '../src/avatars/consona/sdk/ConsonaEngine.ts';

describe('Multi-Axis 3D Spin & Infinite Rotate Kinematics', () => {
  it('correctly resolves and normalizes standard, 45-degree, and arbitrary 3D axes', () => {
    // Standard Axes
    const yAxis = resolveNormalizedSpinAxis('y');
    assert.strictEqual(yAxis.ux, 0);
    assert.strictEqual(yAxis.uy, 1);
    assert.strictEqual(yAxis.uz, 0);

    const xAxis = resolveNormalizedSpinAxis('x');
    assert.strictEqual(xAxis.ux, 1);
    assert.strictEqual(xAxis.uy, 0);
    assert.strictEqual(xAxis.uz, 0);

    const zAxis = resolveNormalizedSpinAxis('z');
    assert.strictEqual(zAxis.ux, 0);
    assert.strictEqual(zAxis.uy, 0);
    assert.strictEqual(zAxis.uz, 1);

    // 45-degree combinations
    const xyAxis = resolveNormalizedSpinAxis('xy');
    assert(Math.abs(xyAxis.ux - 1 / Math.SQRT2) < 1e-5);
    assert(Math.abs(xyAxis.uy - 1 / Math.SQRT2) < 1e-5);
    assert.strictEqual(xyAxis.uz, 0);

    const xyzAxis = resolveNormalizedSpinAxis('xyz');
    assert(Math.abs(xyzAxis.ux - 1 / Math.sqrt(3)) < 1e-5);
    assert(Math.abs(xyzAxis.uy - 1 / Math.sqrt(3)) < 1e-5);
    assert(Math.abs(xyzAxis.uz - 1 / Math.sqrt(3)) < 1e-5);

    // Arbitrary 3D Vector [3, 4, 0] -> length 5
    const customVec = resolveNormalizedSpinAxis([3, 4, 0]);
    assert(Math.abs(customVec.ux - 0.6) < 1e-5);
    assert(Math.abs(customVec.uy - 0.8) < 1e-5);
    assert.strictEqual(customVec.uz, 0);

    // Arbitrary 3D Vector Object { x: 0, y: 1, z: 1 }
    const customObj = resolveNormalizedSpinAxis({ x: 0, y: 1, z: 1 });
    assert.strictEqual(customObj.ux, 0);
    assert(Math.abs(customObj.uy - 1 / Math.SQRT2) < 1e-5);
    assert(Math.abs(customObj.uz - 1 / Math.SQRT2) < 1e-5);
  });

  it('evaluates one-shot spin behavior with smooth quintic easing and 360-degree completion', () => {
    const spinAnim = createSpinAnimation({ axis: 'y', duration: 1.0 });
    assert.strictEqual(spinAnim.name, 'spin');
    assert.strictEqual(spinAnim.duration, 1.0);
    assert.strictEqual(spinAnim.loop, false);

    // At t = 0: rotation = 0
    const poseStart = spinAnim.evaluate!(0, 0.016);
    assert(Math.abs(poseStart!['consona:headGroup']!.rotateY) < 1e-5);

    // At t = 0.5 (midpoint): rotation = PI
    const poseMid = spinAnim.evaluate!(0.5, 0.016);
    assert(Math.abs(poseMid!['consona:headGroup']!.rotateY - Math.PI) < 1e-3);
    assert(poseMid!['consona:eyes']!.pupilScale > 0.48); // Centrifugal pupil dilation active

    // At t = 1.0 (end): rotation = 2*PI (full 360 deg)
    const poseEnd = spinAnim.evaluate!(1.0, 0.016);
    assert(Math.abs(poseEnd!['consona:headGroup']!.rotateY - Math.PI * 2) < 1e-3);
  });

  it('evaluates continuous infinite rotate animation with periodic smooth cycling', () => {
    const rotateAnim = createRotateAnimation({ axis: 'xy', duration: 2.0 });
    assert.strictEqual(rotateAnim.name, 'rotate');
    assert.strictEqual(rotateAnim.duration, 2.0);
    assert.strictEqual(rotateAnim.loop, true);

    const pose0 = rotateAnim.evaluate!(0, 0.016);
    assert(Math.abs(pose0!['consona:headGroup']!.rotateX) < 1e-5);
    assert(Math.abs(pose0!['consona:headGroup']!.rotateY) < 1e-5);

    // At t = 1.0 (midway through cycle): angle = PI
    const poseMid = rotateAnim.evaluate!(1.0, 0.016);
    const expectedAngle = Math.PI;
    assert(Math.abs(poseMid!['consona:headGroup']!.rotateX - (1 / Math.SQRT2) * expectedAngle) < 1e-3);
    assert(Math.abs(poseMid!['consona:headGroup']!.rotateY - (1 / Math.SQRT2) * expectedAngle) < 1e-3);

    // At t = 2.0 (full cycle wrap): angle seamlessly wraps
    const poseFull = rotateAnim.evaluate!(2.0, 0.016);
    assert(Math.abs(poseFull!['consona:headGroup']!.rotateX) < 1e-5);
    assert(Math.abs(poseFull!['consona:headGroup']!.rotateY) < 1e-5);
  });

  it('dispatches multi-axis spin and rotate via ConsonaEngine SDK without errors', async () => {
    const avatar = consonaEngine.create({
      seed: 'test-spin-avatar',
      paletteId: 'light',
    });

    assert(avatar);
    const handle = createConsonaAvatarHandle(consonaEngine, avatar.id);
    // one-shot 3D spin through the unified handle (axis + speed are behavior params)
    const ended = new Promise<void>((resolve) => handle.subscribe((e) => e.type === 'end' && e.behavior === 'spin' && resolve()));
    assert(handle.play('spin', { params: { axis: 'xyz', speed: 10.0 } }));
    await ended;

    // continuous rotate: a looping behavior
    assert(handle.play('rotate'));
    avatar.update({ time: 0.5, deltaTime: 0.016, frame: 30 });
    avatar.update({ time: 0.516, deltaTime: 0.016, frame: 31 });

    const headGroup = avatar.scene.find('consona:headGroup');
    assert(headGroup);
    assert(headGroup!.localTransform.rotation[1] > 0); // Active continuous rotation

    avatarEngine.destroyInstance(avatar.id);
  });

  it('a looping clip (rotate) runs until another behavior or idle replaces it, then stops', async () => {
    const avatar = consonaEngine.create({ seed: 'rotate-stop', paletteId: 'light' });
    const handle = createConsonaAvatarHandle(consonaEngine, avatar.id);
    let t = 0, frame = 0;
    const step = (s: number) => {
      for (let i = 0; i < s * 60; i++) avatar.update({ time: (t += 1 / 60), deltaTime: 1 / 60, frame: frame++ });
    };
    assert(handle.play('rotate', { params: { speed: 10 } }));
    step(0.3);
    await new Promise((r) => setTimeout(r, 400)); // past one cycle (0.24 s)
    step(0.1);
    assert.strictEqual(handle.state.behavior, 'rotate', 'a loop is not "finished" after one cycle');
    assert(avatar.mixer.isPlaying('rotate'));
    assert(handle.play('nod'));
    step(1);
    assert.strictEqual(avatar.mixer.isPlaying('rotate'), false, 'replaced by another behavior: the loop stops');
    assert(handle.play('rotate', { params: { speed: 10 } }));
    step(0.3);
    assert(avatar.mixer.isPlaying('rotate'));
    assert(handle.play('idle'));
    step(1);
    assert.strictEqual(avatar.mixer.isPlaying('rotate'), false, 'idle stops the loop');
    avatarEngine.destroyInstance(avatar.id);
  });
});
