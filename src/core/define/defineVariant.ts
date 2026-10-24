import type { AvatarAtomVariant, AvatarDraft } from '../catalog/catalog.ts';
import { setPath } from '../controls/controls.ts';

/**
 * Variants are ONE concept in core: a `DefinedVariant` IS a catalog
 * `AvatarAtomVariant` (atom = `kind`, e.g. 'eyes.shape'), so scene-graph
 * avatars (Consona) and body avatars (Allie) share the catalog / composer
 * vocabulary. Applying it writes `id` at the `kind` path of the draft.
 */
export interface VariantMeta {
  label?: string;
  description?: string;
  group?: string;
}

export interface DefinedVariant<T extends string = string> extends AvatarAtomVariant {
  id: T;
  /** Atom kind / channel path (same as `atom`). */
  kind: string;
  meta?: VariantMeta;
  /** Optional geometry payload (e.g. path builder key) */
  data?: Record<string, unknown>;
}

export function defineVariant<T extends string>(
  kind: string,
  id: T,
  meta?: VariantMeta,
  data?: Record<string, unknown>
): DefinedVariant<T> {
  const v: DefinedVariant<T> = {
    id,
    kind,
    meta,
    data,
    atom: kind,
    name: meta?.label ?? id,
    apply(draft: AvatarDraft) {
      draft.def = setPath(draft.def, kind, id);
    },
  };
  if (meta?.group !== undefined) v.group = meta.group;
  if (meta?.description !== undefined) v.description = meta.description;
  return v;
}
