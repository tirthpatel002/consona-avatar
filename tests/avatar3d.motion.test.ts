import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_SPRING, ColorSpring, PROP_SPRING, Spring, Tween, colorToRgb, defineAvatar, diffAvatarDefinitions, easeOutSoftBack, mixColorOklab, oklabToRgb, rgbToOklab, stepSpring } from '../src/core/index.ts';
// `fur` is a Three-adapter definition feature (three-free module)
import '../src/core/plugins/fur.schema.ts';

const base = defineAvatar({ id: 'm', body: { shape: 'sphere', color: '#ff0000' }, anchor: { y: 0, width: 1, height: 0.5 }, accessories: [{ type: 'hand', side: 'left' }] });

test('critically damped spring converges without overshoot', () => {
  const s = new Spring(0, { stiffness: 200, damping: 1 }).set(1);
  let max = 0;
  for (let i = 0; i < 120; i++) max = Math.max(max, s.update(1 / 60));
  assert.ok(Math.abs(s.x - 1) < 1e-3);
  assert.ok(max <= 1 + 1e-6, `overshoot ${max}`);
  assert.ok(s.settled);
});

test('underdamped spring wobbles, then settles back', () => {
  const s = new Spring(0, { stiffness: 120, damping: 0.15 }).impulse(3);
  let crossings = 0;
  let prev = 0;
  for (let i = 0; i < 60 * 8; i++) {
    const x = s.update(1 / 60);
    if (Math.sign(x) !== Math.sign(prev) && prev !== 0) crossings++;
    prev = x;
  }
  assert.ok(crossings >= 4, `crossings ${crossings}`);
  assert.ok(Math.abs(s.x) < 1e-3 && Math.abs(s.v) < 1e-2);
});

test('PROP_SPRING gently overshoots then settles (jelly prop feel)', () => {
  const s = new Spring(0, PROP_SPRING).set(1);
  let max = 0;
  for (let i = 0; i < 60 * 4; i++) max = Math.max(max, s.update(1 / 60));
  assert.ok(max > 1.01, `expected soft overshoot, got max=${max}`);
  assert.ok(max < 1.25, `overshoot too wild: ${max}`);
  assert.ok(Math.abs(s.x - 1) < 1e-3 && Math.abs(s.v) < 1e-2);
  assert.ok(s.settled);
});

test('COLOR_SPRING default has mild overshoot and settles', () => {
  const cs = new ColorSpring('#000000', COLOR_SPRING).set('#ffffff');
  let peakL = 0;
  for (let i = 0; i < 60 * 5; i++) {
    const rgb = cs.update(1 / 60);
    peakL = Math.max(peakL, rgbToOklab(rgb)[0]);
  }
  assert.ok(peakL > 0.98, `peakL ${peakL}`);
  assert.ok(cs.settled);
});

test('easeOutSoftBack overshoots past 1 then ends at 1', () => {
  const mid = easeOutSoftBack(0.85);
  assert.ok(mid > 1, `soft-back mid ${mid}`);
  assert.equal(easeOutSoftBack(0), 0);
  assert.ok(Math.abs(easeOutSoftBack(1) - 1) < 1e-9);
});

test('stepSpring is frame-rate independent (sub-stepped)', () => {
  const a = { x: 0, v: 0 };
  const b = { x: 0, v: 0 };
  const p = { stiffness: 150, damping: 0.3 };
  for (let i = 0; i < 30; i++) stepSpring(a, 1, p, 1 / 30);
  for (let i = 0; i < 120; i++) stepSpring(b, 1, p, 1 / 120);
  assert.ok(Math.abs(a.x - b.x) < 0.02, `${a.x} vs ${b.x}`);
});

test('tween eases 0→1 over its duration', () => {
  const t = new Tween(0.2);
  assert.equal(t.value, 0);
  t.update(0.1);
  assert.ok(Math.abs(t.value - 0.5) < 1e-9);
  t.update(1);
  assert.equal(t.value, 1);
  assert.ok(t.done);
});

