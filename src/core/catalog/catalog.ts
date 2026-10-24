import type { AvatarRendererId, ColorLike, AvatarDefinition } from '../types/AvatarDefinition.ts';
import type { ResolvedAvatarDefinition } from '../define/resolveAvatar.ts';
import { isResolvedAvatar } from '../define/resolveAvatar.ts';
import { defineAvatar } from '../define/defineAvatar.ts';
import type { AvatarControl } from '../controls/controls.ts';
import { applyAvatarOverrides } from '../controls/controls.ts';
import type { IAtom } from '../scenegraph/AtomNode.ts';
import { ScopedRegistry } from '../registry/ScopedRegistry.ts';

/**
 * Avatar catalog — the discovery surface for studios / pickers.
 * Avatar packages register families and presets; tools list them and
 * subscribe to changes. Holds no character content itself.
 */

export interface AvatarFamily {
  id: string;
  name: string;
  /** Renderer the family's avatars need ('svg', 'three', …). */
  renderer?: AvatarRendererId;
  description?: string;
  /** Sort order in pickers (default 0, then name). */
  order?: number;
  /**
   * Lazy loader for the family's renderer-side package (e.g. its Three.js
   * surfaces / rig / accessories). Run once by `installAvatarFamily` before the
   * first avatar of this family renders, so data-only consumers never load it.
   */
  install?: () => Promise<unknown>;
  /** Plugin ids its avatars may `use()` (ids only); content stays in the plugin. */
  plugins?: readonly string[];
}

export interface AvatarPreset {
  id: string;
  name: string;
  family: string;
  definition: ResolvedAvatarDefinition;
  /** Swatch colour for pickers (default: body colour). */
  color: ColorLike;
  description?: string;
  tags?: string[];
  /** Extra preset-specific controls appended to the generic schema. */
  controls?: AvatarControl[];
  /** Atom composition this preset was built from (enables the studio composer). */
  composition?: AvatarComposition;
}

export interface AvatarPresetInput extends Omit<AvatarPreset, 'definition' | 'color' | 'name' | 'id' | 'composition'> {
  /** Either a definition, or an atom composition (see `composeAvatar`). */
  definition?: AvatarDefinition | ResolvedAvatarDefinition;
  composition?: AvatarComposition;
  id?: string;
  name?: string;
  color?: ColorLike;
}

// ---------- atoms ----------

/** An atom kind (e.g. 'body', 'eyes', 'preset'); applied in `order`. */
export interface AvatarAtom {
  id: string;
  name: string;
  order: number;
  description?: string;
  /** Family this atom kind belongs to (omit = shared by every family). A family's own atom shadows a shared one of the same id. */
  family?: string;
  /** Scene-graph renderable this atom kind maps to (scene-graph families, e.g. Consona's `consonaEyesAtom`). */
  node?: IAtom;
}

/** Mutable draft that atom variants write into while composing. */
export interface AvatarDraft {
  def: Partial<AvatarDefinition>;
  /** Cross-atom data (e.g. a body's designed preset, read by later atoms). */
  meta: Record<string, unknown>;
}

export interface AvatarAtomVariant {
  atom: string;
  id: string;
  name: string;
  /** Grouping inside the atom (e.g. 'Classic', 'Threadies'). */
  group?: string;
  /**
   * Family this variant belongs to. Pickers show a family's own variants for
   * an atom when it has any, else the shared (family-less) ones.
   */
  family?: string;
  swatch?: ColorLike;
  description?: string;
  tags?: string[];
  /** Tiny picker icon (renderer-agnostic); a function is evaluated lazily, once (`getAvatarAtomVariantIcon`). */
  icon?: AvatarIcon | (() => AvatarIcon);
  apply(draft: AvatarDraft, composition: AvatarComposition): void;
}

/**
 * Renderer-agnostic picker icon: SVG path data in a view box. `fill` names a
 * role the UI tints: 'feature' (e.g. eye colour), 'outline' (e.g. body shade
 * ring behind the feature), 'body' (the current body colour).
 */
export interface AvatarIcon {
  viewBox: readonly [x: number, y: number, w: number, h: number];
  paths: readonly { d: string; fill: 'feature' | 'outline' | 'body' }[];
}

