import { listPresets } from '../preset/presets.ts';
import type { ColorLike, AvatarDefinition } from '../types/AvatarDefinition.ts';
import type { ResolvedAvatarDefinition } from '../define/resolveAvatar.ts';
import { DEFAULT_JELLY } from '../define/resolveAvatar.ts';
import { getAvatarFamilyDefaults } from '../define/familyDefaults.ts';
import { listAvatarShapes, resolveShape, findAvatarShapeName } from '../scenegraph/bodyShapes.ts';
import { listBehaviors } from '../animation/behaviors.ts';
import { listAvatarOptions } from '../registry/options.ts';
import { DEFAULT_EYES } from '../face/eyes.ts';
import { DEFAULT_GAZE } from '../controllers/gaze.ts';
import type { AvatarGazeOptions } from '../controllers/gaze.ts';

/**
 * Generic control schema for avatar definitions. Studios render controls
 * from `getAvatarControls(def)` and rebuild definitions with
 * `applyAvatarOverrides(base, overrides)` — no per-character UI code.
 * New definition fields get UI by `registerAvatarControl(...)`.
 */

/**
 * A control edits one value of a model `T` — a resolved definition for
 * registry-driven families, or a family's own config (e.g. Consona's
 * `ConsonaAvatarConfig`). Studios render every control the same way.
 */
interface ControlBase<T> {
  /** Stable key; also the default dot path into the model (e.g. 'fur.length'). */
  path: string;
  label: string;
  group: string;
  /** Secondary line (feature cards, option hints). */
  description?: string;
  /** Show only when true for the current model. */
  when?: (model: T) => boolean;
  /** `false` = Randomize leaves it alone (scale, behaviour switches, perf-heavy counts). */
  randomize?: boolean;
  /** Custom read (default: dot-path get). */
  get?: (model: T) => unknown;
  /** Custom write returning a new model (default: immutable dot-path set). */
  set?: (model: T, value: unknown) => T;
}

export interface AvatarControlOption {
  value: string;
  label: string;
  description?: string;
  /** Colour chip shown on the option. */
  swatch?: string;
}

export type AvatarControl<T = ResolvedAvatarDefinition> =
  | (ControlBase<T> & { kind: 'color' })
  | (ControlBase<T> & {
      kind: 'range';
      min: number;
      max: number;
      step: number;
      /** Value display: '%', '°', 'x' or a plain suffix; `scale` multiplies the shown value (e.g. 100 for %). */
      unit?: string;
      scale?: number;
    })
  | (ControlBase<T> & {
      kind: 'select';
      options: AvatarControlOption[];
      /** 'dropdown' (default), 'buttons' (button grid), 'cards' (buttons with a description line), 'segmented' (inline pill), 'swatches' (colour chips). */
      display?: 'dropdown' | 'buttons' | 'cards' | 'segmented' | 'swatches';
    })
  | (ControlBase<T> & {
      kind: 'toggle';
      /** 'switch' (default) or 'card' (feature card with description). */
      display?: 'switch' | 'card';
    });

export type AvatarControlState<T = ResolvedAvatarDefinition> = AvatarControl<T> & { value: unknown };

export type AvatarControlFactory = (def: ResolvedAvatarDefinition) => AvatarControl[];

/** Evaluate a control list against `model`: drops controls whose `when` fails, reads values. */
export function resolveControlStates<T>(controls: readonly AvatarControl<T>[], model: T): AvatarControlState<T>[] {
  return controls
    .filter((c) => !c.when || c.when(model))
    .map((c) => {
      let value = c.get ? c.get(model) : getPath(model, c.path);
      if (c.kind === 'color' && (typeof value === 'number' || typeof value === 'string')) value = toHexColor(value);
      return { ...c, value };
    });
}

/** Write `value` through the control at `path` (its `set`, else a dot-path set). */
export function applyControlValue<T>(controls: readonly AvatarControl<T>[], model: T, path: string, value: unknown): T {
  const control = controls.find((c) => c.path === path);
  return control?.set ? control.set(model, value) : setPath(model, path, value);
}

