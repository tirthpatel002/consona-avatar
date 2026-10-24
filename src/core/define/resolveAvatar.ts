import type { AvatarDefinition, AvatarJellyOptions } from '../types/AvatarDefinition.ts';
import { listAvatarFeatures } from '../plugins/features.ts';
import { DEFAULT_ANCHOR, DEFAULT_EYES } from '../face/eyes.ts';
import type { AvatarEyeAnchor } from '../face/eyes.ts';
import { getAvatarFamilyDefaults } from './familyDefaults.ts';

/** Neutral soft-body tuning (a gentle wobble). Families register their own via `registerAvatarFamilyDefaults`. */
export const DEFAULT_JELLY: Required<AvatarJellyOptions> = { stiffness: 140, damping: 0.3, amount: 0.6, idle: 0.2, poke: 0.8 };

export interface ResolvedAvatarDefinition extends AvatarDefinition {
  anchor: AvatarEyeAnchor;
  eyes: typeof DEFAULT_EYES;
  preset: NonNullable<AvatarDefinition['preset']>;
  jelly: Required<AvatarJellyOptions> | false;
  position: [number, number, number];
}

/**
 * Declare a avatar. Validates required fields and fills defaults so adapters
 * get a fully-resolved definition. Pure data — safe to share across scenes.
 */
export function resolveAvatarDefinition(def: AvatarDefinition): ResolvedAvatarDefinition {
  const fam = getAvatarFamilyDefaults(def.family);
  if (!def.id) throw new Error('defineAvatar: `id` is required');
  if (!def.body?.shape) throw new Error(`defineAvatar(${def.id}): body.shape is required`);
  if (def.body.color === undefined) throw new Error(`defineAvatar(${def.id}): body.color is required`);
  const anchor = { ...DEFAULT_ANCHOR, ...(def.anchor ?? {}) };
  if (!(anchor.width > 0) || !(anchor.height > 0)) throw new Error(`defineAvatar(${def.id}): anchor.width/height must be > 0`);
  // feature fields (e.g. `fur`) are filled by registered features below
  const out = {
    ...def,
    anchor,
    eyes: { ...DEFAULT_EYES, ...(fam.eyes ?? {}), ...(def.eyes ?? {}) },
    preset: def.preset ?? 'neutral',
    jelly:
      def.jelly === false || (fam.jelly === false && def.jelly === undefined)
        ? false
        : { ...(fam.jelly || DEFAULT_JELLY), ...(def.jelly ?? {}) },
    position: def.position ?? [0, -1.7, 0],
  } as ResolvedAvatarDefinition;
  for (const f of listAvatarFeatures()) if (f.resolve) Object.assign(out, f.resolve(def));
  return out;
}

export function isResolvedAvatar(def: AvatarDefinition | ResolvedAvatarDefinition): def is ResolvedAvatarDefinition {
  return Array.isArray(def.position) && def.anchor !== undefined && def.eyes !== undefined && (def.eyes as { shape?: unknown }).shape !== undefined && def.preset !== undefined && def.jelly !== undefined && listAvatarFeatures().every((f) => !f.isResolved || f.isResolved(def));
}