const iconCache = new WeakMap<AvatarAtomVariant, AvatarIcon | null>();
/** A variant's icon (lazy icons computed once per variant). */
export function getAvatarAtomVariantIcon(variant: AvatarAtomVariant): AvatarIcon | undefined {
  if (!variant.icon) return undefined;
  if (typeof variant.icon !== 'function') return variant.icon;
  let hit = iconCache.get(variant);
  if (hit === undefined) {
    try {
      hit = variant.icon();
    } catch {
      hit = null;
    }
    iconCache.set(variant, hit);
  }
  return hit ?? undefined;
}

/** Selection of one variant per atom (+ optional overrides applied last). */
export interface AvatarComposition {
  /** Family whose atoms / variants resolve first (falls back to shared ones). Presets set it from their family. */
  family?: string;
  id?: string;
  name?: string;
  atoms: Record<string, string>;
  /** Control-path overrides (see `applyAvatarOverrides`), e.g. { 'body.color': '#f00', preset: 'love' }. */
  overrides?: Record<string, unknown>;
}

export interface AvatarCatalogSnapshot {
  version: number;
  families: AvatarFamily[];
  presets: AvatarPreset[];
  atoms: AvatarAtom[];
  variants: AvatarAtomVariant[];
}

const families = new ScopedRegistry<AvatarFamily>();
const presets = new ScopedRegistry<AvatarPreset>();
/** Atoms are scoped by family (shared atoms live in the global scope). */
const atoms = new ScopedRegistry<AvatarAtom>();
/** Variants are keyed by (family, atom, id): scope `family/atom` (shared: `/atom`). */
const variants = new ScopedRegistry<AvatarAtomVariant>();
const variantScope = (atom: string, family?: string) => `${family ?? ''}/${atom}`;
const listeners = new Set<() => void>();
let snapshot: AvatarCatalogSnapshot = { version: 0, families: [], presets: [], atoms: [], variants: [] };

const byOrder = (a: AvatarFamily, b: AvatarFamily) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);

function changed(): void {
  snapshot = {
    version: snapshot.version + 1,
    families: families.values().sort(byOrder),
    presets: presets.values(),
    atoms: atoms.entriesAll().map((e) => e.value).sort((a, b) => a.order - b.order),
    variants: variants.entriesAll().map((e) => e.value),
  };
  listeners.forEach((l) => l());
}

export function registerAvatarFamily(family: AvatarFamily): void {
  families.set(family.id, { ...family });
  changed();
}

/** Register (or replace) a preset. Unknown families are auto-created. */
export function registerAvatarPreset(input: AvatarPresetInput): AvatarPreset {
  const composition = input.composition ? { ...input.composition, family: input.composition.family ?? input.family } : undefined;
  const definition = composition
    ? composeAvatar(composition)
    : input.definition
      ? isResolvedAvatar(input.definition)
        ? input.definition
        : defineAvatar(input.definition)
      : (() => {
          throw new Error('registerAvatarPreset: `definition` or `composition` is required');
        })();
  const preset: AvatarPreset = {
    ...input,
    composition,
    id: input.id ?? definition.id,
    name: input.name ?? definition.name ?? definition.id,
    color: input.color ?? definition.body.color,
    definition,
  };
  if (!families.has(preset.family)) families.set(preset.family, { id: preset.family, name: preset.family });
  presets.set(preset.id, preset);
  changed();
  return preset;
}

export function unregisterAvatarPreset(id: string): void {
  if (presets.delete(id)) changed();
}

export function listAvatarFamilies(): AvatarFamily[] {
  return snapshot.families;
}

export function listAvatarPresets(family?: string): AvatarPreset[] {
  return family ? snapshot.presets.filter((p) => p.family === family) : snapshot.presets;
}

export function getAvatarFamily(id: string): AvatarFamily | undefined {
  return families.get(id);
}

