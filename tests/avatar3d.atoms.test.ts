import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeAvatar,
  listAvatarAtoms,
  listAvatarAtomVariants,
  registerAvatarAtom,
  registerAvatarAtomVariant,
} from '../src/core/index.ts';
import {
  allieCharacterSpecs,
  allieClassicCompositions,
  alliePresets,
  allieThreadiesCompositions,
  allieThreadiesPresets,
  allieShapes,
  allieThreadiesShapes,
  registerAllieAtoms,
  registerAllieCatalog,
} from '../src/avatars/allie/index.ts';
import { eyeLayout, getAvatarPreset, listEyePoses, listAvatarPresets } from '../src/core/index.ts';

test('composeAvatar applies variants in atom order, then overrides', () => {
  registerAvatarAtom({ id: 'zz-late', name: 'Late', order: 9 });
  registerAvatarAtom({ id: 'zz-early', name: 'Early', order: -9 });
  const seen: string[] = [];
  registerAvatarAtomVariant({
    atom: 'zz-early',
    id: 'a',
    name: 'A',
    apply(d) {
      seen.push('early');
      d.def.body = { shape: 'sphere', color: 0x123456 };
      d.meta.w = 1.5;
    },
  });
  registerAvatarAtomVariant({
    atom: 'zz-late',
    id: 'b',
    name: 'B',
    apply(d) {
      seen.push('late');
      d.def.anchor = { y: 0, width: d.meta.w as number, height: 0.5 };
    },
  });
  const def = composeAvatar({ atoms: { 'zz-late': 'b', 'zz-early': 'a' }, overrides: { 'body.color': '#ff0000' } });
  assert.deepEqual(seen, ['early', 'late']);
  assert.equal(def.anchor.width, 1.5);
  assert.equal(def.id, 'a+b');
  assert.equal(def.body.color, '#ff0000');
  assert.throws(() => composeAvatar({ atoms: { 'zz-early': 'nope' } }), /unknown/);
});

test('allie registers body / eyes / preset atoms (no face atom)', () => {
  registerAllieAtoms();
  const ids = listAvatarAtoms().map((a) => a.id);
  for (const a of ['body', 'eyes', 'preset']) assert.ok(ids.includes(a), a);
  for (const gone of ['character', 'panel', 'face']) assert.ok(!ids.includes(gone), `${gone} atom removed`);
  assert.equal(listAvatarAtomVariants('body').filter((v) => v.group === 'Classics').length, 4);
  assert.equal(listAvatarAtomVariants('body').filter((v) => v.group === 'Threadies').length, 11);
  assert.ok(!listAvatarAtomVariants('body').some((v) => v.id === 'haystack'), 'haystack removed');
  assert.ok(listAvatarAtomVariants('body').some((v) => v.id === 'heart'), 'heart added');
  assert.equal(listAvatarAtomVariants('face').length, 0);
  assert.deepEqual(listAvatarAtomVariants('eyes').map((v) => v.id).sort(), ['cube', 'heart', 'pill', 'sphere', 'star']);
  for (const m of ['neutral', 'happy', 'sleepy', 'surprised', 'wink', 'sad', 'angry', 'love', 'look']) assert.ok(listAvatarAtomVariants('preset').some((v) => v.id === m), m);
});

test('classic presets keep their tuned body values; the eye anchor sits where the face was', () => {
  const legacy: Record<string, { shape: unknown; color: number; scale: number; anchor: number[]; preset: string; fur?: number }> = {
    blue: { shape: allieShapes.teardrop, color: 0x2f7bff, scale: 1.05, anchor: [-0.15, 1.45, 0.58], preset: 'look' },
    pink: { shape: 'allie:flower', color: 0xff2f8f, scale: 1.05, anchor: [-0.05, 1.5, 0.6], preset: 'wink' },
    yellow: { shape: allieShapes.blob, color: 0xffa51a, scale: 1.45, anchor: [0.05, 1.3, 0.56], preset: 'happy', fur: 0.13 },
    green: { shape: allieShapes.dome, color: 0x8fdc1e, scale: 1.0, anchor: [-0.05, 1.45, 0.58], preset: 'sparkle' },
  };
  assert.equal(alliePresets.length, 4);
  for (const p of alliePresets) {
    const l = legacy[p.id];
    assert.ok(l, p.id);
    assert.equal(p.body.shape, l.shape);
    assert.equal(p.body.color, l.color);
    assert.equal(p.body.scale, l.scale);
    assert.deepEqual([p.anchor.y, p.anchor.width, p.anchor.height], l.anchor);
    assert.ok(!('face' in p), 'no face field');
    assert.equal(p.preset, l.preset);
    assert.equal(p.fur && p.fur.length, l.fur ?? 0.09);
  }
  const yellow = alliePresets.find((p) => p.id === 'yellow')!;
  assert.deepEqual(yellow.accessories?.map((a) => a.type), ['allie:hand', 'allie:hand']);
  assert.deepEqual(yellow.accessories?.map((a) => a.side), ['left', 'right']);
});

