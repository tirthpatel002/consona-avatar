import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AvatarInstance } from '../src/core/engine/AvatarInstance.ts';
import { getRendererFactory, registerRendererFactory } from '../src/core/renderers/IRenderer.ts';
import type { BodyAvatarRenderer } from '../src/core/renderers/IRenderer.ts';
import type { AvatarDescriptor } from '../src/core/types/AvatarDescriptor.ts';
import type { RenderContext } from '../src/core/types/RenderContext.ts';
import { defineAvatar } from '../src/core/define/defineAvatar.ts';
import { AvatarStage } from '../src/adapters/three/stage/Stage.ts';
import { ThreeAvatarController } from '../src/adapters/three/rig/applyState.ts';
import { registerRigProfile } from '../src/adapters/three/rig/assembleRig.ts';

// A fur-free, eye-free body family (headless-safe: no canvas textures, no WebGL).
const PLAIN = 'test-plain';
registerRigProfile(PLAIN, { atoms: ['body', 'jelly'], pivots: ['tail'] });
const plainDef = (id = 'plain', shape = 'sphere') => defineAvatar({ id, family: PLAIN, body: { shape, color: '#88ccff' }, fur: false });
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 1, 10);
camera.updateMatrixWorld();

test('fur-free family: rig builds without furShells / reliefEyes and updates', () => {
  const c = new ThreeAvatarController(plainDef());
  assert.equal(c.rig.layers, undefined, 'no fur layers');
  assert.equal(c.rig.eyes, undefined, 'no eyes');
  assert.ok(c.rig.bodyMesh.isMesh && c.rig.bodyMesh.parent === c.rig.procedural, 'plain body mesh');
  assert.ok(c.rig.pivots.tail?.parent === c.rig.body, 'family pivot');
  assert.ok(c.rig.jelly, 'jelly part ran');
  c.lookAt({ x: 2, y: 1, z: 5 });
  let t = 0;
  for (let i = 0; i < 30; i++) c.update({ dt: 1 / 60, time: (t += 1 / 60), camera, pointer: null });
  assert.ok(c.gazeState, 'gaze solved without eyes');
  // in-place morph to another shape on the same rig
  const geo = c.rig.bodyGeometry;
  c.setDefinition(defineAvatar({ id: 'plain', family: PLAIN, body: { shape: 'sphere', color: '#ff8800', scale: 1.2 }, fur: false }));
  for (let i = 0; i < 60; i++) c.update({ dt: 1 / 60, time: (t += 1 / 60), camera, pointer: new THREE.Vector2(0.2, 0.1) });
  assert.equal(c.rig.bodyGeometry, geo, 'same geometry');
  const col = (c.rig.bodyMesh.material as THREE.MeshStandardMaterial).color.getHexString();
  assert.notEqual(col, new THREE.Color('#88ccff').getHexString(), 'colour tweened on the plain mesh');
  c.dispose();
});

test('webgl renderer factory: the Three stage is registered as a body-avatar IRenderer', () => {
  assert.ok(getRendererFactory('webgl'), 'Stage.ts registers webgl');
  for (const m of ['initialize', 'render', 'dispose', 'frame']) assert.equal(typeof (AvatarStage.prototype as any)[m], 'function', m);
});

test('webgl renderer factory: AvatarInstance drives a Three avatar (headless stand-in stage)', () => {
  const real = getRendererFactory('webgl')!;
  const calls: string[] = [];
  let ctrl: ThreeAvatarController | null = null;
  // same contract as AvatarStage (initialize adds descriptor.bodyAvatar, render advances one frame) minus the WebGL context
  registerRendererFactory('webgl', (): BodyAvatarRenderer => ({
    type: 'webgl',
    rendererKind: 'body-avatar',
    initialize(_container, descriptor) {
      calls.push('init');
      ctrl = new ThreeAvatarController(descriptor.bodyAvatar!);
    },
    render(_scene: unknown, ctx: RenderContext) {
      calls.push('render');
      ctrl!.update({ dt: ctx.deltaTime, time: ctx.time, camera, pointer: null });
    },
    dispose() {
      calls.push('dispose');
      ctrl?.dispose();
    },
  }));
  try {
    const descriptor: AvatarDescriptor = {
      id: 'three-body',
      canvas: { width: 64, height: 64 } as AvatarDescriptor['canvas'],
      defaultPaletteId: 'default',
      setup() {},
      bodyAvatar: plainDef('driven'),
    };
    const inst = new AvatarInstance('i1', descriptor, { renderer: 'webgl' }, null);
    assert.equal(inst.renderer.type, 'webgl');
    for (let f = 1; f <= 10; f++) {
      inst.update({ time: f / 60, deltaTime: 1 / 60, frame: f });
      inst.render();
    }
    const driven = ctrl as ThreeAvatarController | null;
    assert.ok(driven, 'controller created from descriptor.bodyAvatar');
    assert.equal(driven.id, 'driven');
    assert.ok(driven.gazeState, 'frames reached the runtime');
    inst.dispose();
    assert.deepEqual([calls[0], calls.at(-1), calls.filter((c) => c === 'render').length], ['init', 'dispose', 10]);
  } finally {
    registerRendererFactory('webgl', real);
  }
});
