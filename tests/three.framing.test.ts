import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { defineAvatar } from '../src/core/define/defineAvatar.ts';
import { ThreeAvatarController } from '../src/adapters/three/rig/applyState.ts';
import { installDefaultBehaviors } from '../src/core/animation/defaultBehaviors.ts';
import { registerRigProfile } from '../src/adapters/three/rig/assembleRig.ts';

const FAM = 'test-framing';
registerRigProfile(FAM, { atoms: ['body', 'jelly'], pivots: ['tail'] });
installDefaultBehaviors(FAM);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 1, 10);
camera.updateMatrixWorld();

test('framing bounds and user Scale/position survive behaviors (no re-frame on behavior)', () => {
  const c = new ThreeAvatarController(defineAvatar({ id: 'f', family: FAM, body: { shape: 'sphere', color: '#88ccff', scale: 1.4 }, fur: false, position: [0.5, 0.2, -0.3] }));
  let t = 0;
  const step = (n: number) => { for (let i = 0; i < n; i++) c.update({ dt: 1 / 60, time: (t += 1 / 60), camera, pointer: null }); };
  step(30);
  const rest = c.restSphere().clone();
  let lift = 0;
  for (const a of ['jump', 'bounce', 'spin', 'happy']) {
    c.play(a);
    for (let i = 0; i < 40; i++) {
      step(1);
      lift = Math.max(lift, Math.abs(c.rig.root.position.y - 0.2));
      const s = c.restSphere();
      assert.ok(s.center.distanceTo(rest.center) < 1e-9 && Math.abs(s.radius - rest.radius) < 1e-9, `${a}: framing bounds moved`);
      assert.ok(Math.abs(c.rig.squash.scale.y - 1.4) < 1e-6, `${a}: user Scale overridden`);
      assert.equal(c.rig.root.position.x, 0.5);
      assert.equal(c.rig.root.position.z, -0.3);
    }
  }
  assert.ok(lift > 0.01, 'behaviors really moved the root (test is meaningful)');
  step(240);
  assert.ok(Math.abs(c.rig.root.position.y - 0.2) < 1e-3, 'rest y returns to configured position');
  c.dispose();
});