// ---------- path helpers ----------
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Immutable set; arrays are copied as arrays. Writing through a non-object (e.g. `fur: false`) is a no-op. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  if (head === undefined) return obj;
  if (obj === null || typeof obj !== 'object') return obj;
  const src = obj as unknown as Record<string, unknown>;
  const next: Record<string, unknown> | unknown[] = Array.isArray(obj) ? [...(obj as unknown[])] : { ...src };
  (next as Record<string, unknown>)[head] = rest.length ? setPath(src[head], rest.join('.'), value) : value;
  return next as T;
}

export function toHexColor(c: ColorLike): string {
  if (typeof c === 'number') return `#${c.toString(16).padStart(6, '0')}`;
  return c;
}

// ---------- registry ----------
const entries: { order: number; fn: AvatarControlFactory }[] = [];
let factories: AvatarControlFactory[] = [];

/**
 * Built-in control slots (`order`): Body = 0, Eyes / Gaze / Jelly /
 * Accessories = 20. Feature controls (e.g. the Three adapter's Fur = 10) slot
 * in between; default order is 100 (appended). Equal orders keep registration order.
 */
export const AVATAR_CONTROL_ORDER = { body: 0, surface: 10, face: 20, extra: 100 } as const;

/** Add controls: a static control list or a factory evaluated per definition. */
export function registerAvatarControl(control: AvatarControl | AvatarControl[] | AvatarControlFactory, opts: { order?: number } = {}): void {
  const fn: AvatarControlFactory = typeof control === 'function' ? control : ((list) => () => list)(Array.isArray(control) ? control : [control]);
  entries.push({ order: opts.order ?? AVATAR_CONTROL_ORDER.extra, fn });
  factories = entries
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map((e) => e.fn);
}

const hasJelly = (d: ResolvedAvatarDefinition) => d.jelly !== false;
const gazeOn = (d: ResolvedAvatarDefinition) => d.gaze !== false && (d.gaze?.enabled ?? true);
const gazeGet = (k: keyof AvatarGazeOptions) => (d: ResolvedAvatarDefinition) => (d.gaze ? (d.gaze[k] ?? DEFAULT_GAZE[k]) : DEFAULT_GAZE[k]);
const gazeSet = (k: keyof AvatarGazeOptions) => (d: ResolvedAvatarDefinition, v: unknown): ResolvedAvatarDefinition => ({ ...d, gaze: { ...(d.gaze || {}), [k]: v } });
const gazeRange = (k: keyof AvatarGazeOptions, label: string, min: number, max: number, step: number): AvatarControl => ({ kind: 'range', path: `gaze.${k}`, label, group: 'Gaze', min, max, step, randomize: false, when: gazeOn, get: gazeGet(k), set: gazeSet(k) });
/** Families whose body comes from their own geometry (`registerAvatarFamilyDefaults(f, { fixedBodyShape: true })`) get no generic shape picker. */
const freeBodyShape = (d: ResolvedAvatarDefinition) => !getAvatarFamilyDefaults(d.family).fixedBodyShape;
const eyesGet = (k: keyof typeof DEFAULT_EYES) => (d: ResolvedAvatarDefinition) => d.eyes?.[k] ?? DEFAULT_EYES[k];

// Generic definition fields (engine-level, no character content).
registerAvatarControl((def) => [
  { kind: 'color', path: 'body.color', label: 'Color', group: 'Body' },
  {
    kind: 'select',
    path: 'body.shape',
    label: 'Shape',
    group: 'Body',
    when: freeBodyShape,
    options: [
      ...(typeof def.body.shape === 'function' && !findAvatarShapeName(def.body.shape) ? [{ value: '__custom', label: 'custom' }] : []),
      ...listAvatarShapes().map((s) => ({ value: s, label: s })),
      ...listAvatarOptions('bodyGeometry').map((s) => ({ value: s, label: s })),
    ],
    get: (d) => (typeof d.body.shape === 'function' ? findAvatarShapeName(d.body.shape) ?? '__custom' : d.body.shape),
    set: (d, v) => {
      if (v === '__custom') return d;
      const name = String(v);
      const shape = listAvatarOptions('bodyGeometry').includes(name) ? name : resolveShape(name);
      return { ...d, body: { ...d.body, shape } };
    },
  },
  { kind: 'range', path: 'body.scale', label: 'Scale', group: 'Body', min: 0.5, max: 2, step: 0.05, randomize: false, get: (d) => d.body.scale ?? 1 },
], { order: AVATAR_CONTROL_ORDER.body });

