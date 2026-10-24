/**
 * Mouth — renderer-agnostic schema, shapes, defaults, preset mapping, catalog
 * atom and studio controls of the optional, generic `mouth` feature (no `three`).
 *
 * ## Adding a mouth to a family
 * 1. Data (three-free, e.g. `<family>.defaults.ts`):
 *    `installDefaultMouthShapes(); registerMouthDefaults(family, { width, height, curve, open, color: 'auto' })`
 *    — `height` places it below the eye anchor centre (body units), `width` in body units.
 *    Presets pick a mouth through their `mouth.presetShape` variant (preset specs).
 * 2. Composer: `registerMouthAtom()` (shared Mouth atom + one variant per shape) and add
 *    `mouth: '<shape>'` to the family's compositions.
 * 3. Three.js: the `reliefMouth` rig part (in `DEFAULT_COMPOSITION`; add it to custom profiles
 *    after the eyes). It seats on any rig body (`surfaceAt`) and asks the surface part's
 *    `ctx.mouthClearing` (both `furShells` and `shellFur` provide one) to clear the fur.
 * Families without mouth defaults never resolve `mouth`, so nothing changes for them. A mouth is two 2D
 * profiles across its width (upper / lower edge, in mouth widths); closed
 * shapes have upper == lower (a line), open shapes enclose an inner area.
 * Renderers (e.g. the Three adapter's `reliefMouth` part) seat it on the body.
 * Only families that register mouth defaults resolve `mouth` (others — e.g.
 * Allie — are unaffected).
 */
import { registerAvatarFeature } from '../plugins/features.ts';
import { AVATAR_CONTROL_ORDER, registerAvatarControl } from '../controls/controls.ts';
import type { AvatarControl } from '../controls/controls.ts';
import { sameValue } from '../define/diffAvatar.ts';
import type { ResolvedAvatarDefinition } from '../define/resolveAvatar.ts';
import { registerAvatarOption, listAvatarOptions } from '../registry/options.ts';
import type { ColorLike } from '../types/AvatarDefinition.ts';
import { colorToRgb } from '../color/color.ts';
import { mouthColorFromAccent, mouthInnerFromLine, rgbToHex } from '../color/tint.ts';
import type { Rgb } from '../color/color.ts';
import { listAvatarAtoms, registerAvatarAtom, registerAvatarAtomVariant } from '../catalog/catalog.ts';

export interface AvatarMouthOptions {
  /** Registered mouth shape (default 'smile'). */
  shape?: string;
  /** Total width in body units. */
  width?: number;
  /** Curve amount multiplier (0 = flat, 1 = shape's own, up to 2). */
  curve?: number;
  /** Openness 0..1 (open shapes only). */
  open?: number;
  /**
   * Line colour: 'auto' (default) = derived from the live body / accent colour
   * (same hue, contrast-aware lightness); any colour = explicit override. The
   * open-shape inner is always derived from the line colour.
   */
  color?: string;
  /** Vertical offset from the eye anchor centre, body units (negative = lower). */
  height?: number;
}
export type ResolvedMouthOptions = Required<AvatarMouthOptions>;

export const DEFAULT_MOUTH: ResolvedMouthOptions = { shape: 'smile', width: 0.18, curve: 1, open: 0.5, color: 'auto', height: -0.22 };

/** Edge profile at x ∈ [-1, 1] (mouth half-widths) → [lower, upper] y in mouth widths. */
export type MouthProfile = (x: number, curve: number, open: number) => [number, number];

export interface MouthShape {
  profile: MouthProfile;
  /** Width multiplier of this shape (default 1). */
  width?: number;
  /** True when the shape encloses an inner area (gets the inner colour). */
  open?: boolean;
}

const shapes = new Map<string, MouthShape>();

export function registerMouthShape(name: string, shape: MouthShape): void {
  shapes.set(name, shape);
  registerAvatarOption('mouthShape', name);
}

export function getMouthShape(name: string): MouthShape {
  return shapes.get(name) ?? shapes.get('smile') ?? { profile: () => [0, 0] };
}

