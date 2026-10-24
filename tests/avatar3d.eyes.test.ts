import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ANCHOR,
  DEFAULT_EYES,
  DEFAULT_EYE_SHAPES,
  NEUTRAL_EYE,
  applyEyeShapeTransform,
  composeEyePose,
  composeAvatar,
  defineAvatar,
  diffAvatarDefinitions,
  easeEyePose,
  eyeLayout,
  eyePoseForPreset,
  eyeReliefProfile,
  eyeShapeTransform,
  getEyeShape,
  invertEyeShapeTransform,
  listEyePoses,
  listEyeShapes,
  registerEyePose,
  resolveEyePose,
} from '../src/core/index.ts';
import { ALLIE_EYES, ALLIE_FAMILY, allieCharacterSpecs, registerAllieAtoms } from '../src/avatars/allie/index.ts';

registerAllieAtoms();

test('five soft eye shapes: normalised SDFs, star-shaped outlines, rounded relief', () => {
  assert.deepEqual([...DEFAULT_EYE_SHAPES].sort(), ['cube', 'heart', 'pill', 'sphere', 'star']);
  for (const s of DEFAULT_EYE_SHAPES) {
    assert.ok(listEyeShapes().includes(s), s);
    const e = getEyeShape(s);
    assert.ok(Math.abs(Math.max(e.extent.x, e.extent.y) - 1) < 0.02, `${s} normalised`);
    assert.ok(e.sdf(0, 0) < -0.3, `${s} solid centre`);
    assert.ok(e.sdf(1.6, 1.6) > 0, `${s} outside`);
    // every ray from the centre crosses the outline once (the radial relief mesh relies on it)
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      let inside = true, flips = 0;
      for (let r = 0.01; r < 1.8; r += 0.01) {
        const now = e.sdf(Math.cos(a) * r, Math.sin(a) * r) < 0;
        if (now !== inside) { flips++; inside = now; }
      }
      assert.equal(flips, 1, `${s} star-shaped at ${a.toFixed(2)}`);
    }
    assert.ok(e.bevel > 0.2, `${s}: soft bevel`);
  }
  // rounded profile: 0 at the edge, smooth (steep but finite) rise, flat top
  assert.equal(eyeReliefProfile(0, 0.4), 0);
  assert.equal(eyeReliefProfile(0.4, 0.4), 1);
  assert.ok(eyeReliefProfile(0.1, 0.4) > 0.6 && eyeReliefProfile(0.1, 0.4) < 0.7);
  assert.equal(eyeReliefProfile(1, 0.4), 1);
});

test('presets re-shape the eye only (no offset); every preset is valid on every shape', () => {
  const presets = listEyePoses();
  for (const m of ['neutral', 'happy', 'joyful', 'content', 'curious', 'calm', 'sleepy', 'surprised', 'excited', 'sparkle', 'wink', 'playful', 'determined', 'sad', 'angry', 'love', 'look']) {
    assert.ok(presets.includes(m), m);
  }
  assert.deepEqual(Object.keys(NEUTRAL_EYE).sort(), ['arc', 'lower', 'rot', 'scale', 'sx', 'sy', 'tilt', 'upper']);
  const happy = eyePoseForPreset('happy').left;
  assert.ok(happy.lower > 0.3 && happy.arc > 0.3, 'happy: arc squint from below');
  assert.ok(eyePoseForPreset('sleepy').left.upper > 0.4, 'sleepy: heavy upper lid');
  const wink = eyePoseForPreset('wink');
  assert.ok(wink.right.upper + wink.right.lower > 0.9 && wink.left.upper + wink.left.lower < 0.2, 'wink closes one eye');
  assert.ok(eyePoseForPreset('surprised').left.scale > 1.1, 'surprised: bigger eyes');
  assert.ok(eyePoseForPreset('sad').left.tilt > 0 && eyePoseForPreset('angry').left.tilt < 0, 'sad / angry lid tilt');
  assert.deepEqual(eyePoseForPreset('no-such-preset').left, { ...NEUTRAL_EYE });
  // every preset × shape: the posed outline stays finite, inside the eye area, and the inverse round-trips
  for (const s of DEFAULT_EYE_SHAPES) {
    const ext = getEyeShape(s).extent;
    for (const m of presets) for (const sgn of [1, -1]) {
      const T = eyeShapeTransform(eyePoseForPreset(m)[sgn > 0 ? 'left' : 'right'], sgn, ext);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const p = applyEyeShapeTransform(T, Math.cos(a) * 0.7 * ext.x, Math.sin(a) * 0.7 * ext.y);
        assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.hypot(p[0], p[1]) < 1.8, `${s}/${m}`);
        const q = invertEyeShapeTransform(T, p[0], p[1]);
        assert.ok(Math.abs(q[0] - Math.cos(a) * 0.7 * ext.x) < 1e-6 && Math.abs(q[1] - Math.sin(a) * 0.7 * ext.y) < 1e-6, `${s}/${m} inverse`);
      }
      assert.ok(T.zf > 0.15 && T.zf <= 1, 'relief flattens as the eye closes, never vanishes');
    }
  }
});

