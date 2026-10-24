/** Avatar definition diff: classify what a change needs (tween in place vs. swap a part vs. rebuild). */
import type { ColorLike, AvatarDefinition } from '../types/AvatarDefinition.ts';
import { listAvatarFeatures } from '../plugins/features.ts';
import { DEFAULT_EYES } from '../face/eyes.ts';

// ---------------- definition diff ----------------

/** Deep equality for definition data; functions compare by reference. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Numeric/colour fields that tween in place (features add theirs by module augmentation). */
export interface AvatarDiffTween {
  bodyColor?: ColorLike;
  bodyScale?: number;
}

export interface AvatarDefinitionDiff {
  /** Numeric/colour fields that tween in place. */
  tween: AvatarDiffTween;
  preset?: string;
  jelly: boolean;
  /** Gaze options changed (applied live). */
  gaze: boolean;
  /** Body shape/params changed → morph the shared body geometry. */
  body: boolean;
  /** Eye anchor moved / resized (the eyes glide to their new place). */
  anchor: boolean;
  /** Eyes: 'tune' = numbers/colours (tween), 'shape' = shape switch (blink-through, same meshes). */
  eyes: 'none' | 'tune' | 'shape';
  accessories: boolean;
  behaviors: boolean;
  id: boolean;
  /** Needs a new rig (only a GLB model change). */
  rig: boolean;
  /** Anything at all changed. */
  changed: boolean;
}

const omit = <T extends object>(o: T | undefined | false, keys: readonly string[]) => {
  if (!o) return o;
  const r: Record<string, unknown> = { ...(o as Record<string, unknown>) };
  keys.forEach((k) => delete r[k]);
  return r;
};

/** Classify what changed between two definitions of the same avatar (everything but a GLB model change is in place). */
export function diffAvatarDefinitions(prev: AvatarDefinition, next: AvatarDefinition): AvatarDefinitionDiff {
  const d: AvatarDefinitionDiff = { tween: {}, jelly: false, gaze: false, body: false, anchor: false, eyes: 'none', accessories: false, behaviors: false, id: false, rig: false, changed: false };
  const t = d.tween;
  if (!sameValue(prev.body.color, next.body.color)) t.bodyColor = next.body.color;
  if ((prev.body.scale ?? 1) !== (next.body.scale ?? 1)) t.bodyScale = next.body.scale ?? 1;
  d.body = !sameValue(omit(prev.body, ['color', 'scale', 'colorRef']), omit(next.body, ['color', 'scale', 'colorRef']));

  let featureChanged = false;
  for (const f of listAvatarFeatures()) if (f.diff?.(prev, next, d)) featureChanged = true;
  d.rig = !sameValue(prev.model, next.model);

  d.anchor = !sameValue(prev.anchor, next.anchor);
  const pe = prev.eyes ?? {};
  const ne = next.eyes ?? {};
  d.eyes = (pe.shape ?? DEFAULT_EYES.shape) !== (ne.shape ?? DEFAULT_EYES.shape) ? 'shape' : !sameValue(pe, ne) ? 'tune' : 'none';
  d.accessories = !sameValue(prev.accessories ?? [], next.accessories ?? []);
  d.jelly = !sameValue(prev.jelly, next.jelly);
  d.gaze = !sameValue(prev.gaze, next.gaze);
  d.behaviors = !sameValue(prev.behaviors, next.behaviors);
  d.id = prev.id !== next.id;
  if (prev.preset !== next.preset && next.preset) d.preset = next.preset;
  d.changed =
    d.rig || d.body || featureChanged || d.anchor || d.eyes !== 'none' || d.accessories || d.jelly || d.gaze || d.behaviors || d.id || !!d.preset || Object.keys(t).length > 0;
  return d;
}
