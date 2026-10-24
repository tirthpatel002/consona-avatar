/**
 * Hairband — renderer-agnostic schema, styles, defaults, catalog atom and
 * studio controls of the optional, generic `hairband` feature (no `three`).
 * Same pattern as `mouth.ts`: a family opts in with
 * `registerHairbandDefaults(family, { … })` (placement on its head) and
 * `registerHairbandAtom()`; renderers draw it ON the body surface (the Three
 * adapter: the `reliefHairband` rig part, a decal-in-shader band like the
 * mouth, with the fur cleared around it). Default is none (`hairband: false`).
 *
 * The band is the head surface cut by a slab: centred on `y` above the body
 * centre, crossing over the top ear to ear, tipped toward the face by
 * `position` and sideways by `tilt`, ending (rounded) `end` above the head
 * centre on each side.
 */
import { registerAvatarFeature } from '../plugins/features.ts';
import { AVATAR_CONTROL_ORDER, registerAvatarControl } from '../controls/controls.ts';
import { sameValue } from '../define/diffAvatar.ts';
import type { ResolvedAvatarDefinition } from '../define/resolveAvatar.ts';
import type { ColorLike } from '../types/AvatarDefinition.ts';
import { colorToRgb } from '../color/color.ts';
import type { Rgb } from '../color/color.ts';
import { hairbandColorFromAccent, rgbToHex } from '../color/tint.ts';
import { listAvatarAtoms, registerAvatarAtom, registerAvatarAtomVariant } from '../catalog/catalog.ts';
import type { AvatarIcon } from '../catalog/catalog.ts';

/** Built-in band styles (index = renderer style id). */
export const HAIRBAND_STYLES = ['plain', 'ribbed', 'bow'] as const;
export type HairbandStyle = (typeof HAIRBAND_STYLES)[number];

export const HAIRBAND_STYLE_INFO: Record<HairbandStyle, { name: string; description: string }> = {
  plain: { name: 'Band', description: 'Smooth soft fabric band' },
  ribbed: { name: 'Ribbed', description: 'Knitted band with ribs across it' },
  bow: { name: 'Bow', description: 'Band with a puffy bow on one side' },
};

export interface AvatarHairbandOptions {
  /** Band style (default 'plain'). */
  style?: HairbandStyle;
  /** 'auto' (default) = derived from the live body colour (contrasting counter-hue); any colour = override. */
  color?: string;
  /** Band width, body units. */
  width?: number;
  /** Tip toward the face (radians; 0 = straight over the top, ear to ear). */
  position?: number;
  /** Sideways tilt (radians). */
  tilt?: number;
  /** Family placement: band centre height above the body centre (body units). */
  y?: number;
  /** Family placement: where the band ends on each side, along the band's up axis from its centre (body units). */
  end?: number;
  /** Family placement: fabric thickness (relief height, body units). */
  thickness?: number;
}
export type ResolvedHairbandOptions = Required<AvatarHairbandOptions>;

export const DEFAULT_HAIRBAND: ResolvedHairbandOptions = { style: 'plain', color: 'auto', width: 0.14, position: 0.3, tilt: 0, y: 0, end: 0, thickness: 0.02 };

declare module '../types/AvatarDefinition.ts' {
  interface AvatarDefinition {
    /** Hairband (families with `registerHairbandDefaults`; `false` / unset = none). */
    hairband?: AvatarHairbandOptions | false;
  }
}
declare module '../define/resolveAvatar.ts' {
  interface ResolvedAvatarDefinition {
    hairband?: ResolvedHairbandOptions | false;
  }
}

export function isAutoHairbandColor(color: string | undefined): boolean {
  return !color || color === 'auto';
}

/** The band colour for a body colour ('auto' derives it; an explicit colour overrides). */
export function hairbandColor(color: string | undefined, body: ColorLike): Rgb {
  return isAutoHairbandColor(color) ? hairbandColorFromAccent(colorToRgb(body)) : colorToRgb(color!);
}

/** Renderer style id of a style name (unknown → plain). */
export function hairbandStyleIndex(style: string | undefined): number {
  const i = HAIRBAND_STYLES.indexOf(style as HairbandStyle);
  return i < 0 ? 0 : i;
}

const familyDefaults = new Map<string, ResolvedHairbandOptions>();
/** Declare a family's hairband placement / defaults (enables `def.hairband`, its atom variants and controls). */
export function registerHairbandDefaults(family: string, band: Partial<ResolvedHairbandOptions>): void {
  familyDefaults.set(family, { ...DEFAULT_HAIRBAND, ...familyDefaults.get(family), ...band });
}
export function hairbandDefaults(family?: string): ResolvedHairbandOptions | undefined {
  return family ? familyDefaults.get(family) : undefined;
}

registerAvatarFeature({
  id: 'hairband',
  resolve: (def) => {
    const base = hairbandDefaults(def.family);
    if (!base) return {};
    // default: none
    if (!def.hairband) return { hairband: false };
    return { hairband: { ...base, ...def.hairband } };
  },
  isResolved: (def) => def.hairband !== undefined || !hairbandDefaults(def.family),
  // every field is a uniform in the renderer: never a rebuild
  diff: (prev, next) => !sameValue(prev.hairband ?? null, next.hairband ?? null),
});

