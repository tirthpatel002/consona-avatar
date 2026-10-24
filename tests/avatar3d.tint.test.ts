import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorToRgb, composeAvatar, contrastBorder, contrastEyeColor, contrastRatio, darkness, perceivedLightness, DEFAULT_EYES, diffAvatarDefinitions, defineAvatar, isTintable, rgbToHsl, tintColor } from '../src/core/index.ts';
import { allieCharacterSpecs, registerAllieAtoms } from '../src/avatars/allie/index.ts';

registerAllieAtoms();
const near = (a: number[], b: number[], eps = 1e-6) => a.every((x, i) => Math.abs(x - b[i]!) < eps);
const hue = (c: [number, number, number]) => rgbToHsl(c)[0];

test('tint: identity at the reference colour, follows hue/shade on change', () => {
  const ref = '#F5672B';
  const pom = '#FF6E1F';
  assert.ok(near(tintColor(pom, ref, ref), colorToRgb(pom)), 'preset unchanged at its default colour');
  const blue = tintColor(pom, ref, '#2B6BF5');
  const h = hue(blue) * 360;
  assert.ok(h > 200 && h < 240, `pom-pom turns blue with the body (hue ${h})`);
  // relative lightness offset kept: lighter-than-body part stays lighter
  const fluffRef = '#F9806F', fluff = '#FFAE85';
  const t = tintColor(fluff, fluffRef, '#2E8B57');
  assert.ok(rgbToHsl(t)[2] > rgbToHsl(colorToRgb('#2E8B57'))[2], 'tuft stays a lighter tint of the body');
});

test('tint: neutrals stay fixed; eyes only tint coloured parts', () => {
  assert.ok(!isTintable(colorToRgb('#111216')) && !isTintable(colorToRgb('#ffffff')));
  assert.ok(near(tintColor('#111216', '#F5672B', '#2B6BF5', 'eye'), colorToRgb('#111216')), 'black bead stays black');
  assert.ok(near(tintColor('#f5efe3', '#F5672B', '#2B6BF5', 'eye'), colorToRgb('#f5efe3')), 'felt cream stays');
  const iris = tintColor('#f5a623', '#F5672B', '#2B6BF5', 'eye');
  assert.ok(!near(iris, colorToRgb('#f5a623'), 0.05), 'amber iris follows the body');
  const ink = tintColor('#FF8FCB', '#EE86BB', '#36A862', 'eye');
  assert.ok(hue(ink) * 360 > 90 && hue(ink) * 360 < 180, 'coloured eye colours follow (pink → green)');
});

