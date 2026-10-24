import type { DefinedAnimation } from './defineAnimation.ts';

function isDefinedAnimation(value: unknown): value is DefinedAnimation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' && typeof v.name !== 'string') return false;
  if (typeof v.duration !== 'number') return false;
  return typeof v.evaluate === 'function' || Array.isArray(v.tracks);
}

/**
 * Collect DefinedAnimation exports from a module namespace (barrel / import * as ns).
 * Skips factories and non-animation values. Last export wins on duplicate id/name
 * (e.g. preset idle overwrites standalone idle).
 */
export function collectDefinedAnimations(ns: Record<string, unknown>): DefinedAnimation[] {
  const byId = new Map<string, DefinedAnimation>();
  for (const value of Object.values(ns)) {
    if (!isDefinedAnimation(value)) continue;
    byId.set(value.id ?? value.name, value);
  }
  return Array.from(byId.values());
}
