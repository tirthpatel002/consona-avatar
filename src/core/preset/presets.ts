import { ScopedRegistry } from '../registry/ScopedRegistry.ts';

/**
 * Presets: a controlled, seamless, periodic modulation of an avatar's config.
 *
 * A preset is not a face pose or an animation clip. It is a set of config
 * parameter paths (any atom param, colour, scale, eye / mouth params, jelly,
 * fur sway, Consona channels, gaze bias, blink rate…) that change over time:
 *
 *  - `targets`: path → value applied on entry (eased in). Numbers blend from
 *    the live value; strings / booleans are variant switches (renderers morph
 *    them where they support it).
 *  - `cycles`: path → periodic modulation (sine / triangle / noise /
 *    keyframes; amplitude, period, phase, seeded variation).
 *  - `variations`: now-and-then variant switches (seeded), e.g. a yawn.
 *  - `behaviors`: periodic behaviors (seeded).
 *  - `enter`: transition (default 0.3 s ease). Switching crossfades from the
 *    live values, also mid-cycle and mid-transition.
 *
 * Paths are renderer-defined strings (definition paths for Three rigs, e.g.
 * `mouth.curve`, `body.scale`, `pose.bob`; `node.channel` for scene-graph
 * avatars, e.g. `consona:head.yOffset`). `blink.rate` (1 = normal) is the
 * blink profile. The core `PresetLayer` evaluates a preset each frame into
 * overrides; renderers apply them in place without mutating the saved config.
 */
export type PresetWave = 'sine' | 'triangle' | 'noise' | 'keyframes';

export interface PresetCycle {
  /** Waveform (default 'sine'). */
  wave?: PresetWave;
  /** Amplitude (default 1). */
  amp?: number;
  /** Period in seconds. */
  period: number;
  /** Phase as a fraction of the period (default 0). */
  phase?: number;
  /** `keyframes`: values evenly spaced over one period, looped (linear). */
  keys?: readonly number[];
  /** 'add' (default): base / target + wave · amp. 'mul': base / target · (1 + wave · amp) (relative, e.g. scales). 'set': the wave value itself (absolute keyframes). */
  mode?: 'add' | 'mul' | 'set';
  /** 0..1: smooth seeded amplitude variation from cycle to cycle (deterministic per seed). */
  variation?: number;
}

export type PresetValue = number | string | boolean;

export interface PresetTransition {
  /** Seconds (default 0.3). */
  duration?: number;
  ease?: (t: number) => number;
}

/** Now and then switch `path` to `value` for `hold` s (every `every` s, seeded). */
export interface PresetVariation {
  path: string;
  value: PresetValue;
  every: [number, number];
  hold: number;
}

export interface PresetSpec {
  label?: string;
  description?: string;
  icon?: string;
  /** Channel targets while this preset is shown (lowest layer: `set()` and behaviors win). */
  channels?: Readonly<Record<string, number>>;
  targets?: Readonly<Record<string, PresetValue>>;
  cycles?: Readonly<Record<string, PresetCycle>>;
  variations?: readonly PresetVariation[];
  behaviors?: readonly { behavior: string; every: [number, number] }[];
  enter?: PresetTransition;
}

export interface RegisteredPreset extends PresetSpec {
  readonly id: string;
  /** Owning family (undefined = shared). */
  readonly family?: string;
}

/** Preset ids every family provides (families add extras). */
export const SHARED_PRESET_IDS = ['neutral', 'happy', 'sad', 'curious', 'sleepy', 'surprised', 'love', 'thinking'] as const;
export type SharedPresetId = (typeof SHARED_PRESET_IDS)[number];

/** Blink profile param: blink frequency multiplier (1 = normal, 0 = never). */
export const PRESET_BLINK_RATE = 'blink.rate';

const presets = new ScopedRegistry<RegisteredPreset>();

/** Register (or replace) a preset. `family` null / undefined = shared by every family. */
export function registerPreset(family: string | null | undefined, id: string, spec: PresetSpec): void {
  presets.set(id, { ...spec, id, family: family ?? undefined }, family ?? undefined);
}

/** The preset `id` as seen by `family` (family entry, else the shared one). */
export function getPreset(id: string, family?: string): RegisteredPreset | undefined {
  return presets.get(id, family);
}

export function hasPreset(id: string, family?: string): boolean {
  return presets.has(id, family);
}

/** Presets visible to `family` (shared + family, insertion order). */
export function listPresets(family?: string): string[] {
  return presets.names(family);
}

// 'neutral' always exists (the rest state).
registerPreset(null, 'neutral', { label: 'Neutral' });

// ----- rebuild guard -----
const rebuild = new ScopedRegistry<readonly string[]>();

/**
 * Declare config paths (prefixes) that need a geometry / material rebuild on
 * a renderer (fur shell count, body shape…). Presets never modulate them: they
 * are dropped with a dev warning.
 */
export function registerPresetRebuildPaths(family: string | null | undefined, prefixes: readonly string[]): void {
  rebuild.set('paths', prefixes, family ?? undefined);
}

export function isPresetRebuildPath(path: string, family?: string): boolean {
  const check = (list: readonly string[] | undefined) => !!list && list.some((p) => path === p || path.startsWith(p + '.'));
  return check(rebuild.get('paths', family)) || (!!family && check(rebuild.get('paths')));
}

/** Dev-only warning (silent when NODE_ENV is 'production'). */
export function presetWarn(message: string): void {
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
  if (env !== 'production') console.warn(`[preset] ${message}`);
}
