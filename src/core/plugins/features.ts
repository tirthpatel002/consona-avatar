import type { AvatarDefinition } from '../types/AvatarDefinition.ts';
import type { ResolvedAvatarDefinition } from '../define/resolveAvatar.ts';
import type { AvatarDefinitionDiff } from '../define/diffAvatar.ts';

/**
 * Definition features: optional, family/renderer-owned slices of a avatar
 * definition (e.g. the Three adapter's `fur`). The generic engine knows none
 * of them; a feature plugs in its own defaults, "is resolved" check and diff.
 * Features add their fields to `AvatarDefinition` / `ResolvedAvatarDefinition`
 * / `AvatarDefinitionDiff` / `AvatarDiffTween` by TypeScript module
 * augmentation, and their studio controls via `registerAvatarControl`.
 */
export interface AvatarFeature {
  id: string;
  /** Fields to merge into the resolved definition (defaults filled). */
  resolve?(def: AvatarDefinition): Partial<ResolvedAvatarDefinition>;
  /** True when `def` already carries this feature's resolved fields. */
  isResolved?(def: AvatarDefinition | ResolvedAvatarDefinition): boolean;
  /** Write tweens / flags into `out`; return true if anything changed that is not a tween. */
  diff?(prev: AvatarDefinition, next: AvatarDefinition, out: AvatarDefinitionDiff): boolean;
}

const features = new Map<string, AvatarFeature>();

/** Register (or replace) a definition feature. Register before defining avatars that use it. */
export function registerAvatarFeature(feature: AvatarFeature): void {
  features.set(feature.id, feature);
}

export function listAvatarFeatures(): AvatarFeature[] {
  return Array.from(features.values());
}
