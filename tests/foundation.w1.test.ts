import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GroupNode } from '../src/core/scenegraph/GroupNode.ts';
import { AtomNode } from '../src/core/scenegraph/AtomNode.ts';
import { SceneGraph } from '../src/core/scenegraph/SceneGraph.ts';
import { ChannelBufferPool } from '../src/core/math/ChannelBufferPool.ts';
import { ChannelBuffer } from '../src/core/channel/ChannelBuffer.ts';
import { defineChannel } from '../src/core/channel/ChannelSchema.ts';
import type { IAtom } from '../src/core/scenegraph/AtomNode.ts';
import { SphericalManifold } from '../src/core/scenegraph/manifolds/SphericalManifold.ts';
import { FlatManifold } from '../src/core/scenegraph/manifolds/FlatManifold.ts';
import { createManifoldFromPlane } from '../src/core/scenegraph/manifolds/createManifold.ts';
import { buildScene, group, atom } from '../src/core/define/sceneBuilder.ts';

const stubAtom = (id: string): IAtom => ({
  id,
  type: 'stub',
  zIndex: 0,
  schema: {},
  renderSvg: () => `<circle id="${id}"/>`,
});

describe('W1 foundation', () => {
  it('A1: child offset is rotated by parent yaw', () => {
    const parent = new GroupNode('p');
    parent.localTransform.rotation[1] = Math.PI / 2; // 90deg yaw
    const child = new AtomNode('c', stubAtom('c'));
    child.localTransform.position[0] = 10;
    parent.add(child);
    parent.updateWorldTransform();

    // Parent Ry(90): local +X maps toward -Z in our matrix convention
    assert.ok(Math.abs(child.worldTransform.position[0]) < 1e-9);
    assert.ok(Math.abs(child.worldTransform.position[2] + 10) < 1e-6);
  });

  it('A1b: parent scale applies to child offsets before rotation', () => {
    const parent = new GroupNode('p');
    parent.localTransform.scale[0] = 2;
    const child = new AtomNode('c', stubAtom('c'));
    child.localTransform.position[0] = 10;
    parent.add(child);
    parent.updateWorldTransform();
    assert.ok(Math.abs(child.worldTransform.position[0] - 20) < 1e-9);
  });

  it('Plane: siblings under a group share one manifold instance', () => {
    const sphere = new SphericalManifold(50, 48, 38.5);
    const headGroup = new GroupNode('headGroup', sphere);
    const eyes = new AtomNode('eyes', stubAtom('eyes'));
    const mark = new AtomNode('mark', stubAtom('mark'));
    const face = new GroupNode('facePlane');
    face.add(eyes);
    face.add(mark);
    headGroup.add(face);

    assert.equal(eyes.getEffectiveManifold(), sphere);
    assert.equal(mark.getEffectiveManifold(), sphere);
    assert.ok(eyes.sharesPlaneWith(mark));
    assert.ok(eyes.sharesPlaneWith(headGroup));
  });

  it('Plane: inheritPlane false opts out of parent curvature', () => {
    const sphere = new SphericalManifold(50, 48, 38.5);
    const headGroup = new GroupNode('headGroup', sphere);
    const badge = new AtomNode('badge', stubAtom('badge'));
    badge.inheritPlane = false;
    badge.projectionManifold = new FlatManifold(50, 20);
    headGroup.add(badge);

    assert.notEqual(badge.getEffectiveManifold(), sphere);
    assert.equal(badge.getEffectiveManifold()?.type, 'flat');
    assert.equal(badge.sharesPlaneWith(headGroup), false);
  });

  it('Plane: scene DSL plane desc builds spherical group for children', () => {
    const scene = new SceneGraph('root');
    const atoms = {
      head: stubAtom('head'),
      eyes: stubAtom('eyes'),
      mark: stubAtom('mark'),
    };
    buildScene(scene, {
      nodePrefix: 't',
      atoms,
      scene: [
        group(
          'headGroup',
          [
            atom('head'),
            group('facePlane', [atom('eyes'), atom('mark')]),
          ],
          { plane: { type: 'spherical', center: [50, 48], radius: 38.5 } }
        ),
      ],
    });

    const eyes = scene.find('t:eyes')!;
    const mark = scene.find('t:mark')!;
    const headGroup = scene.find('t:headGroup')!;
    assert.ok(eyes);
    assert.ok(mark);
    assert.equal(headGroup.getEffectiveManifold()?.type, 'spherical');
    assert.ok(eyes.sharesPlaneWith(mark));
    assert.ok(eyes.sharesPlaneWith(headGroup));
  });

  it('createManifoldFromPlane maps types', () => {
    assert.equal(createManifoldFromPlane({ type: 'flat' }).type, 'flat');
    assert.equal(createManifoldFromPlane({ type: 'spherical', radius: 40 }).type, 'spherical');
    assert.equal(createManifoldFromPlane({ type: 'cylindrical' }).type, 'cylindrical');
  });

  it('A2: hiding a group hides descendants via worldVisible', () => {
    const scene = new SceneGraph('root');
    const group = new GroupNode('g');
    const atom = new AtomNode('a', stubAtom('a'));
    group.add(atom);
    scene.add(group);
    scene.update({ time: 0, deltaTime: 0, frame: 0 });
    assert.equal(atom.worldVisible, true);

    group.visible = false;
    scene.update({ time: 0, deltaTime: 0, frame: 0 });
    assert.equal(atom.worldVisible, false);
    assert.equal(atom.visible, true);
  });

  it('A5: sibling zIndex orders render list without per-call resorted of stale cache', () => {
    const scene = new SceneGraph('root');
    const a = new AtomNode('a', stubAtom('a'));
    const b = new AtomNode('b', stubAtom('b'));
    a.zIndex = 20;
    b.zIndex = 10;
    scene.root.add(a);
    scene.root.add(b);
    const list1 = scene.getRenderList();
    assert.equal(list1[0]!.id, 'b');
    assert.equal(list1[1]!.id, 'a');
    const list2 = scene.getRenderList();
    assert.equal(list1, list2);
  });

  it('A7: ChannelBufferPool reuses buffers without clone spam', () => {
    const schema = {
      x: defineChannel<number>({ name: 'x', type: 'float', defaultValue: 0, blendMode: 'additive' }),
    };
    const pool = new ChannelBufferPool(schema);
    const src = new ChannelBuffer(schema, { x: 3 });
    const a = pool.acquire(src);
    assert.equal(a.get('x'), 3);
    pool.release(a);
    const b = pool.acquire();
    assert.equal(a, b);
  });
});
