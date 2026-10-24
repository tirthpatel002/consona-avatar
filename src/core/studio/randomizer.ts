import type { AvatarControlState } from '../controls/controls.ts';
import { listAvatarAtomVariants } from '../catalog/catalog.ts';
import { createAvatarRng } from '../math/random.ts';
import { clamp01 } from '../math/Interpolation.ts';
import { colorToRgb } from '../color/color.ts';
import { hslToRgb, rgbToHex, rgbToHsl } from '../color/tint.ts';

/**
 * Family-authored randomization (renderer-agnostic).
 *
 * A family registers an `AvatarRandomizerSpec` (`registerAvatarRandomizer`);
 * `rollAvatar` turns it into atoms + control values:
 *
 *   1. atoms   – weighted variant picks, in spec order (weights may depend on
 *                atoms picked earlier, e.g. mouth from preset); unlisted atoms keep.
 *   2. controls – per-path rules (curated range + distribution, weighted
 *                choices, chance, palette, HSL band, fixed value, pin);
 *                unlisted controls follow `others` (default: small jitter
 *                around the baseline). `randomize: false` controls never change.
 *                A second pass covers controls revealed by `when`.
 *   3. derive  – coupled rules (derived colours, ties between params).
 *   4. custom  – optional full-control patch.
 *   5. reject  – predicate; re-roll (up to `maxTries`).
 *
 * Every number is clamped + snapped to its control's range / step, every
 * select value is one of its options. Seeded (`seed` → same result for the
 * same starting point), so a roll is reproducible; the outcome itself is what
 * share codes store. Families without a spec get `DEFAULT_AVATAR_RANDOMIZER`
 * (jitter only, atoms kept).
 */

// ---------- rng ----------
export type AvatarRng = () => number;

/** Fresh 32-bit seed. */
export const newAvatarSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

/** Standard normal (Box–Muller). */
const normal = (rng: AvatarRng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

/** Weighted pick from `{ key: weight }` (or a list = equal weights); `undefined` when empty / all zero. */
export function pickWeighted<K extends string>(choices: Readonly<Record<K, number>> | readonly K[], rng: AvatarRng): K | undefined {
  const entries: [K, number][] = Array.isArray(choices) ? (choices as readonly K[]).map((k) => [k, 1]) : (Object.entries(choices) as [K, number][]);
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const [k, w] of entries) if ((r -= Math.max(0, w)) < 0) return k;
  return entries[entries.length - 1]![0];
}

// ---------- colour helpers ----------
export type AvatarHsl = { h: number; s: number; l: number };

export function hslToHex({ h, s, l }: AvatarHsl): string {
  return rgbToHex(hslToRgb([(((h % 360) + 360) % 360) / 360, s, l]));
}

export function hexToHsl(hex: string): AvatarHsl {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const [h, s, l] = rgbToHsl(colorToRgb(m ? `#${m[1]}` : '#000000'));
  return { h: h * 360, s, l };
}

// ---------- spec ----------
type Band = readonly [number, number];

/** How one control is rolled. */
export type AvatarRandomRule =
  /** keep the current / baseline value */
  | 'pin'
  /** fixed value */
  | { value: unknown }
  /** curated band (inside the control range). `gaussian`: centred on the baseline (clamped into the band), `sd` default = band / 4. */
  | { range: Band; dist?: 'uniform' | 'gaussian'; sd?: number }
  /** ± `jitter` × control span around the baseline (uniform) */
  | { jitter: number }
  /** weighted discrete values (selects, toggles: `{ true: 3, false: 1 }`, numbers as keys) */
  | { choices: Readonly<Record<string, number>> | readonly (string | number | boolean)[] }
  /** toggle: probability of `true` */
  | { chance: number }
  /** colour from a curated list (weights optional) */
  | { palette: readonly string[] | Readonly<Record<string, number>> }
  /** colour from an HSL band (h degrees, s / l 0..1) */
  | { hsl: { h: Band; s: Band; l: Band } };

/** Atom variant weights; a function sees the atoms picked so far. */
export type AvatarAtomRule = 'pin' | Readonly<Record<string, number>> | ((atoms: Readonly<Record<string, string>>, rng: AvatarRng) => Readonly<Record<string, number>> | 'pin');

/** Mutable roll result handed to `derive` / `custom` / `reject`. */
export interface AvatarRollDraft {
  family: string;
  atoms: Record<string, string>;
  /** control path → value (only rolled / derived paths) */
  values: Record<string, unknown>;
  /** rolled value, else baseline */
  get<T = unknown>(path: string): T;
}