const installs = new Map<() => Promise<unknown>, Promise<void>>();
const installedFamilies = new Set<string>();
const loadedLoaders = new Set<() => Promise<unknown>>();
/** Whether a family's renderer-side package is loaded (always true without an `install` loader). */
export function isAvatarFamilyInstalled(id: string): boolean {
  const f = families.get(id);
  return !f?.install || installedFamilies.has(id) || loadedLoaders.has(f.install);
}
/** Load a family's renderer-side package once (see `AvatarFamily.install`); resolves immediately when there is none. */
export function installAvatarFamily(id: string): Promise<void> {
  const f = families.get(id);
  if (!f?.install) return Promise.resolve();
  const loader = f.install;
  let p = installs.get(loader);
  if (!p) {
    p = loader().then(() => {
      loadedLoaders.add(loader);
    });
    p.catch(() => installs.delete(loader));
    installs.set(loader, p);
  }
  return p.then(() => {
    installedFamilies.add(id);
  });
}

export function getAvatarPreset(id: string): AvatarPreset | undefined {
  return presets.get(id);
}

/** Immutable snapshot (stable identity between changes — usable with useSyncExternalStore). */
export function getAvatarCatalog(): AvatarCatalogSnapshot {
  return snapshot;
}

export function registerAvatarAtom(atom: AvatarAtom): void {
  atoms.set(atom.id, { ...atom }, atom.family);
  changed();
}

export function registerAvatarAtomVariant(variant: AvatarAtomVariant): void {
  // auto-create the atom kind only when no family declared it
  if (!atoms.entriesAll().some((e) => e.name === variant.atom)) atoms.set(variant.atom, { id: variant.atom, name: variant.atom, order: atoms.size, family: variant.family }, variant.family);
  variants.set(variant.id, variant, variantScope(variant.atom, variant.family));
  changed();
}

/** Atom kinds visible to `family` (its own + shared, own shadowing shared), in `order`. No family = every atom of every family. */
export function listAvatarAtoms(family?: string): AvatarAtom[] {
  if (family === undefined) return snapshot.atoms;
  return atoms.values(family).sort((a, b) => a.order - b.order);
}

/** A family's own variants for `atom` when it has any, else the shared ones. No family = every variant of that atom. */
export function listAvatarAtomVariants(atom: string, family?: string): AvatarAtomVariant[] {
  const all = snapshot.variants.filter((v) => v.atom === atom);
  if (family === undefined) return all;
  const own = all.filter((v) => v.family === family);
  return own.length ? own : all.filter((v) => !v.family);
}

/** Variant `id` of `atom` for `family` (its own, else the shared one). */
export function getAvatarAtomVariant(atom: string, id: string, family?: string): AvatarAtomVariant | undefined {
  return (family ? variants.get(id, variantScope(atom, family)) : undefined) ?? variants.get(id, variantScope(atom));
}

/**
 * Build a definition from atom selections: variants are applied in atom
 * `order` onto an empty draft, the result is validated with `defineAvatar`,
 * then `overrides` are applied.
 */
export function composeAvatar(composition: AvatarComposition): ResolvedAvatarDefinition {
  const draft: AvatarDraft = { def: {}, meta: {} };
  const ordered = Object.entries(composition.atoms)
    .map(([atom, id]) => ({ atom: atoms.get(atom, composition.family) ?? atoms.entriesAll().find((e) => e.name === atom)?.value, variant: getAvatarAtomVariant(atom, id, composition.family) ?? anyFamilyVariant(atom, id), atomId: atom, id }))
    .sort((a, b) => (a.atom?.order ?? 0) - (b.atom?.order ?? 0));
  for (const o of ordered) {
    if (!o.variant) throw new Error(`composeAvatar: unknown ${o.atomId} variant "${o.id}"`);
    o.variant.apply(draft, composition);
  }
  const atomIds = ordered.map((o) => o.id).join('+');
  draft.def.id = composition.id ?? draft.def.id ?? atomIds;
  if (composition.name) draft.def.name = composition.name;
  const def = defineAvatar(draft.def as AvatarDefinition);
  return composition.overrides ? applyAvatarOverrides(def, composition.overrides) : def;
}

/** A variant registered under another family (compositions without `family`, e.g. ad-hoc tests). */
function anyFamilyVariant(atom: string, id: string): AvatarAtomVariant | undefined {
  return variants.entriesAll().find((e) => e.name === id && e.value.atom === atom)?.value;
}

export function subscribeAvatarCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