let installed = false;
/** Built-in shapes: smile, grin, o, flat, wobbly (idempotent). */
export function installDefaultMouthShapes(): void {
  if (installed) return;
  installed = true;
  // small upturned curve (centre low, corners up)
  registerMouthShape('smile', { profile: (x, c) => { const y = c * 0.16 * (x * x - 0.5); return [y, y]; } });
  // wider, slightly open: flat-ish top, rounded lower lip
  registerMouthShape('grin', {
    width: 1.35,
    open: true,
    profile: (x, c, o) => {
      const mid = c * 0.12 * (x * x - 0.5);
      const h = (0.06 + 0.22 * o) * Math.sqrt(Math.max(0, 1 - x * x));
      return [mid - h, mid + h * 0.15];
    },
  });
  // small round open mouth
  registerMouthShape('o', {
    width: 0.55,
    open: true,
    profile: (x, _c, o) => {
      const h = (0.35 + 0.45 * o) * Math.sqrt(Math.max(0, 1 - x * x));
      return [-h, h];
    },
  });
  registerMouthShape('flat', { width: 0.8, profile: () => [0, 0] });
  // small wavy line
  registerMouthShape('wobbly', { profile: (x, c) => { const y = c * 0.05 * Math.sin(x * Math.PI * 2.5); return [y, y]; } });
  // ω: cheeky double curve (centre and corners up, two dips)
  registerMouthShape('cat', { width: 1.1, profile: (x, c) => { const y = c * 0.075 * Math.cos(x * Math.PI * 2); return [y, y]; } });
  // small pursed bump, barely open
  registerMouthShape('pout', {
    width: 0.5,
    open: true,
    profile: (x, c, o) => {
      const mid = c * 0.06 * (0.35 - x * x);
      const h = (0.07 + 0.08 * o) * Math.sqrt(Math.max(0, 1 - x * x));
      return [mid - h, mid + h];
    },
  });
  // upside-down curve
  registerMouthShape('frown', { profile: (x, c) => { const y = -c * 0.15 * (x * x - 0.5); return [y, y]; } });
  // tall open oval
  registerMouthShape('yawn', {
    width: 0.62,
    open: true,
    profile: (x, _c, o) => {
      const h = (0.55 + 0.55 * o) * Math.sqrt(Math.max(0, 1 - x * x));
      return [-h, h * 0.55];
    },
  });
  // smile with a tiny tongue peeking below the centre of the lip (the pink inner is the tongue)
  registerMouthShape('tongue', {
    open: true,
    profile: (x, c, o) => {
      const y = c * 0.16 * (x * x - 0.5);
      const k = Math.max(0, 1 - (x / 0.32) ** 2);
      return [y - (0.12 + 0.08 * o) * Math.sqrt(k), y];
    },
  });
  // tiny round pucker / whistle
  registerMouthShape('kiss', {
    width: 0.3,
    open: true,
    profile: (x, _c, o) => {
      const h = (0.32 + 0.18 * o) * Math.sqrt(Math.max(0, 1 - x * x));
      return [-h, h];
    },
  });
}

/** Display names / glyphs of the built-in shapes (catalog variants). */
export const MOUTH_SHAPE_INFO: Record<string, { name: string; description: string }> = {
  smile: { name: 'Smile', description: '‿  Small upturned curve' },
  grin: { name: 'Grin', description: '◡  Wider, slightly open, soft pink inner' },
  o: { name: 'O', description: 'o  Small round open mouth (surprise)' },
  flat: { name: 'Flat', description: '—  Short straight line (calm)' },
  wobbly: { name: 'Wobbly', description: '〰  Small wavy line (nervous / shy)' },
  cat: { name: 'Cat', description: 'ω  Cheeky double curve' },
  pout: { name: 'Pout', description: '·  Small pursed bump' },
  frown: { name: 'Frown', description: '︵  Upside-down curve' },
  yawn: { name: 'Yawn', description: 'O  Tall open oval' },
  tongue: { name: 'Tongue', description: '‿ᴗ  Smile with a tiny tongue peeking out' },
  kiss: { name: 'Kiss', description: '3  Tiny round pucker' },
};

/**
 * Preset mouth variants: a preset picks a mouth with the variant target
 * `mouth.presetShape` and now-and-then switches (e.g. a sleepy yawn) with a
 * `mouth.idleShape` variation (see `core/face/facePresets.ts`).
 */
export const MOUTH_PRESET_SHAPE = 'mouth.presetShape';
export const MOUTH_IDLE_SHAPE = 'mouth.idleShape';

/** Mouth shape the (live, preset-applied) definition shows: idle variation, else the preset's mouth, else the selected one. */
export function presetMouthShape(def: ResolvedAvatarDefinition): string {
  const m = def.mouth as (typeof def.mouth & { presetShape?: string; idleShape?: string }) | undefined;
  if (!m) return DEFAULT_MOUTH.shape;
  return m.idleShape ?? m.presetShape ?? m.shape;
}

let atomDone = false;
/** Shared (family-less) Mouth atom + one variant per registered built-in shape (idempotent). */
export function registerMouthAtom(order = 3): void {
  if (atomDone) return;
  atomDone = true;
  installDefaultMouthShapes();
  if (!listAvatarAtoms().some((a) => a.id === 'mouth')) registerAvatarAtom({ id: 'mouth', name: 'Mouth', order, description: 'Relief mouth embedded in the body (presets pick one automatically)' });
  registerAvatarAtomVariant({
    atom: 'mouth',
    id: 'none',
    name: 'None',
    description: 'No mouth',
    apply(d) {
      d.def.mouth = false;
    },
  });
  for (const [id, info] of Object.entries(MOUTH_SHAPE_INFO))
    registerAvatarAtomVariant({
      atom: 'mouth',
      id,
      name: info.name,
      description: info.description,
      apply(d) {
        d.def.mouth = { ...(d.def.mouth || {}), shape: id };
      },
    });
}

