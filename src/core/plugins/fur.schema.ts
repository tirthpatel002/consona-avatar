/**
 * Fur / knit surface feature of the Three.js avatar renderer — schema,
 * defaults, studio controls and definition diff. Renderer-agnostic data (no
 * `three` import) so avatar packages can author `fur` without loading Three;
 * the shell renderer itself lives in `./fur.ts`. Importing this module
 * registers the feature with the core avatar engine (`registerAvatarFeature`).
 */
import { registerAvatarFeature } from '../plugins/features.ts';
import { AVATAR_CONTROL_ORDER, registerAvatarControl } from '../controls/controls.ts';
import type { AvatarControl } from '../controls/controls.ts';
import { listAvatarOptions } from '../registry/options.ts';
import { sameValue } from '../define/diffAvatar.ts';
import type { ResolvedAvatarDefinition } from '../define/resolveAvatar.ts';
import { GLOBAL_SCOPE, ScopedRegistry } from '../registry/ScopedRegistry.ts';

export interface AvatarFurOptions {
  /** Fur strand length in body units (default 0.09). */
  length?: number;
  /** Number of shells (default 26). More = denser, more expensive. */
  shells?: number;
  /** Knit bump pattern under the fur (default true). */
  knit?: boolean;
  bumpScale?: number;
  /** Strand texture repeat (default [36, 22]). */
  strandRepeat?: [number, number];
  /** Root darkening (fake AO), 0..1 (default 0.55). */
  rootShade?: number;
  /** Surface pattern (registered with `registerSurfacePattern`; default 'knit'). */
  pattern?: string;
  /** Pattern texture repeat (default: pattern's own). */
  patternRepeat?: [number, number];
  /** Darken pattern grooves in the albedo, 0..1 (default 0). */
  patternShade?: number;
  /** Strand coverage 0..1 (default 1). Lower = sparser, shaggier fur. */
  density?: number;
  /** Gravity droop of the strands (default 2). */
  droop?: number;
  /**
   * Surface regions (body-group space ellipsoids, up to 4) with their own fur
   * length scale and a lighter tint of the body colour, e.g. a short-fur face
   * cutout or a belly patch. Default none.
   */
  regions?: FurRegion[];
}

/** A fur surface region: points within the ellipsoid (`center`, `radii`) get `length`× fur and `lighten` toward white. */
export interface FurRegion {
  center: [number, number, number];
  radii: [number, number, number];
  /** Edge softness as a fraction of the radius (default 0.15). */
  soft?: number;
  /** 0..1 mix of the body colour toward white (default 0). */
  lighten?: number;
  /** Fur length scale inside the region (default 1). */
  length?: number;
}

/** Neutral fur-shell defaults (families install their own look via `configureFurShells`). */
export const DEFAULT_FUR: Required<AvatarFurOptions> = {
  length: 0.09,
  shells: 26,
  knit: true,
  bumpScale: 1.2,
  strandRepeat: [36, 22],
  rootShade: 0.55,
  pattern: '',
  patternRepeat: [28, 16],
  patternShade: 0,
  density: 1,
  droop: 2,
  regions: [],
};

/** Look parameters of the generic fur-shells part (owned by the family, e.g. `avatars/allie/allie.fur.ts`). */
export interface FurShellStyle {
  /** Resolved defaults for `def.fur`. */
  defaults: Required<AvatarFurOptions>;
  /** Rendered strand length = `fur.length * lengthBoost`. */
  lengthBoost: number;
  /** Strand coverage multiplier. */
  densityBoost: number;
}

const NEUTRAL_STYLE: FurShellStyle = { defaults: DEFAULT_FUR, lengthBoost: 1, densityBoost: 1 };
const styles = new ScopedRegistry<FurShellStyle>().set('style', NEUTRAL_STYLE);

/**
 * Install a family's fur look (defaults + boosts), scoped to that family.
 * `configureFurShells(style)` (no family) changes the global fallback.
 */
export function configureFurShells(family: string | undefined, next: Partial<FurShellStyle>): void;
export function configureFurShells(next: Partial<FurShellStyle>): void;
export function configureFurShells(a: string | undefined | Partial<FurShellStyle>, b?: Partial<FurShellStyle>): void {
  const family = typeof a === 'string' ? a : undefined;
  const next = (typeof a === 'object' ? a : b) ?? {};
  const scope = family ?? GLOBAL_SCOPE;
  const cur = (family ? styles.get('style', family) : undefined) ?? styles.get('style')!;
  styles.set('style', { ...cur, ...next }, scope);
}

let activeFamily: string | undefined;
/** Run `fn` with `family` as the fur family for builds that don't receive it (e.g. accessory `makeFurry`). */
export function withFurFamily<T>(family: string | undefined, fn: () => T): T {
  const prev = activeFamily;
  activeFamily = family;
  try {
    return fn();
  } finally {
    activeFamily = prev;
  }
}

/** Fur-shell style of a family (falls back to the global one; do not mutate). Defaults to the active build family. */
export function furShellStyle(family: string | undefined = activeFamily): Readonly<FurShellStyle> {
  return (family ? styles.get('style', family) : undefined) ?? styles.get('style')!;
}