test('every character accessory colour follows the body colour and is unchanged at default', () => {
  let checked = 0;
  for (const c of allieCharacterSpecs) {
    const def = composeAvatar({ atoms: { body: c.id, eyes: 'pill' } });
    assert.equal(def.body.colorRef, c.body.color, `${c.id}: colorRef recorded`);
    for (const a of def.accessories ?? []) {
      assert.notEqual(a.followBody, false);
      for (const k of ['color', 'stemColor'] as const) {
        const col = (a as Record<string, unknown>)[k] as string | number | undefined;
        if (col === undefined) continue; // defaults to the body colour → follows exactly
        assert.ok(near(tintColor(col, c.body.color, c.body.color), colorToRgb(col)), `${c.id} ${a.type}.${k} unchanged at default`);
        if (!isTintable(colorToRgb(col))) continue;
        const moved = tintColor(col, c.body.color, '#22c3a0');
        assert.ok(!near(moved, colorToRgb(col), 0.05), `${c.id} ${a.type}.${k} follows a new body colour`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 6, `checked ${checked} coloured accessory parts`);
});

test('body colour / colorRef edits tween in place (no structural rebuild)', () => {
  const a = composeAvatar({ atoms: { body: 'beanie', eyes: 'pill' } });
  const b = defineAvatar({ ...a, body: { ...a.body, color: '#00ff00' } });
  const d = diffAvatarDefinitions(a, b);
  assert.equal(d.body, false);
  assert.equal(d.accessories, false);
  assert.equal(d.tween.bodyColor, '#00ff00');
});

test('contrast border: darker on light accents, lighter on dark accents, continuous across', () => {
  for (const c of ['#F5672B', '#FFD84A', '#9FE3C1', '#F3B6D8', '#ffffff']) {
    const a = colorToRgb(c);
    assert.ok(perceivedLightness(contrastBorder(a)) < perceivedLightness(a) - 0.15, `${c}: darker border`);
  }
  for (const c of ['#1B2A6B', '#3B1F4A', '#123524', '#000000', '#5a1010']) {
    const a = colorToRgb(c);
    assert.ok(perceivedLightness(contrastBorder(a)) > perceivedLightness(a) + 0.15, `${c}: lighter border`);
  }
  // sweep black → white: no jumps in the derived colours (smooth crossover)
  let pb = contrastBorder([0.05, 0.04, 0.03]), pe = contrastEyeColor([0.05, 0.04, 0.03]);
  for (let i = 21; i <= 400; i++) {
    const v = i / 400;
    const a: [number, number, number] = [v, v * 0.8, v * 0.6];
    const b = contrastBorder(a), e = contrastEyeColor(a);
    const d = (x: number[], y: number[]) => Math.max(...x.map((u, k) => Math.abs(u - y[k]!)));
    assert.ok(d(b, pb) < 0.03, `border continuous at ${v}`);
    assert.ok(d(e, pe) < 0.1, `eye continuous at ${v}`);
    pb = b; pe = e;
  }
  assert.ok(darkness([0, 0, 0]) === 1 && darkness([1, 1, 1]) === 0);
});

test('contrast eye colour: only black or white, whichever contrasts, defaults to auto', () => {
  assert.equal(DEFAULT_EYES.color, 'auto');
  for (const c of ['#F5672B', '#FFD84A', '#9FE3C1', '#F3B6D8', '#ffffff', '#EC8FBF']) {
    const a = colorToRgb(c);
    const e = contrastEyeColor(a);
    assert.ok(e[0] < 0.05 && e[1] < 0.05 && e[2] < 0.05, `${c}: black eye`);
    assert.ok(contrastRatio(a, e) >= 3, `${c}: contrast ${contrastRatio(a, e).toFixed(2)}`);
  }
  for (const c of ['#1B2A6B', '#3B1F4A', '#123524', '#000000', '#5a1010']) {
    const a = colorToRgb(c);
    const e = contrastEyeColor(a);
    assert.ok(e[0] > 0.95 && e[1] > 0.95 && e[2] > 0.95, `${c}: white eye`);
    assert.ok(contrastRatio(a, e) >= 3, `${c}: contrast ${contrastRatio(a, e).toFixed(2)}`);
  }
  // black ↔ white only (channel equality → no hue), continuous across a sweep
  let pe = contrastEyeColor([0.05, 0.04, 0.03]);
  for (let i = 21; i <= 400; i++) {
    const v = i / 400;
    const e = contrastEyeColor([v, v * 0.8, v * 0.6]);
    assert.ok(Math.abs(e[0] - e[1]) < 1e-12 && Math.abs(e[1] - e[2]) < 1e-12, 'no hue');
    assert.ok(Math.abs(e[0] - pe[0]) < 0.1, `eye continuous at ${v}`);
    pe = e;
  }
});

test('every Allie preset gets a contrasting auto eye colour from its accent', () => {
  for (const c of allieCharacterSpecs) {
    const def = composeAvatar({ atoms: { body: c.id, eyes: 'pill' } });
    const col = def.eyes?.color ?? DEFAULT_EYES.color;
    assert.equal(col, 'auto', `${c.id} eye colour is auto`);
    const a = colorToRgb(def.body.color);
    const e = contrastEyeColor(a);
    assert.ok(Math.abs(e[0] - e[1]) < 1e-12 && Math.abs(e[1] - e[2]) < 1e-12, `${c.id}: no hue`);
    assert.ok(contrastRatio(a, e) >= 3, `${c.id}: contrast`);
  }
});
