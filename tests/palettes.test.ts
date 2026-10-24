import test from 'node:test';
import assert from 'node:assert';
import {
  ACCENT_COLORS,
  CONSONA_PALETTES,
  createAccentPalette,
  getPalette,
  resolvePalette,
  type AccentColor,
  type PaletteMode,
} from '../src/avatars/consona/palettes/consona.palettes.ts';

const expectedAccents: AccentColor[] = [
  'mono',
  'red',
  'blue',
  'purple',
  'green',
  'indigo',
  'orange',
  'yellow',
  'brown',
  'emerald',
  'gold',
];

test('Palettes: ACCENT_COLORS contains all 11 required accents', () => {
  const ids = ACCENT_COLORS.map((a) => a.id);
  for (const acc of expectedAccents) {
    assert.ok(ids.includes(acc), `Expected ACCENT_COLORS to include '${acc}'`);
  }
  assert.strictEqual(ACCENT_COLORS.length, 11);
});

test('Palettes: Each accent creates valid light and dark mode PaletteDefinitions', () => {
  const modes: PaletteMode[] = ['light', 'dark'];

  for (const acc of expectedAccents) {
    for (const mode of modes) {
      const pal = createAccentPalette(acc, mode);
      assert.ok(pal, `Palette for ${acc} (${mode}) must be defined`);
      assert.strictEqual(pal.accentColor, acc);
      assert.strictEqual(pal.mode, mode);

      // Verify hex colors
      assert.match(pal.background, /^#[0-9A-Fa-f]{6}$/, `Invalid background hex: ${pal.background}`);
      assert.match(pal.pupil, /^#[0-9A-Fa-f]{6}$/, `Invalid pupil hex: ${pal.pupil}`);
      assert.match(pal.sclera, /^#[0-9A-Fa-f]{6}$/, `Invalid sclera hex: ${pal.sclera}`);
      assert.match(pal.highlight, /^#[0-9A-Fa-f]{6}$/, `Invalid highlight hex: ${pal.highlight}`);
      assert.match(pal.accent, /^#[0-9A-Fa-f]{6}$/, `Invalid accent hex: ${pal.accent}`);
      if (pal.eyeBorder) {
        assert.match(pal.eyeBorder, /^#[0-9A-Fa-f]{6}$/, `Invalid eyeBorder hex: ${pal.eyeBorder}`);
      }
      if (pal.eyeBorderAlt) {
        assert.match(pal.eyeBorderAlt, /^#[0-9A-Fa-f]{6}$/, `Invalid eyeBorderAlt hex: ${pal.eyeBorderAlt}`);
      }

      // Verify head gradient stops (minimum 4 stops)
      assert.ok(Array.isArray(pal.head), `Head must be an array`);
      assert.ok(pal.head.length >= 4, `Head must have at least 4 stops, got ${pal.head.length}`);
      for (const stop of pal.head) {
        assert.match(stop, /^#[0-9A-Fa-f]{6}$/, `Invalid head stop hex: ${stop}`);
      }

      // Verify iris stops
      assert.ok(Array.isArray(pal.iris) && pal.iris.length >= 2, `Iris must have at least 2 stops`);
      for (const stop of pal.iris) {
        assert.match(stop, /^#[0-9A-Fa-f]{6}$/, `Invalid iris stop hex: ${stop}`);
      }
    }
  }
});

test('Palettes: CONSONA_PALETTES precomputed map contains all keys', () => {
  assert.ok(CONSONA_PALETTES['light'], "Must have 'light' key");
  assert.ok(CONSONA_PALETTES['dark'], "Must have 'dark' key");

  for (const acc of expectedAccents) {
    assert.ok(CONSONA_PALETTES[`${acc}-light`], `Must have '${acc}-light' key`);
    assert.ok(CONSONA_PALETTES[`${acc}-dark`], `Must have '${acc}-dark' key`);
    assert.ok(CONSONA_PALETTES[acc], `Must have '${acc}' key`);
  }
});

test('Palettes: getPalette and resolvePalette helpers resolve expected definitions', () => {
  const redLight = getPalette('red', 'light');
  assert.strictEqual(redLight.id, 'red-light');
  assert.strictEqual(redLight.accentColor, 'red');
  assert.strictEqual(redLight.mode, 'light');

  const emeraldDark = getPalette('emerald', 'dark');
  assert.strictEqual(emeraldDark.id, 'emerald-dark');
  assert.strictEqual(emeraldDark.accentColor, 'emerald');
  assert.strictEqual(emeraldDark.mode, 'dark');

  // resolvePalette tests
  const resolvedDirect = resolvePalette('gold-dark');
  assert.strictEqual(resolvedDirect.id, 'gold-dark');

  const resolvedAccent = resolvePalette('indigo', 'dark');
  assert.strictEqual(resolvedAccent.id, 'indigo-dark');

  const resolvedFallback = resolvePalette('unknown-palette-key');
  assert.strictEqual(resolvedFallback.id, 'light');
});