test('blink squashes any pose shut; resting lid only closes further', () => {
  for (const m of listEyePoses()) {
    const shut = resolveEyePose(m, { blink: 1 }).left;
    assert.ok(shut.upper + shut.lower >= 1 - 1e-9, `${m}: fully closed at blink 1`);
  }
  assert.ok(resolveEyePose('happy', { blink: 1 }).left.lower > resolveEyePose('happy', { blink: 1 }).left.upper, 'happy closes upward');
  const lid = composeEyePose(eyePoseForPreset('sleepy').left, { lid: 0.5 });
  assert.ok(lid.upper > eyePoseForPreset('sleepy').left.upper);
  const T = eyeShapeTransform(resolveEyePose('neutral', { blink: 1 }).left, 1, { x: 0.57, y: 1 });
  const top = applyEyeShapeTransform(T, 0, 1), bottom = applyEyeShapeTransform(T, 0, -1);
  assert.ok(Math.abs(top[1] - bottom[1]) < 0.1, 'blink squashes the eye to a line');
  registerEyePose('custom', { left: { rot: 0.3 }, right: { rot: -0.3 } });
  assert.equal(eyePoseForPreset('custom').left.rot, 0.3);
});

test('preset transitions tween smoothly', () => {
  const cur = { ...eyePoseForPreset('neutral').left };
  const target = eyePoseForPreset('sleepy').left;
  let prev = cur.upper;
  for (let i = 0; i < 60; i++) {
    easeEyePose(cur, target, 1 / 60);
    assert.ok(cur.upper >= prev - 1e-12 && cur.upper - prev < 0.2, 'monotone, no jumps');
    prev = cur.upper;
  }
  assert.ok(Math.abs(cur.upper - target.upper) < 0.01);
});

test('eye layout: prominent eyes that fit every body anchor, outlines never touch', () => {
  // Allie owns its eye look (core DEFAULT_EYES is neutral)
  assert.ok(ALLIE_EYES.size >= 0.4 && ALLIE_EYES.depth >= 0.7, 'larger, deeper relief for Allie');
  assert.equal(ALLIE_EYES.outline, 'auto');
  assert.ok(ALLIE_EYES.outlineWidth >= 0.15, 'thick outline');
  for (const c of allieCharacterSpecs)
    for (const s of DEFAULT_EYE_SHAPES) {
      const o = { ...ALLIE_EYES, shape: s };
      const l = eyeLayout(c.anchor, o);
      const ex = getEyeShape(s).extent.x;
      assert.ok(l.radius > 0 && l.radius < c.anchor.height, `${c.id}/${s}`);
      assert.ok(l.halfSpacing > l.radius * (ex + o.outlineWidth), `${c.id}/${s}: outlines apart`);
      assert.ok(l.halfSpacing + l.radius * ex < c.anchor.width * 0.95, `${c.id}/${s}: eyes stay in the eye area`);
    }
});

test('no face model: { body, eyes, preset }; eye edits are in-place diffs', () => {
  const a = composeAvatar({ atoms: { body: 'beanie', eyes: 'pill', preset: 'happy' } });
  const b = composeAvatar({ atoms: { body: 'beanie', eyes: 'heart', preset: 'love' } });
  const d = diffAvatarDefinitions(a, b);
  assert.equal(d.eyes, 'shape');
  assert.equal(d.preset, 'love');
  assert.equal(d.rig, false);
  assert.ok(!('face' in d), 'no face diff');
  // character switch keeps one rig: the body morphs, the eyes glide to the new anchor
  const c = composeAvatar({ atoms: { body: 'heart', eyes: 'pill', preset: 'happy' } });
  const e = diffAvatarDefinitions(a, c);
  assert.equal(e.rig, false);
  assert.equal(e.body, true);
  assert.equal(e.anchor, true);
  const plain = defineAvatar({ id: 'p', body: { shape: 'sphere', color: 0 } });
  assert.deepEqual(plain.anchor, DEFAULT_ANCHOR);
  assert.equal(plain.eyes.shape, DEFAULT_EYES.shape, 'neutral core default');
  assert.deepEqual(defineAvatar({ id: 'a', family: ALLIE_FAMILY, body: { shape: 'sphere', color: 0 } }).eyes, ALLIE_EYES, 'family default');
  assert.ok(!('face' in plain));
});
