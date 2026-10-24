import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EyeRig, pupilRadii } from '../src/adapters/three/rig/parts/reliefEyes.ts';
import { DEFAULT_EYES, listEyeShapes } from '../src/core/face/eyes.ts';
import type { AvatarEyesOptions } from '../src/core/face/eyes.ts';
import { composeAvatar, getAvatarControls } from '../src/core/index.ts';
import { registerAllieAtoms } from '../src/avatars/allie/index.ts';
registerAllieAtoms();

const BR = 2.5;
const sampler = (x: number, y: number, p: THREE.Vector3, n: THREE.Vector3) => {
  const q = BR * BR - x * x - y * y;
  if (q <= 0) return false;
  p.set(x, y, Math.sqrt(q));
  n.copy(p).normalize();
  return true;
};

function run(r: EyeRig, opts: AvatarEyesOptions, frames: number, blink = 0, body: [number, number, number] = [0.9, 0.6, 0.3]) {
  r.setShape(opts.shape);
  r.setLayout({ halfSpacing: 0.3, radius: 0.15, y: 0.1 }, opts);
  for (let i = 0; i < frames; i++) r.update({ dt: 1 / 60, preset: 'neutral', blink, resample: i === 0, body, furLength: 0.05 });
}

const maxZ = (m: THREE.Mesh) => {
  const a = (m.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
  let z = -Infinity;
  for (let i = 2; i < a.length; i += 3) z = Math.max(z, a[i]!);
  return z;
};

test('pupil: off by default; fill / edge on every shape sit on the outermost dome surface, opposite colour', () => {
  assert.equal(DEFAULT_EYES.pupil, false);
  assert.equal(DEFAULT_EYES.pupilStyle, 'fill');
  for (const shape of listEyeShapes())
    for (const pupilStyle of ['fill', 'edge'] as const) {
      const r = new EyeRig(sampler);
      run(r, { shape }, 5);
      assert.equal(r.eyes[0].pupil.visible, false, 'hidden when off');
      run(r, { shape, pupil: true, pupilStyle }, 90);
      const e = r.eyes[0];
      assert.ok(e.pupil.visible && e.pupilMaterial.opacity > 0.99, `${shape}/${pupilStyle} shown`);
      // on top of the dome (viewer-facing), not buried in it
      if (pupilStyle === 'fill') assert.ok(maxZ(e.pupil) >= maxZ(e.mesh) - 1e-3, `${shape}/fill caps the dome top`);
      else assert.ok(maxZ(e.pupil) > maxZ(e.mesh) - 0.5 * (maxZ(e.mesh) - e.frame.c.z), `${shape}/edge ring high on the dome`);
      assert.ok(maxZ(e.pupil) < maxZ(e.mesh) + 0.01, `${shape}/${pupilStyle} hugs the dome`);
      // auto eye on a light body is black → pupil white
      const c = e.pupilMaterial.color.clone().convertLinearToSRGB();
      const k = e.material.color.clone().convertLinearToSRGB();
      assert.ok(k.r < 0.1 && c.r > 0.9 && c.g > 0.9 && c.b > 0.9, `${shape}/${pupilStyle} opposite colour`);
    }
});

test('pupil: radii animate in without a pop; edge is a ring, fill a cap', () => {
  assert.equal(pupilRadii(0, 0).inner, 0);
  assert.ok(pupilRadii(0, 0).outer < pupilRadii(1, 0).outer, 'fill scales in');
  const ring = pupilRadii(1, 1);
  assert.ok(ring.inner > 0.4 && ring.outer > ring.inner, 'edge ring');
  assert.ok(pupilRadii(0, 1).outer - pupilRadii(0, 1).inner < 1e-9, 'edge starts at zero width');
  // toggling: opacity rises gradually
  const r = new EyeRig(sampler);
  run(r, { pupil: false }, 5);
  run(r, { pupil: true }, 3);
  const o = r.eyes[0].pupilMaterial.opacity;
  assert.ok(o > 0 && o < 0.9, `fades in (${o})`);
});

test('pupil: the closing lid covers it; colour follows a dark body (white eye → black pupil)', () => {
  const r = new EyeRig(sampler);
  run(r, { pupil: true }, 60, 1);
  assert.ok(maxZ(r.eyes[0].rim) > maxZ(r.eyes[0].pupil), 'lid above the pupil when shut');
  const d = new EyeRig(sampler);
  run(d, { pupil: true }, 120, 0, [0.1, 0.1, 0.3]);
  const c = d.eyes[0].pupilMaterial.color.clone().convertLinearToSRGB();
  assert.ok(c.r < 0.1 && c.g < 0.1 && c.b < 0.1, 'black pupil on a white eye');
});

test('pupil: studio controls registered', () => {
  const def = composeAvatar({ atoms: { body: 'beanie', eyes: 'pill' } });
  const off = getAvatarControls(def).map((c) => c.path);
  assert.ok(off.includes('eyes.pupil') && !off.includes('eyes.pupilStyle'), 'style shown only when on');
  const on = getAvatarControls({ ...def, eyes: { ...def.eyes, pupil: true } }).map((c) => c.path);
  assert.ok(on.includes('eyes.pupilStyle'));
});