export interface AvatarRandomizerSpec {
  /** catalog studios: start from one of these presets (weights; others 0). Default: every preset of the family, equal weight. */
  presets?: Readonly<Record<string, number>>;
  atoms?: Readonly<Record<string, AvatarAtomRule>>;
  controls?: Readonly<Record<string, AvatarRandomRule>>;
  /** rule for controls the spec doesn't list (default `{ jitter: 0.06 }`; selects / toggles / colours keep) */
  others?: 'pin' | { jitter: number };
  /** coupled rules: mutate `draft.values` / `draft.atoms` */
  derive?(draft: AvatarRollDraft, rng: AvatarRng): void;
  /** full control: returned values / atoms are merged last */
  custom?(rng: AvatarRng, current: AvatarRollDraft): { atoms?: Record<string, string>; values?: Record<string, unknown> } | void;
  /** true = ugly, roll again */
  reject?(draft: AvatarRollDraft): boolean;
  maxTries?: number;
}

/** Fallback for families without a spec: small jitter around the baseline, atoms kept. */
export const DEFAULT_AVATAR_RANDOMIZER: AvatarRandomizerSpec = { others: { jitter: 0.06 } };

const specs = new Map<string, AvatarRandomizerSpec>();

/** Register (replace) a family's randomizer. */
export function registerAvatarRandomizer(family: string, spec: AvatarRandomizerSpec): void {
  specs.set(family, spec);
}

/** The family's spec, or `DEFAULT_AVATAR_RANDOMIZER`. */
export function getAvatarRandomizer(family: string): AvatarRandomizerSpec {
  return specs.get(family) ?? DEFAULT_AVATAR_RANDOMIZER;
}

// ---------- rolling ----------
/** A starting preset among `presets` (weighted by each family's spec). */
export function pickAvatarPreset<P extends { id: string; family: string }>(presets: readonly P[], rng: AvatarRng): P | undefined {
  const weights: Record<string, number> = {};
  for (const p of presets) {
    const w = getAvatarRandomizer(p.family).presets;
    weights[p.id] = w ? (w[p.id] ?? 0) : 1;
  }
  const id = pickWeighted(weights, rng) ?? presets[0]?.id;
  return presets.find((p) => p.id === id);
}

const snap = (c: Extract<AvatarControlState<unknown>, { kind: 'range' }>, v: number) => {
  const x = Math.min(c.max, Math.max(c.min, v));
  return +(c.min + Math.round((x - c.min) / c.step) * c.step).toFixed(6);
};

const parseKey = (k: string | number | boolean): unknown => (k === 'true' ? true : k === 'false' ? false : k);

/** One control value under `rule` (`undefined` = keep). Always valid for the control. */
export function rollAvatarControl(c: AvatarControlState<unknown>, rule: AvatarRandomRule, rng: AvatarRng): unknown {
  if (c.randomize === false || rule === 'pin') return undefined;
  if ('value' in rule) return rule.value;
  switch (c.kind) {
    case 'range': {
      const base = typeof c.value === 'number' ? c.value : (c.min + c.max) / 2;
      if ('range' in rule) {
        const [lo, hi] = rule.range;
        if (rule.dist === 'gaussian') {
          const mu = Math.min(hi, Math.max(lo, base));
          return snap(c, Math.min(hi, Math.max(lo, mu + normal(rng) * (rule.sd ?? (hi - lo) / 4))));
        }
        return snap(c, lo + rng() * (hi - lo));
      }
      if ('jitter' in rule) return snap(c, base + (rng() * 2 - 1) * rule.jitter * (c.max - c.min));
      if ('choices' in rule) {
        const v = Number(parseKey(pickWeighted(Array.isArray(rule.choices) ? rule.choices.map(String) : (rule.choices as Record<string, number>), rng) ?? base));
        return snap(c, Number.isFinite(v) ? v : base);
      }
      return undefined;
    }
    case 'toggle':
      if ('chance' in rule) return rng() < rule.chance;
      if ('choices' in rule) {
        const k = pickWeighted(Array.isArray(rule.choices) ? rule.choices.map(String) : (rule.choices as Record<string, number>), rng);
        return k === undefined ? undefined : parseKey(k) === true;
      }
      return undefined;
    case 'select': {
      if (!('choices' in rule)) return undefined;
      const valid = new Set(c.options.map((o) => String(o.value)));
      const raw = Array.isArray(rule.choices) ? rule.choices.map(String) : rule.choices;
      const filtered = Array.isArray(raw) ? raw.filter((k) => valid.has(k)) : Object.fromEntries(Object.entries(raw as Record<string, number>).filter(([k]) => valid.has(k)));
      const k = pickWeighted(filtered as Record<string, number> | string[], rng);
      return k === undefined ? undefined : c.options.find((o) => String(o.value) === k)!.value;
    }
    case 'color':
      if ('palette' in rule) return pickWeighted(rule.palette as Record<string, number> | string[], rng)?.toLowerCase();
      if ('hsl' in rule) {
        const r = (b: Band) => b[0] + rng() * (b[1] - b[0]);
        return hslToHex({ h: r(rule.hsl.h), s: r(rule.hsl.s), l: r(rule.hsl.l) });
      }
      return undefined;
  }
}