declare module '../types/AvatarDefinition.ts' {
  interface AvatarDefinition {
    /** Fur shells (Three adapter fur feature). `false` renders a plain (non-shell) body. */
    fur?: AvatarFurOptions | false;
  }
}
declare module '../define/resolveAvatar.ts' {
  interface ResolvedAvatarDefinition {
    fur: Required<AvatarFurOptions> | false;
  }
}
declare module '../define/diffAvatar.ts' {
  interface AvatarDiffTween {
    furLength?: number;
    furDensity?: number;
    /** Visible shell layers (0 = fur off). */
    furShells?: number;
    furRootShade?: number;
    furDroop?: number;
    furPatternShade?: number;
    furBumpScale?: number;
  }
  interface AvatarDefinitionDiff {
    /** Yarn pattern (or its repeat) changed → crossfade inside the fur materials. */
    furPattern?: boolean;
    /** Strand noise repeat changed → texture swap on the same materials. */
    furStrands?: boolean;
    /** Fur regions changed → uniform update on commit. */
    furRegions?: boolean;
  }
}

type FurLike = { length?: number; density?: number; shells?: number; rootShade?: number; droop?: number; patternShade?: number; bumpScale?: number; knit?: boolean; pattern?: string; patternRepeat?: unknown; strandRepeat?: unknown };

registerAvatarFeature({
  id: 'fur',
  resolve: (def) => ({ fur: def.fur === false ? false : { ...furShellStyle(def.family).defaults, ...(def.fur ?? {}) } }),
  isResolved: (def) => def.fur !== undefined,
  diff(prev, next, d) {
    const t = d.tween;
    d.furPattern = false;
    d.furStrands = false;
    d.furRegions = !sameValue((prev.fur || null)?.regions ?? [], (next.fur || null)?.regions ?? []);
    const pf = (prev.fur || null) as FurLike | null;
    const nf = (next.fur || null) as FurLike | null;
    const num = (f: FurLike | null, k: keyof FurLike, dflt: number) => (f ? ((f[k] as number | undefined) ?? dflt) : undefined);
    const shells = (f: FurLike | null) => (f ? (f.shells ?? 26) : 0);
    if (shells(pf) !== shells(nf)) t.furShells = shells(nf);
    if (pf && nf) {
      if (num(pf, 'length', 0.09) !== num(nf, 'length', 0.09)) t.furLength = num(nf, 'length', 0.09);
      if (num(pf, 'density', 1) !== num(nf, 'density', 1)) t.furDensity = num(nf, 'density', 1);
    } else if (nf) {
      t.furLength = num(nf, 'length', 0.09);
      t.furDensity = num(nf, 'density', 1);
    }
    const knitScale = (f: FurLike | null) => (f && f.knit !== false ? (f.bumpScale ?? 1.2) : 0);
    const patShade = (f: FurLike | null) => (f && f.knit !== false ? (f.patternShade ?? 0) : 0);
    if (knitScale(pf) !== knitScale(nf)) t.furBumpScale = knitScale(nf);
    if (patShade(pf) !== patShade(nf)) t.furPatternShade = patShade(nf);
    if (nf && num(pf, 'rootShade', 0.55) !== num(nf, 'rootShade', 0.55)) t.furRootShade = num(nf, 'rootShade', 0.55);
    if (nf && num(pf, 'droop', 2) !== num(nf, 'droop', 2)) t.furDroop = num(nf, 'droop', 2);
    if (nf) {
      d.furPattern = (pf?.pattern ?? 'knit') !== (nf.pattern ?? 'knit') || !sameValue(pf?.patternRepeat, nf.patternRepeat);
      d.furStrands = !sameValue(pf?.strandRepeat, nf.strandRepeat);
    }
    return d.furPattern || d.furStrands || d.furRegions;
  },
});

const hasFur = (d: ResolvedAvatarDefinition) => d.fur !== false;
/** Knit-shell controls only for families whose fur style is knitted (plush families may set `knit: false`). */
const knitFamily = (d: ResolvedAvatarDefinition) => furShellStyle(d.family).defaults.knit !== false;
const hasKnitFur = (d: ResolvedAvatarDefinition) => hasFur(d) && knitFamily(d);

registerAvatarControl(
  () => [
    {
      kind: 'toggle',
      path: 'fur',
      label: 'Fur',
      group: 'Fur',
      randomize: false,
      when: knitFamily,
      get: (d) => d.fur !== false,
      set: (d, v) => ({ ...d, fur: v ? (d.fur === false ? { ...furShellStyle(d.family).defaults } : d.fur) : false }),
    },
    { kind: 'range', path: 'fur.length', label: 'Fur length', group: 'Fur', min: 0, max: 0.25, step: 0.005, when: hasFur },
    { kind: 'range', path: 'fur.shells', label: 'Shells', group: 'Fur', min: 2, max: 48, step: 1, randomize: false, when: hasKnitFur },
    { kind: 'toggle', path: 'fur.knit', label: 'Pattern bump', group: 'Fur', when: hasKnitFur },
    ...(listAvatarOptions('surfacePattern').length
      ? [{ kind: 'select', path: 'fur.pattern', label: 'Pattern', group: 'Fur', when: hasKnitFur, options: listAvatarOptions('surfacePattern').map((p) => ({ value: p, label: p })) } as AvatarControl]
      : []),
    { kind: 'range', path: 'fur.patternShade', label: 'Pattern shade', group: 'Fur', min: 0, max: 1, step: 0.05, when: hasKnitFur },
    { kind: 'range', path: 'fur.density', label: 'Density', group: 'Fur', min: 0.2, max: 1, step: 0.02, when: hasKnitFur },
    { kind: 'range', path: 'fur.droop', label: 'Droop', group: 'Fur', min: 0, max: 8, step: 0.1, when: hasKnitFur },
  ],
  { order: AVATAR_CONTROL_ORDER.surface },
);