// ---------- picker icons (head + band, flat, like the eye tiles) ----------
const HEAD = 'M0 -9A9 9 0 1 1 0 9A9 9 0 1 1 0 -9Z';
// band arc over the top: outer r 9.2, inner r 7 between ±80°
const arc = (r0: number, r1: number, a0: number, a1: number) => {
  const p = (r: number, a: number) => `${(Math.sin(a) * r).toFixed(2)} ${(-Math.cos(a) * r).toFixed(2)}`;
  return `M${p(r1, a0)}A${r1} ${r1} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
};
const BAND = arc(6.6, 9.4, -1.45, 1.45);
const RIBS = [-1.1, -0.7, -0.3, 0.1, 0.5, 0.9, 1.3].map((a) => arc(6.6, 9.4, a, a + 0.12)).join('');
const ell = (cx: number, cy: number, rx: number, ry: number, rot: number) => {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const p = (x: number, y: number) => `${(cx + x * c - y * sn).toFixed(2)} ${(cy + x * sn + y * c).toFixed(2)}`;
  return `M${p(-rx, 0)}A${rx} ${ry} ${((rot * 180) / Math.PI).toFixed(1)} 1 0 ${p(rx, 0)}A${rx} ${ry} ${((rot * 180) / Math.PI).toFixed(1)} 1 0 ${p(-rx, 0)}Z`;
};
// bow at the band's side-top: two loops with dark holes, a knot, two V-cut tails
const BOW_C = [3.6, -8.4] as const;
const BOW_TAILS = [-1, 1]
  .map((k) => {
    const [x, y] = BOW_C;
    const ex = x + k * 1.9 + 0.9, ey = y + 4.6;
    return `M${x - 0.9} ${y}L${x + 0.9} ${y}L${ex + 1} ${ey}L${ex} ${ey - 1.1}L${ex - 1} ${ey}Z`;
  })
  .join('');
const BOW = BOW_TAILS + ell(BOW_C[0] - 2.9, BOW_C[1] - 0.3, 2.7, 1.9, -0.35) + ell(BOW_C[0] + 2.9, BOW_C[1] - 0.3, 2.7, 1.9, 0.35);
const BOW_DARK = ell(BOW_C[0] - 3.3, BOW_C[1] - 0.4, 0.9, 0.5, -0.35) + ell(BOW_C[0] + 3.3, BOW_C[1] - 0.4, 0.9, 0.5, 0.35) + ell(BOW_C[0], BOW_C[1], 1.5, 1.7, 0);
const BOW_KNOT = ell(BOW_C[0], BOW_C[1], 1.05, 1.25, 0);
function hairbandIcon(style: HairbandStyle): AvatarIcon {
  return {
    viewBox: [-13, -15, 27, 27],
    paths: [
      { d: HEAD, fill: 'body' },
      { d: BAND, fill: style === 'ribbed' ? 'outline' : 'feature' },
      ...(style === 'ribbed' ? [{ d: RIBS, fill: 'feature' as const }] : []),
      ...(style === 'bow' ? [{ d: BOW, fill: 'feature' as const }, { d: BOW_DARK, fill: 'outline' as const }, { d: BOW_KNOT, fill: 'feature' as const }] : []),
    ],
  };
}

let atomDone = false;
/** Shared (family-less) Hairband atom: `none` + one variant per style (idempotent). */
export function registerHairbandAtom(order = 4): void {
  if (atomDone) return;
  atomDone = true;
  if (!listAvatarAtoms().some((a) => a.id === 'hairband')) registerAvatarAtom({ id: 'hairband', name: 'Hairband', order, description: 'Fabric band over the head, seated in the fur' });
  registerAvatarAtomVariant({
    atom: 'hairband',
    id: 'none',
    name: 'None',
    description: 'No hairband',
    icon: { viewBox: [-13, -15, 27, 27], paths: [{ d: HEAD, fill: 'body' }] },
    apply(d) {
      d.def.hairband = false;
    },
  });
  for (const style of HAIRBAND_STYLES)
    registerAvatarAtomVariant({
      atom: 'hairband',
      id: style,
      name: HAIRBAND_STYLE_INFO[style].name,
      description: HAIRBAND_STYLE_INFO[style].description,
      icon: () => hairbandIcon(style),
      apply(d) {
        d.def.hairband = { ...(d.def.hairband || {}), style };
      },
    });
}

const has = (d: ResolvedAvatarDefinition) => !!d.hairband;
registerAvatarControl(
  () => [
    { kind: 'select', path: 'hairband.style', label: 'Style', group: 'Hairband', when: has, options: HAIRBAND_STYLES.map((s) => ({ value: s, label: HAIRBAND_STYLE_INFO[s].name })) },
    { kind: 'range', path: 'hairband.width', label: 'Width', group: 'Hairband', min: 0.06, max: 0.3, step: 0.005, when: has },
    { kind: 'range', path: 'hairband.position', label: 'Position', group: 'Hairband', min: -0.5, max: 0.9, step: 0.01, when: has },
    { kind: 'range', path: 'hairband.tilt', label: 'Tilt', group: 'Hairband', min: -0.5, max: 0.5, step: 0.01, when: has },
    {
      kind: 'color',
      path: 'hairband.color',
      label: 'Colour',
      group: 'Hairband',
      when: has,
      get: (d) => (d.hairband ? rgbToHex(hairbandColor(d.hairband.color, d.body.color)) : '#000000'),
    },
    {
      kind: 'toggle',
      path: 'hairband.colorAuto',
      label: 'Colour from body',
      group: 'Hairband',
      when: has,
      get: (d) => !!d.hairband && isAutoHairbandColor(d.hairband.color),
      set: (d, v) => (d.hairband ? { ...d, hairband: { ...d.hairband, color: v ? 'auto' : rgbToHex(hairbandColor(d.hairband.color, d.body.color)) } } : d),
    },
  ],
  { order: AVATAR_CONTROL_ORDER.face + 2 },
);
