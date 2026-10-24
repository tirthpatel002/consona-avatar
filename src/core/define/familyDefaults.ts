import type { AvatarJellyOptions } from '../types/AvatarDefinition.ts';
import type { ResolvedEyesOptions } from '../face/eyes.ts';
import { ScopedRegistry } from '../registry/ScopedRegistry.ts';

/**
 * Per-family resolution defaults. Core ships neutral defaults
 * (`DEFAULT_EYES`, `DEFAULT_JELLY`); a family registers its own look here and
 * `resolveAvatarDefinition` merges it under `def.eyes` / `def.jelly` for
 * definitions with that `family`.
 */
export interface AvatarFamilyDefaults {
  eyes?: Partial<ResolvedEyesOptions>;
  /** Soft-body tuning (`false` = family default is no jelly). */
  jelly?: Required<AvatarJellyOptions> | false;
  /** Body shape is the family's own geometry (atoms pick it); hides the generic shape picker. */
  fixedBodyShape?: boolean;
}

const registry = new ScopedRegistry<AvatarFamilyDefaults>();

export function registerAvatarFamilyDefaults(family: string, defaults: AvatarFamilyDefaults): void {
  registry.set('defaults', { ...registry.get('defaults', family), ...defaults }, family);
}

/** The family's defaults (empty object for none / unknown). */
export function getAvatarFamilyDefaults(family?: string): AvatarFamilyDefaults {
  return (family ? registry.get('defaults', family) : undefined) ?? {};
}
