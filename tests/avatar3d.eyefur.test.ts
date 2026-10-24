import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EyeRig } from '../src/adapters/three/rig/parts/reliefEyes.ts';
import { EYE_CLEAR_MAX, createFurEyeMask, furEyeClearing, furEyeDistance } from '../src/adapters/three/rig/parts/furEyeMask.ts';
import { listEyePoses, listEyeShapes } from '../src/core/face/eyes.ts';

// large, gently curved sphere body (flat-ish front, like a chubby character): the old
// clamp-to-edge clearing extruded the eye's border texels into strips across it
const BR = 2.5;
const sampler = (x: number, y: number, p: THREE.Vector3, n: THREE.Vector3) => {
  const q = BR * BR - x * x - y * y;
  if (q <= 0) return false;
  p.set(x, y, Math.sqrt(q));
  n.copy(p).normalize();
  return true;
};

const R = 0.15;
const FUR = 0.13; // long fur: widest clearing edge on the outer shells

function rig(shape: string, preset: string, blink = 0) {
  const mask = createFurEyeMask();
  const r = new EyeRig(sampler, furEyeClearing(mask));
  r.setShape(shape);
  r.setLayout({ halfSpacing: 0.3, radius: R, y: 0.1 }, { shape }, true);
  for (let i = 0; i < 60; i++) r.update({ dt: 1 / 60, preset, blink, resample: i === 0, body: [0.8, 0.5, 0.3], furLength: FUR });
  return { r, mask };
}

test('fur is cleared only inside the eye footprint: no strips across the body (all shapes, presets, shell heights)', () => {
  const presets = ['neutral', ...listEyePoses()].filter((m, i, a) => a.indexOf(m) === i);
  for (const shape of listEyeShapes())
    for (const preset of presets) {
      const { mask } = rig(shape, preset);
      const M = mask.uEyeM.value;
      const centres = mask.uEyeC.value.map((c) => c.clone());
      // each eye still clears its own footprint (somewhere within the eye)
      for (const c of centres) {
        let cleared = false;
        for (let u = -1.5; u <= 1.5 && !cleared; u += 0.1)
          for (let v = -1.5; v <= 1.5 && !cleared; v += 0.1) {
            const q = new THREE.Vector3(c.x + u * R, c.y + v * R, 0);
            q.z = Math.sqrt(Math.max(0, BR * BR - q.x * q.x - q.y * q.y));
            cleared = furEyeDistance(mask, q) < M.y;
          }
        assert.ok(cleared, `${shape}/${preset}: eye footprint must be cleared`);
      }
      let bad = 0, n = 0;
      const p = new THREE.Vector3();
      // whole sphere: front, sides, top, bottom, back
      for (let i = 0; i < 8000; i++) {
        const z = 1 - (2 * (i + 0.5)) / 8000, rr = Math.sqrt(1 - z * z), a = i * 2.399963;
        p.set(rr * Math.cos(a), rr * Math.sin(a), z).multiplyScalar(BR);
        if (Math.min(...centres.map((c) => c.distanceTo(p))) < 5 * R) continue;
        n++;
        for (const h of [0, 0.25, 0.5, 1]) {
          const edge = Math.min(M.y + M.z * h, EYE_CLEAR_MAX);
          if (furEyeDistance(mask, p) <= edge + 0.03) { bad++; break; }
        }
      }
      assert.ok(n > 7000);
      assert.equal(bad, 0, `${shape}/${preset}: ${bad} fur points cleared away from the eyes`);
    }
});

test('blink closes the outline as a 3D lid over the eyeball dome (all shapes)', () => {
  for (const shape of listEyeShapes()) {
    const top = (g: THREE.BufferGeometry, rad: number, c: THREE.Vector3) => {
      const a = g.attributes.position!.array as Float32Array;
      let m = -Infinity;
      for (let i = 0; i < a.length; i += 3) if (Math.hypot(a[i]! - c.x, a[i + 1]! - c.y) < rad) m = Math.max(m, a[i + 2]!);
      return m;
    };
    const open = rig(shape, 'neutral', 0);
    const shut = rig(shape, 'neutral', 1);
    for (let k = 0; k < 2; k++) {
      const c = shut.mask.uEyeC.value[k]!;
      const eyeO = open.r.eyes[k]!, eyeS = shut.r.eyes[k]!;
      // the eyeball itself is not squashed by the blink
      assert.ok(Math.abs(top(eyeO.mesh.geometry, R * 0.3, c) - top(eyeS.mesh.geometry, R * 0.3, c)) < 1e-6, `${shape}: eyeball unchanged`);
      // open: no lid over the centre; shut: the lid sits above the dome there
      assert.equal(top(eyeO.rim.geometry, R * 0.3, c), -Infinity, `${shape}: open lid clear of centre`);
      assert.ok(top(eyeS.rim.geometry, R * 0.3, c) > top(eyeS.mesh.geometry, R * 0.3, c), `${shape}: shut lid covers dome`);
    }
  }
});
