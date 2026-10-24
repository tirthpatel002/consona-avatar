import type { AvatarDefinition, AvatarRendererId } from '../types/AvatarDefinition.ts';
import type { ResolvedAvatarDefinition } from '../define/resolveAvatar.ts';
import { isResolvedAvatar } from '../define/resolveAvatar.ts';
import { defineAvatar } from '../define/defineAvatar.ts';
import { composeAvatar, getAvatarFamily, getAvatarPreset } from './catalog.ts';

/** What to show: any mix of a family, a catalog preset, atom picks and definition overrides. */
export interface AvatarSourceInput {
  family?: string;
  preset?: string;
  /** Atom picks layered on the preset's composition (`{ eyes: 'button' }`). */
  composition?: Record<string, string>;
  /** A full definition, or (with `preset`) deep-merged overrides. */
  definition?: AvatarDefinition | ResolvedAvatarDefinition | Partial<AvatarDefinition>;
}

export interface AvatarSource {
  family: string | undefined;
  renderer: AvatarRendererId;
  /** Resolved definition for runtime (definition-driven) families; null for config-driven ones (Consona). */
  definition: ResolvedAvatarDefinition | null;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function mergeDeep<T>(base: T, over: unknown): T {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = mergeDeep(out[k], v);
  return out as T;
}

/**
 * Resolve `<Avatar>` inputs to a renderer + definition. The renderer comes from
 * the registered family (`AvatarFamily.renderer`); without a family it is the
 * definition's own `renderer`, else 'three' for definitions and 'svg' otherwise.
 */
export function resolveAvatarSource(input: AvatarSourceInput): AvatarSource {
  const preset = input.preset ? getAvatarPreset(input.preset) : undefined;
  if (input.preset && !preset) throw new Error(`Unknown avatar preset "${input.preset}"`);
  const def = input.definition as Partial<AvatarDefinition> | undefined;
  const family = input.family ?? preset?.family ?? def?.family;
  const renderer = (family && getAvatarFamily(family)?.renderer) ?? def?.renderer ?? (def || preset ? 'three' : 'svg');
  let base: ResolvedAvatarDefinition | null = null;
  if (preset) {
    base = preset.definition;
    if (preset.composition && input.composition && Object.keys(input.composition).length) {
      base = composeAvatar({ ...preset.composition, atoms: { ...preset.composition.atoms, ...input.composition } });
    }
  }
  let definition: ResolvedAvatarDefinition | null = base;
  if (def) {
    if (!base) definition = isResolvedAvatar(def as AvatarDefinition) ? (def as ResolvedAvatarDefinition) : defineAvatar(def as AvatarDefinition);
    else definition = defineAvatar(mergeDeep(base, def) as AvatarDefinition);
  }
  return { family, renderer, definition };
}