registerAvatarControl((def) => [
  // eyes (shape list published by the renderer adapter)
  ...(listAvatarOptions('eyeShape').length
    ? [{ kind: 'select', path: 'eyes.shape', label: 'Shape', group: 'Eyes', get: eyesGet('shape'), options: listAvatarOptions('eyeShape').map((p) => ({ value: p, label: p })) } as AvatarControl]
    : []),
  { kind: 'range', path: 'eyes.spacing', label: 'Spacing', group: 'Eyes', min: 0.2, max: 1.2, step: 0.01, get: eyesGet('spacing') },
  { kind: 'range', path: 'eyes.size', label: 'Size', group: 'Eyes', min: 0.12, max: 0.8, step: 0.01, get: eyesGet('size') },
  { kind: 'range', path: 'eyes.height', label: 'Height', group: 'Eyes', min: -1, max: 1, step: 0.01, get: eyesGet('height') },
  { kind: 'range', path: 'eyes.depth', label: 'Depth', group: 'Eyes', min: 0.2, max: 1.2, step: 0.01, get: eyesGet('depth') },
  { kind: 'range', path: 'eyes.lid', label: 'Lid', group: 'Eyes', min: 0, max: 0.9, step: 0.01, get: eyesGet('lid') },
  {
    kind: 'toggle',
    path: 'eyes.colorAuto',
    label: 'Eye color from body',
    group: 'Eyes',
    get: (d) => (d.eyes?.color ?? DEFAULT_EYES.color) === 'auto',
    set: (d, v) => ({ ...d, eyes: { ...d.eyes, color: v ? 'auto' : '#15161c' } }),
  },
  { kind: 'color', path: 'eyes.color', label: 'Color', group: 'Eyes', when: (d) => (d.eyes?.color ?? DEFAULT_EYES.color) !== 'auto', get: eyesGet('color') },
  { kind: 'toggle', path: 'eyes.pupil', label: 'Pupil', group: 'Eyes', get: eyesGet('pupil') },
  {
    kind: 'select',
    path: 'eyes.pupilStyle',
    label: 'Pupil style',
    group: 'Eyes',
    when: (d) => !!(d.eyes?.pupil ?? DEFAULT_EYES.pupil),
    get: eyesGet('pupilStyle'),
    options: [
      { value: 'fill', label: 'fill' },
      { value: 'edge', label: 'edge' },
    ],
  } as AvatarControl,
  { kind: 'range', path: 'eyes.outlineWidth', label: 'Outline', group: 'Eyes', min: 0, max: 0.45, step: 0.01, get: eyesGet('outlineWidth') },
  {
    kind: 'toggle',
    path: 'eyes.outlineAuto',
    label: 'Outline from body',
    group: 'Eyes',
    get: (d) => (d.eyes?.outline ?? 'auto') === 'auto',
    set: (d, v) => ({ ...d, eyes: { ...d.eyes, outline: v ? 'auto' : '#3a2a2a' } }),
  },
  { kind: 'color', path: 'eyes.outline', label: 'Outline color', group: 'Eyes', when: (d) => (d.eyes?.outline ?? 'auto') !== 'auto', get: eyesGet('outline') },
  { kind: 'range', path: 'anchor.y', label: 'Position', group: 'Eyes', min: -0.8, max: 0.8, step: 0.01, get: (d) => d.anchor.y },
  { kind: 'range', path: 'anchor.width', label: 'Area width', group: 'Eyes', min: 0.5, max: 2, step: 0.01, get: (d) => d.anchor.width },
  { kind: 'toggle', path: 'eyes.tint', label: 'Tint from body', group: 'Eyes', get: eyesGet('tint') },
  {
    kind: 'toggle',
    path: 'gaze.enabled',
    label: 'Gaze',
    group: 'Gaze',
    randomize: false,
    get: (d) => d.gaze !== false && (d.gaze?.enabled ?? true),
    set: (d, v) => ({ ...d, gaze: { ...(d.gaze || {}), enabled: !!v } }),
  },
  { kind: 'toggle', path: 'gaze.followPointer', label: 'Follow pointer', group: 'Gaze', randomize: false, when: gazeOn, get: gazeGet('followPointer'), set: gazeSet('followPointer') },
  { kind: 'toggle', path: 'gaze.idle', label: 'Idle wander', group: 'Gaze', randomize: false, when: gazeOn, get: gazeGet('idle'), set: gazeSet('idle') },
  gazeRange('strength', 'Strength', 0, 1.5, 0.05),
  gazeRange('gain', 'Sensitivity', 1, 3, 0.05),
  gazeRange('stiffness', 'Stiffness', 0.2, 3, 0.05),
  gazeRange('lead', 'Lead', 0, 1, 0.01),
  gazeRange('bodyYaw', 'Body yaw', 0, 1.2, 0.01),
  gazeRange('bodyPitch', 'Body pitch', 0, 0.7, 0.01),
  gazeRange('bodyRoll', 'Body lean', 0, 0.4, 0.01),
  gazeRange('deadZone', 'Dead zone', 0, 0.6, 0.01),
  gazeRange('idleAmount', 'Wander', 0, 1, 0.01),
  {
    kind: 'toggle',
    path: 'jelly',
    label: 'Jelly',
    group: 'Jelly',
    randomize: false,
    get: (d) => d.jelly !== false,
    set: (d, v) => ({ ...d, jelly: v ? (d.jelly === false ? { ...(getAvatarFamilyDefaults(d.family).jelly || DEFAULT_JELLY) } : d.jelly) : false }),
  },
  { kind: 'range', path: 'jelly.amount', label: 'Amount', group: 'Jelly', min: 0, max: 3, step: 0.05, when: hasJelly },
  { kind: 'range', path: 'jelly.stiffness', label: 'Stiffness', group: 'Jelly', min: 20, max: 400, step: 5, when: hasJelly },
  { kind: 'range', path: 'jelly.damping', label: 'Damping', group: 'Jelly', min: 0.04, max: 1, step: 0.01, when: hasJelly },
  { kind: 'range', path: 'jelly.idle', label: 'Idle jiggle', group: 'Jelly', min: 0, max: 2, step: 0.05, when: hasJelly },
  { kind: 'range', path: 'jelly.poke', label: 'Poke', group: 'Jelly', min: 0, max: 3, step: 0.05, when: hasJelly },
  ...(def.accessories ?? []).map(
    (a, i): AvatarControl => ({
      kind: 'toggle',
      path: `accessories.${i}.enabled`,
      label: a.type,
      group: 'Accessories',
      get: (d) => d.accessories?.[i]?.enabled !== false,
    }),
  ),
], { order: AVATAR_CONTROL_ORDER.face });

