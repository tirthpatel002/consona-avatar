/**
 * Plush shell-fur feature (`def.plush`) of the Three.js renderer — schema,
 * per-family defaults, studio controls, diff. Renderer-agnostic (no `three`)
 * so avatar packages can author it; the material lives in `./shellFur.ts`.
 * Only families that configured plush defaults resolve `plush` (others —
 * e.g. Allie — never see these controls). Every field is a live shader
 * uniform: edits never rebuild the mesh.
 */
import { registerAvatarFeature } from '../plugins/features.ts';
import { AVATAR_CONTROL_ORDER, registerAvatarControl } from '../controls/controls.ts';
import type { AvatarControl } from '../controls/controls.ts';
import { sameValue } from '../define/diffAvatar.ts';
import type { ResolvedAvatarDefinition } from '../define/resolveAvatar.ts';

export interface ShellFurParams {
  /** Visible shell layers incl. the opaque base (2..MAX_PLUSH_SHELLS). */
  shells: number;
  /** Strands per body unit. */
  strandDensity: number;
  /** Clumps per body unit. */
  clumpScale: number;
  /** Clumping strength 0..1 (length / density contrast between clump centres and gaps). */
  clumping: number;
  /** Strand radius at the tip vs. the root, 0..1 (lower = finer, more tapered tips). */
  taper: number;
  /** Comb lean of the tips along the flow (gravity / tentacle direction), in pile lengths. */
  lean: number;
  /** Tip sway amplitude (body units). */
  wiggle: number;
  /** Root darkness (self-shadow in the pile), 0..1. */
  rootShade: number;
  /** Anisotropic (Kajiya-Kay) sheen strength. */
  sheen: number;
  /** Rim fuzz strength. */
  rim: number;
  /** Tonal mottling amount. */
  mottle: number;
  /** Mottling frequency (blotches per body unit). */
  mottleScale: number;
  /** Per-strand brightness variation, 0..1. */
  strandVariation: number;
  /** Secondary (underside) colour, blended in by the `furTint` attribute. */
  tint: string;
  /** Width of the fibre-blended underside transition, 0..1. */
  tintSoftness: number;
  /** Shifts the underside boundary up (+) / down (−), −0.5..0.5. */
  tintHeight: number;
}

export const MAX_PLUSH_SHELLS = 32;

export const DEFAULT_PLUSH: ShellFurParams = {
  shells: 28,
  strandDensity: 70,
  clumpScale: 9,
  clumping: 0.45,
  taper: 0.2,
  lean: 0.7,
  wiggle: 0.01,
  rootShade: 0.5,
  sheen: 0.16,
  rim: 0.2,
  mottle: 0.12,
  mottleScale: 2.3,
  strandVariation: 0.12,
  tint: '#f0c4b0',
  tintSoftness: 0.5,
  tintHeight: 0,
};

declare module '../types/AvatarDefinition.ts' {
  interface AvatarDefinition {
    /** Plush shell fur look (families with `configurePlushDefaults`). */
    plush?: Partial<ShellFurParams>;
  }
}
declare module '../define/resolveAvatar.ts' {
  interface ResolvedAvatarDefinition {
    plush?: ShellFurParams;
  }
}

const familyDefaults = new Map<string, ShellFurParams>();

/** Declare a family's plush defaults (enables `def.plush` + its studio controls for that family). */
export function configurePlushDefaults(family: string, params: Partial<ShellFurParams>): void {
  familyDefaults.set(family, { ...DEFAULT_PLUSH, ...familyDefaults.get(family), ...params });
}

export function plushDefaults(family?: string): ShellFurParams | undefined {
  return family ? familyDefaults.get(family) : undefined;
}

/** Resolved plush params of a definition (family defaults if unresolved; neutral defaults otherwise). */
export function plushOf(def: ResolvedAvatarDefinition): ShellFurParams {
  return def.plush ?? { ...DEFAULT_PLUSH, ...plushDefaults(def.family), ...((def as { plush?: Partial<ShellFurParams> }).plush ?? {}) };
}

registerAvatarFeature({
  id: 'plush',
  resolve: (def) => {
    const base = plushDefaults(def.family);
    return base ? { plush: { ...base, ...(def.plush ?? {}) } } : {};
  },
  isResolved: (def) => def.plush !== undefined || !plushDefaults(def.family),
  // live uniforms: report a change (so the definition commits) but nothing structural
  diff: (prev, next) => !sameValue(prev.plush ?? null, next.plush ?? null),
});

const has = (d: ResolvedAvatarDefinition) => d.plush !== undefined;
/** Layer count / strand density drive GPU cost: fixed under Randomize. */
const FIXED_UNDER_RANDOMIZE = new Set<keyof ShellFurParams>(['shells', 'strandDensity']);
const range = (key: keyof ShellFurParams, label: string, group: string, min: number, max: number, step: number): AvatarControl => ({
  randomize: !FIXED_UNDER_RANDOMIZE.has(key),
  kind: 'range',
  path: `plush.${key}`,
  label,
  group,
  min,
  max,
  step,
  when: has,
});

registerAvatarControl(
  () => [
    range('shells', 'Layers', 'Fur', 2, MAX_PLUSH_SHELLS, 1),
    range('strandDensity', 'Strands / unit', 'Fur', 20, 160, 1),
    range('taper', 'Strand taper (tip width)', 'Fur', 0.02, 1, 0.01),
    range('clumping', 'Clumping', 'Fur', 0, 1, 0.01),
    range('clumpScale', 'Clump size (per unit)', 'Fur', 2, 30, 0.5),
    range('lean', 'Combing / gravity', 'Fur', 0, 2, 0.01),
    range('wiggle', 'Sway', 'Fur', 0, 0.05, 0.001),
    range('rootShade', 'Root darkness', 'Fur', 0, 1, 0.01),
    range('sheen', 'Sheen (anisotropic)', 'Fur', 0, 1, 0.01),
    range('rim', 'Rim fuzz', 'Fur', 0, 1, 0.01),
    range('mottle', 'Mottling', 'Pattern', 0, 0.5, 0.01),
    range('mottleScale', 'Mottle scale', 'Pattern', 0.5, 10, 0.1),
    range('strandVariation', 'Strand colour variation', 'Pattern', 0, 0.5, 0.01),
    { kind: 'color', path: 'plush.tint', label: 'Underside colour', group: 'Pattern', when: has },
    range('tintSoftness', 'Underside blend softness', 'Pattern', 0, 1, 0.01),
    range('tintHeight', 'Underside height', 'Pattern', -0.5, 0.5, 0.01),
  ],
  { order: AVATAR_CONTROL_ORDER.surface + 1 },
);