/** Sample a shape's edges at `n` points across x ∈ [-1, 1] (mouth widths). */
export function sampleMouth(shape: string, curve: number, open: number, n: number, lower: Float32Array, upper: Float32Array): void {
  const s = getMouthShape(shape);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const [l, u] = s.profile(x, curve, open);
    lower[i] = l;
    upper[i] = u;
  }
}

declare module '../types/AvatarDefinition.ts' {
  interface AvatarDefinition {
    /** Mouth (families with `registerMouthDefaults`; `false` = none). */
    mouth?: AvatarMouthOptions | false;
  }
}
declare module '../define/resolveAvatar.ts' {
  interface ResolvedAvatarDefinition {
    mouth?: ResolvedMouthOptions | false;
  }
}

/** True when the mouth colour follows the body (unset or 'auto'). */
export function isAutoMouthColor(color: string | undefined): boolean {
  return !color || color === 'auto';
}

/** Mouth line + inner colours for a body colour ('auto' derives from it; an explicit colour overrides). */
export function mouthColors(color: string | undefined, body: ColorLike): { line: Rgb; inner: Rgb } {
  const line = isAutoMouthColor(color) ? mouthColorFromAccent(colorToRgb(body)) : colorToRgb(color!);
  return { line, inner: mouthInnerFromLine(line) };
}

const familyDefaults = new Map<string, ResolvedMouthOptions>();
/** Declare a family's mouth defaults (enables `def.mouth` + its controls for that family). */
export function registerMouthDefaults(family: string, mouth: Partial<ResolvedMouthOptions>): void {
  familyDefaults.set(family, { ...DEFAULT_MOUTH, ...familyDefaults.get(family), ...mouth });
}
export function mouthDefaults(family?: string): ResolvedMouthOptions | undefined {
  return family ? familyDefaults.get(family) : undefined;
}

registerAvatarFeature({
  id: 'mouth',
  resolve: (def) => {
    const base = mouthDefaults(def.family);
    if (!base || def.mouth === false) return def.mouth === false ? { mouth: false } : {};
    return { mouth: { ...base, ...(def.mouth ?? {}) } };
  },
  isResolved: (def) => def.mouth !== undefined || !mouthDefaults(def.family),
  // all mouth fields animate in place (spring morph in the renderer)
  diff: (prev, next) => !sameValue(prev.mouth ?? null, next.mouth ?? null),
});

const has = (d: ResolvedAvatarDefinition) => !!d.mouth;
registerAvatarControl(
  () => [
    ...(listAvatarOptions('mouthShape').length
      ? [{ kind: 'select', path: 'mouth.shape', label: 'Shape', group: 'Mouth', when: has, options: listAvatarOptions('mouthShape').map((s) => ({ value: s, label: s })) } as AvatarControl]
      : []),
    { kind: 'range', path: 'mouth.width', label: 'Width', group: 'Mouth', min: 0.05, max: 0.5, step: 0.005, when: has },
    { kind: 'range', path: 'mouth.curve', label: 'Curve', group: 'Mouth', min: -1, max: 2, step: 0.01, when: has },
    { kind: 'range', path: 'mouth.open', label: 'Openness', group: 'Mouth', min: 0, max: 1, step: 0.01, when: has },
    // shows the derived colour while 'auto'; picking one overrides; reset (clearing the override) returns to auto
    {
      kind: 'color',
      path: 'mouth.color',
      label: 'Colour',
      group: 'Mouth',
      when: has,
      get: (d) => (d.mouth ? rgbToHex(mouthColors(d.mouth.color, d.body.color).line) : '#000000'),
    },
    {
      kind: 'toggle',
      path: 'mouth.colorAuto',
      label: 'Colour from body',
      group: 'Mouth',
      when: has,
      get: (d) => !!d.mouth && isAutoMouthColor(d.mouth.color),
      set: (d, v) => (d.mouth ? { ...d, mouth: { ...d.mouth, color: v ? 'auto' : rgbToHex(mouthColors(d.mouth.color, d.body.color).line) } } : d),
    },
    { kind: 'range', path: 'mouth.height', label: 'Position', group: 'Mouth', min: -0.6, max: 0.2, step: 0.005, when: has },
  ],
  { order: AVATAR_CONTROL_ORDER.face + 1 },
);