/** Controls for `def` with their current values. `extra` = preset-specific controls. */
export function getAvatarControls(def: ResolvedAvatarDefinition, extra: AvatarControl[] = []): AvatarControlState[] {
  return resolveControlStates([...factories.flatMap((f) => f(def)), ...extra], def);
}

/** Apply `overrides` (path -> value) to `base` in insertion order and return a new definition. */
export function applyAvatarOverrides(
  base: ResolvedAvatarDefinition,
  overrides: Record<string, unknown>,
  extra: AvatarControl[] = [],
): ResolvedAvatarDefinition {
  let def = base;
  for (const [path, value] of Object.entries(overrides)) {
    def = applyControlValue([...factories.flatMap((f) => f(def)), ...extra], def, path, value);
  }
  return def;
}

/** Presets available to `family` (registered preset specs: shared + family). */
export function listAvatarPresetNames(family?: string): string[] {
  return listPresets(family);
}

/** Behaviors available to a definition: registry + its own behaviors (+ idle); `hidden` follow-ups are left out. */
export function listAvatarBehaviors(def?: Pick<AvatarDefinition, 'behaviors' | 'family'>): string[] {
  const shown = (a: { name: string; hidden?: boolean }) => (a.hidden ? [] : [a.name]);
  return Array.from(new Set(['idle', ...listBehaviors(def?.family).flatMap(shown), ...(def?.behaviors ?? []).flatMap(shown)]));
}