test('Threadies presets migrate glyph looks to eye shapes + presets', () => {
  assert.equal(allieThreadiesPresets.length, 11);
  const want: Record<string, [string, string]> = {
    pippo: ['pill', 'joyful'],
    tuff: ['star', 'excited'],
    rolly: ['pill', 'content'],
    spirou: ['sphere', 'curious'],
    moko: ['pill', 'determined'],
    fifi: ['heart', 'love'],
    chobi: ['pill', 'happy'],
    poko: ['pill', 'calm'],
    lilo: ['sphere', 'playful'],
    barnaby: ['sphere', 'surprised'],
    hearty: ['sphere', 'happy'],
  };
  for (const p of allieThreadiesPresets) {
    assert.deepEqual([p.eyes.shape, p.preset], want[p.id], p.id);
    assert.ok(listEyePoses().includes(p.preset), `${p.id} preset is a registered eye pose`);
  }
  assert.equal(allieThreadiesPresets.find((p) => p.id === 'rolly')!.body.shape, 'allie:torus');
});

test('every body x eyes x preset combination composes; eyes fit the body anchor', () => {
  registerAllieAtoms();
  const bodies = listAvatarAtomVariants('body').map((v) => v.id);
  const eyes = listAvatarAtomVariants('eyes').map((v) => v.id);
  const presets = listAvatarAtomVariants('preset').map((v) => v.id);
  assert.equal(bodies.length, allieCharacterSpecs.length);
  for (const body of bodies) for (const eye of eyes) for (const preset of presets) {
    const d = composeAvatar({ atoms: { body, eyes: eye, preset } });
    const spec = allieCharacterSpecs.find((c) => c.id === body)!;
    assert.deepEqual(d.anchor, spec.anchor, `${body}: anchor from the body`);
    assert.equal(d.eyes.shape, eye);
    assert.equal(d.preset, preset);
    const l = eyeLayout(d.anchor, d.eyes);
    assert.ok(l.radius > 0.08 && l.radius < 0.32, `${body}/${eye}: prominent eye radius ${l.radius}`);
  }
  // no preset atom → the body's own preset
  assert.equal(composeAvatar({ atoms: { body: 'heart', eyes: 'heart' } }).preset, 'happy');
});

test('heart body: symmetric plush heart on the standard footing', () => {
  const heart = allieCharacterSpecs.find((c) => c.id === 'heart')!;
  assert.ok(heart, 'heart character');
  assert.equal(heart.body.shape, allieThreadiesShapes.heart);
  const f = allieThreadiesShapes.heart;
  const at = (x: number, y: number, z: number) => {
    const v = { x, y, z };
    f(v);
    return v;
  };
  let minY = 9;
  let maxY = -9;
  let maxX = 0;
  for (let i = 0; i <= 48; i++)
    for (let j = 0; j <= 96; j++) {
      const th = (i / 48) * Math.PI;
      const ph = (j / 96) * Math.PI * 2;
      const v = at(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      const m = at(-Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      assert.ok(Math.abs(v.x + m.x) < 1e-9 && Math.abs(v.y - m.y) < 1e-9, 'mirror-symmetric');
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
      maxX = Math.max(maxX, v.x);
    }
  assert.ok(Math.abs(minY + 1) < 0.02, `tip stands at y = -1 (${minY})`);
  // two lobes: the top centre (cleft) dips below the lobe tops
  const cleft = at(0, 1, 0).y;
  const lobe = at(Math.sin(0.5), Math.cos(0.5), 0).y;
  assert.ok(lobe > cleft + 0.15, `lobes ${lobe} above cleft ${cleft}`);
  assert.ok(maxY > 0.75 && maxX > 1.1, 'plush proportions');
});

test('catalog publishes both Allie families with compositions (15 presets)', () => {
  registerAllieCatalog();
  assert.equal(listAvatarPresets('allie').length, 4);
  assert.equal(listAvatarPresets('allie-threadies').length, 11);
  assert.deepEqual(getAvatarPreset('barnaby')?.composition?.atoms, { body: 'cable-arch', eyes: 'sphere', preset: 'surprised', mouth: 'none' });
  assert.equal(getAvatarPreset('rolly')?.composition?.atoms?.mouth, 'none', 'Rolly + Barnaby ship without a mouth');
  assert.equal(allieClassicCompositions.length + allieThreadiesCompositions.length, 15);
});
