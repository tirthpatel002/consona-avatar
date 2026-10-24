import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { AvatarEngine } from '../../src/core/engine/AvatarEngine.ts';
import { ConsonaEngine } from '../../src/avatars/consona/sdk/ConsonaEngine.ts';
import { createDefaultAvatarConfig } from '../../src/avatars/consona/consona.config.ts';
import { normalizeToCanvas } from '../../src/avatars/consona/layout/consona.layout.ts';
import type { ConsonaAvatarConfig } from '../../src/avatars/consona/consona.config.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(__dirname, 'fixtures');

export const UPDATE_GOLDENS = process.env.UPDATE_GOLDENS === '1';

export function fixturePath(...parts: string[]): string {
  return join(FIXTURES_DIR, ...parts);
}

export function readFixture(rel: string): string {
  return readFileSync(fixturePath(rel), 'utf8');
}

export function writeFixture(rel: string, contents: string): void {
  const path = fixturePath(rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

export function assertMatchesFixture(rel: string, actual: string): void {
  if (UPDATE_GOLDENS || !existsSync(fixturePath(rel))) {
    writeFixture(rel, actual);
    return;
  }
  const expected = readFixture(rel);
  assert.equal(actual, expected, `Golden mismatch: ${rel}`);
}

export function defaultConfig(overrides?: Partial<ConsonaAvatarConfig>): ConsonaAvatarConfig {
  return createDefaultAvatarConfig('golden-default', 'light', overrides as any);
}

export function renderConfigSvg(config: ConsonaAvatarConfig, size = 100): string {
  const core = new AvatarEngine();
  const engine = new ConsonaEngine(core);
  try {
    return engine.renderToSvg(config, { size, background: 'transparent' });
  } finally {
    core.destroy();
  }
}

export function layoutSnapshot(config: ConsonaAvatarConfig): string {
  return JSON.stringify(normalizeToCanvas(config), null, 2) + '\n';
}

export function sampleMixerPose(
  animationName: string,
  times: number[],
  gaze?: { x: number; y: number }
): string {
  const core = new AvatarEngine();
  const engine = new ConsonaEngine(core);
  try {
    const inst = engine.create({
      seed: 'golden-pose',
      paletteId: 'light',
      config: {
        behavior: { interactive: false, autoBlink: false, animated: false },
      },
    });
    inst.animated = false;
    const gazeCtrl = inst.getController<any>('pointer-gaze');
    if (gazeCtrl) gazeCtrl.enabled = false;

    if (gaze) {
      const eyes = inst.scene.find('consona:eyes');
      if (eyes) {
        eyes.channels.set('gazeX', gaze.x);
        eyes.channels.set('gazeY', gaze.y);
        eyes.channels.set('pointerX', gaze.x / 12);
        eyes.channels.set('pointerY', gaze.y / 12);
      }
    }

    const samples: Record<string, unknown> = {};
    for (const t of times) {
      const anim = inst.mixer.get(animationName);
      if (!anim?.evaluate) {
        samples[`t=${t}`] = null;
        continue;
      }
      samples[`t=${t}`] = anim.evaluate(t, 0.016);
    }
    return JSON.stringify({ animation: animationName, gaze: gaze ?? null, samples }, null, 2) + '\n';
  } finally {
    core.destroy();
  }
}

/** Deterministic preset-layer samples (owned param paths → value) at fixed times. */
export function samplePresetPose(preset: string, times: number[]): string {
  const core = new AvatarEngine();
  const engine = new ConsonaEngine(core);
  try {
    const inst = engine.create({
      seed: 'golden-pose',
      paletteId: 'light',
      config: { behavior: { interactive: false, autoBlink: false, animated: false, preset } },
    });
    inst.presets.reset(preset);
    const samples: Record<string, Record<string, number>> = {};
    let at = 0;
    for (const t of times) {
      inst.presets.step(t - at);
      at = t;
      const row: Record<string, number> = {};
      for (const s of inst.presets.slots) if (s.owned) row[s.path] = Math.round(s.value * 1e6) / 1e6;
      samples[`t=${t}`] = row;
    }
    return JSON.stringify({ preset, samples }, null, 2) + '\n';
  } finally {
    core.destroy();
  }
}
