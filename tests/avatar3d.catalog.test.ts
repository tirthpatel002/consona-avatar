import { test } from 'node:test';
import assert from 'node:assert';
import {
  registerAvatarFamily,
  registerAvatarPreset,
  listAvatarFamilies,
  listAvatarPresets,
  getAvatarPreset,
  getAvatarCatalog,
  subscribeAvatarCatalog,
  unregisterAvatarPreset,
  defineAvatar,
  getAvatarControls,
  applyAvatarOverrides,
  registerAvatarControl,
  registerAvatarShape,
  listAvatarBehaviors,
  listAvatarPresetNames,
} from '../src/core/index.ts';
import { registerAllieCatalog, ALLIE_FAMILY, yellowBlobAvatar } from '../src/avatars/allie/index.ts';

const toy = defineAvatar({
  id: 'toy',
  body: { shape: 'sphere', color: 0xff0000 },
  anchor: { y: 0, width: 1, height: 0.5 },
  accessories: [{ type: 'hat' }],
  behaviors: [{ name: 'hop', duration: 1 }],
});

test('Catalog: families/presets register, sort, notify, and keep stable snapshots', () => {
  let calls = 0;
  const unsub = subscribeAvatarCatalog(() => calls++);
  const before = getAvatarCatalog();
  assert.strictEqual(getAvatarCatalog(), before, 'snapshot identity stable without changes');
  registerAvatarFamily({ id: 'zoo', name: 'Zoo', order: 2 });
  registerAvatarFamily({ id: 'aaa', name: 'Aaa', order: 1 });
  const p = registerAvatarPreset({ family: 'zoo', definition: toy });
  assert.strictEqual(p.name, 'toy');
  assert.strictEqual(p.color, 0xff0000, 'swatch defaults to body colour');
  registerAvatarPreset({ family: 'auto-fam', definition: { ...toy, id: 'toy2' }, name: 'Toy 2' });

  assert.ok(listAvatarFamilies().some((f) => f.id === 'auto-fam'), 'unknown family auto-created');
  assert.ok(listAvatarFamilies().findIndex((f) => f.id === 'aaa') < listAvatarFamilies().findIndex((f) => f.id === 'zoo'), 'order respected');
  assert.deepStrictEqual(listAvatarPresets('zoo').map((x) => x.id), ['toy']);
  assert.ok(getAvatarPreset('toy2'));
  unregisterAvatarPreset('toy2');
  assert.strictEqual(getAvatarPreset('toy2'), undefined);
  assert.notStrictEqual(getAvatarCatalog(), before);
  assert.ok(calls >= 5);
  unsub();
});

test('Catalog: Allie registers its family and four classic presets (idempotent)', () => {
  registerAllieCatalog();
  registerAllieCatalog();
  const allie = listAvatarPresets(ALLIE_FAMILY);
  assert.strictEqual(allie.length, 4);
  assert.ok(listAvatarFamilies().find((f) => f.id === ALLIE_FAMILY)?.name);
});

test('Controls: schema derives from the definition and registries', () => {
  const ctl = getAvatarControls(toy);
  const paths = ctl.map((c) => c.path);
  for (const p of ['body.color', 'body.shape', 'fur.length', 'fur.shells', 'anchor.y', 'anchor.width', 'eyes.size', 'eyes.depth', 'eyes.outlineWidth', 'eyes.lid', 'accessories.0.enabled']) assert.ok(paths.includes(p), p);
  assert.strictEqual(ctl.find((c) => c.path === 'body.color')!.value, '#ff0000');
  // new shape shows up automatically
  registerAvatarShape('egg', (v) => { v.y *= 1.2; });
  const shape = getAvatarControls(toy).find((c) => c.path === 'body.shape')!;
  assert.ok(shape.kind === 'select' && shape.options.some((o) => o.value === 'egg'));
  // fur off hides fur params
  const furless = applyAvatarOverrides(toy, { fur: false });
  assert.strictEqual(furless.fur, false);
  assert.ok(!getAvatarControls(furless).some((c) => c.path === 'fur.length'));
  // extension point: new control appears for every definition
  registerAvatarControl({ kind: 'range', path: 'body.wobble', label: 'Wobble', group: 'Body', min: 0, max: 1, step: 0.1 });
  assert.ok(getAvatarControls(toy).some((c) => c.path === 'body.wobble'));
});

test('Controls: overrides are immutable and support accessories / shapes / nested paths', () => {
  const next = applyAvatarOverrides(toy, { 'body.color': '#00ff00', 'fur.length': 0.2, 'accessories.0.enabled': false, 'body.shape': 'egg' });
  assert.strictEqual(next.body.color, '#00ff00');
  assert.strictEqual(next.fur !== false && next.fur.length, 0.2);
  assert.strictEqual(next.accessories?.[0]?.enabled, false);
  assert.strictEqual(typeof next.body.shape, 'function');
  assert.strictEqual(toy.body.color, 0xff0000, 'base untouched');
  assert.strictEqual(toy.accessories?.[0]?.enabled, undefined);
  assert.notStrictEqual(applyAvatarOverrides(yellowBlobAvatar, {}), undefined);
});

test('Controls: behaviors merge registry + definition; presets are the eye poses', () => {
  assert.deepStrictEqual(listAvatarBehaviors(toy), ['idle', 'hop']);
  for (const m of ['neutral', 'happy', 'love', 'sleepy']) assert.ok(listAvatarPresetNames(ALLIE_FAMILY).includes(m), m);
});