test('OKLab round-trips and mixes perceptually', () => {
  for (const c of ['#ff0000', '#3a7bd5', '#ffffff', '#000000', '#00ff88']) {
    const rgb = colorToRgb(c);
    const back = oklabToRgb(rgbToOklab(rgb));
    rgb.forEach((v, i) => assert.ok(Math.abs(v - back[i]!) < 1e-4));
  }
  // blue→yellow midpoint stays bright (sRGB lerp would go grey)
  const mid = mixColorOklab('#0000ff', '#ffff00', 0.5);
  assert.ok(rgbToOklab(mid)[0] > 0.6);
  const cs = new ColorSpring('#000000').set('#ffffff');
  for (let i = 0; i < 300; i++) cs.update(1 / 60);
  assert.ok(cs.settled);
});

test('definition diff: everything but a GLB model change is in place', () => {
  const d0 = diffAvatarDefinitions(base, base);
  assert.equal(d0.changed, false);
  const tw = diffAvatarDefinitions(base, defineAvatar({ ...base, body: { ...base.body, color: '#00ff00', scale: 1.2 }, fur: { ...(base.fur as object), length: 0.12 } }));
  assert.deepEqual(Object.keys(tw.tween).sort(), ['bodyColor', 'bodyScale', 'furLength']);
  assert.equal(tw.body, false);
  assert.equal(tw.anchor, false);
  // moving the eye anchor glides the eyes (no structural change)
  const moved = diffAvatarDefinitions(base, defineAvatar({ ...base, anchor: { ...base.anchor, y: 0.1 } }));
  assert.equal(moved.anchor, true);
  assert.equal(moved.body, false);
  // eyes: shape swaps blink through, numbers tween
  assert.equal(diffAvatarDefinitions(base, defineAvatar({ ...base, eyes: { shape: 'heart' } })).eyes, 'shape');
  assert.equal(diffAvatarDefinitions(base, defineAvatar({ ...base, eyes: { size: 0.4 } })).eyes, 'tune');
  assert.equal(diffAvatarDefinitions(base, defineAvatar({ ...base, eyes: { outline: '#112233' } })).eyes, 'tune');
  const acc = diffAvatarDefinitions(base, defineAvatar({ ...base, accessories: [{ type: 'hand', side: 'left', enabled: false }] }));
  assert.equal(acc.accessories, true);
  const shape = diffAvatarDefinitions(base, defineAvatar({ ...base, body: { ...base.body, shape: 'pear' } }));
  assert.equal(shape.body, true);
  assert.equal(shape.rig, false);
  // shell count tweens (layers fade); fur off = 0 shells
  assert.equal(diffAvatarDefinitions(base, defineAvatar({ ...base, fur: { ...(base.fur as object), shells: 12 } })).tween.furShells, 12);
  assert.equal(diffAvatarDefinitions(base, defineAvatar({ ...base, fur: false })).tween.furShells, 0);
  const pat = diffAvatarDefinitions(base, defineAvatar({ ...base, fur: { ...(base.fur as object), pattern: 'rib' } }));
  assert.equal(pat.furPattern, true);
  assert.equal(pat.rig, false);
  const knitOff = diffAvatarDefinitions(base, defineAvatar({ ...base, fur: { ...(base.fur as object), knit: false } }));
  assert.equal(knitOff.tween.furBumpScale, 0);
  assert.equal(diffAvatarDefinitions(base, defineAvatar({ ...base, id: 'other' })).id, true);
  assert.equal(diffAvatarDefinitions(base, defineAvatar({ ...base, model: { url: 'x.glb' } })).rig, true);
  assert.equal(diffAvatarDefinitions(base, defineAvatar({ ...base, jelly: { amount: 2 } })).jelly, true);
  assert.equal(diffAvatarDefinitions(base, defineAvatar({ ...base, preset: 'happy' })).preset, 'happy');
});

test('resolved definitions carry jelly defaults', () => {
  assert.ok(base.jelly && base.jelly.stiffness > 0 && base.jelly.damping > 0);
  assert.equal(defineAvatar({ ...base, jelly: false }).jelly, false);
});