export interface AvatarRollInput {
  family: string;
  /** starting atoms (atom id → variant id); `{}` for families without atoms */
  atoms: Record<string, string>;
  /** visible control states (values = baseline) for atoms + already-rolled values */
  resolve(atoms: Record<string, string>, values: Record<string, unknown>): readonly AvatarControlState<any>[];
  seed?: number;
  /** defaults to the family's registered spec */
  spec?: AvatarRandomizerSpec;
}

export interface AvatarRollResult {
  seed: number;
  atoms: Record<string, string>;
  /** control path → value, in control order (apply in order) */
  values: Record<string, unknown>;
}

function rollOnce(input: AvatarRollInput, spec: AvatarRandomizerSpec, rng: AvatarRng): AvatarRollDraft {
  const { family } = input;
  const atoms = { ...input.atoms };
  for (const [atom, rule0] of Object.entries(spec.atoms ?? {})) {
    if (!(atom in atoms)) continue;
    const rule = typeof rule0 === 'function' ? rule0(atoms, rng) : rule0;
    if (rule === 'pin') continue;
    const valid = new Set(listAvatarAtomVariants(atom, family).map((v) => v.id));
    const id = pickWeighted(Object.fromEntries(Object.entries(rule).filter(([k]) => valid.has(k))), rng);
    if (id) atoms[atom] = id;
  }
  const others: AvatarRandomRule = spec.others ?? { jitter: 0.06 };
  const values: Record<string, unknown> = {};
  const done = new Set<string>();
  let baseline = new Map<string, AvatarControlState<any>>();
  const pass = () => {
    const states = input.resolve(atoms, values);
    baseline = new Map(states.map((c) => [c.path, c]));
    for (const c of states) {
      if (done.has(c.path)) continue;
      done.add(c.path);
      const v = rollAvatarControl(c, spec.controls?.[c.path] ?? others, rng);
      if (v !== undefined && v !== c.value) values[c.path] = v;
    }
    // drop values of controls a `when` now hides
    for (const p of Object.keys(values)) if (!baseline.has(p)) delete values[p];
  };
  pass();
  pass(); // controls revealed by rolled toggles
  const draft: AvatarRollDraft = {
    family,
    atoms,
    values,
    get: <T>(path: string) => (path in values ? values[path] : baseline.get(path)?.value) as T,
  };
  spec.derive?.(draft, rng);
  const extra = spec.custom?.(rng, draft);
  if (extra) {
    Object.assign(draft.atoms, extra.atoms);
    Object.assign(draft.values, extra.values);
  }
  // keep derived / custom values valid too
  for (const [p, v] of Object.entries(draft.values)) {
    const c = baseline.get(p);
    if (!c || c.randomize === false) delete draft.values[p];
    else if (c.kind === 'range' && typeof v === 'number') draft.values[p] = snap(c, v);
    else if (c.kind === 'select' && !c.options.some((o) => o.value === v)) delete draft.values[p];
  }
  return draft;
}

/** Roll a family's randomizer from a starting point. Deterministic for a given `seed`. */
export function rollAvatar(input: AvatarRollInput): AvatarRollResult {
  const spec = input.spec ?? getAvatarRandomizer(input.family);
  const seed = input.seed ?? newAvatarSeed();
  const rng = createAvatarRng(seed);
  const tries = Math.max(1, spec.maxTries ?? 12);
  let draft = rollOnce(input, spec, rng);
  for (let i = 1; i < tries && spec.reject?.(draft); i++) draft = rollOnce(input, spec, rng);
  // control order (stable application, e.g. shade before accent)
  const order = input.resolve(draft.atoms, draft.values).map((c) => c.path);
  const values: Record<string, unknown> = {};
  for (const p of order) if (p in draft.values && !(p in values)) values[p] = draft.values[p];
  for (const p of Object.keys(draft.values)) if (!(p in values)) values[p] = draft.values[p];
  return { seed, atoms: draft.atoms, values };
}
