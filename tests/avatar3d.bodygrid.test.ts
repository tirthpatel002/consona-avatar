import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { allieCharacterSpecs, registerAllieSurfaces } from '../src/avatars/allie/three/index.ts';
import { createBodyGeometry, createBodyTarget } from '../src/adapters/three/rig/parts/body.ts';
import { BODY_GRID, bodyGridCount, morphBody, createBodyGridGeometry } from '../src/adapters/three/rig/parts/bodyGrid.ts';

registerAllieSurfaces();

const box = (pos: ArrayLike<number>) => {
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 3) b.expandByPoint(v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!));
  return b;
};

test('every character body lands on the shared morph grid and keeps its shape', () => {
  for (const spec of allieCharacterSpecs) {
    const t = createBodyTarget(spec.body);
    assert.equal(t.position.length, bodyGridCount() * 3, spec.id);
    const old = box((createBodyGeometry(spec.body).attributes.position as THREE.BufferAttribute).array);
    const now = box(t.position);
    // same overall extents as the original builder (sampling differs, silhouette does not)
    for (const k of ['min', 'max'] as const)
      for (const a of ['x', 'y', 'z'] as const) assert.ok(Math.abs(old[k][a] - now[k][a]) < 0.06, `${spec.id} ${k}.${a}: ${old[k][a].toFixed(3)} vs ${now[k][a].toFixed(3)}`);
    // normals point outward (winding normalised for the shared index)
    const c = now.getCenter(new THREE.Vector3());
    let out = 0;
    for (let i = 0; i < t.normal.length; i += 3) {
      const d = (t.position[i]! - c.x) * t.normal[i]! + (t.position[i + 1]! - c.y) * t.normal[i + 1]! + (t.position[i + 2]! - c.z) * t.normal[i + 2]!;
      if (d > 0) out++;
    }
    assert.ok(out / (t.normal.length / 3) > 0.7, `${spec.id} outward normals ${(out / (t.normal.length / 3)).toFixed(2)}`);
  }
});

test('morphing rewrites the same geometry in place', () => {
  const [a, b] = [allieCharacterSpecs[0]!, allieCharacterSpecs[1]!];
  const ta = createBodyTarget(a.body);
  const tb = createBodyTarget(b.body);
  const g = createBodyGridGeometry(ta);
  const pos = g.attributes.position;
  morphBody(g, ta, tb, 0.5);
  assert.equal(g.attributes.position, pos);
  morphBody(g, ta, tb, 1);
  const now = (g.attributes.position as THREE.BufferAttribute).array as Float32Array;
  for (let i = 0; i < now.length; i += 97) assert.ok(Math.abs(now[i]! - tb.position[i]!) < 1e-5);
  assert.equal(BODY_GRID.W > 0, true);
});
