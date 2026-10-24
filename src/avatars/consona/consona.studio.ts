import type { AvatarControl } from '../../core/controls/controls.ts';
import { registerAvatarAtom, registerAvatarAtomVariant } from '../../core/catalog/catalog.ts';
import { registerAvatarStudio, type AvatarStudioStageSize } from '../../core/studio/manifest.ts';
import { createConsonaAvatarHandle } from './sdk/consonaHandle.ts';
import type { SpinAxis } from '../../core/types/Transform3D.ts';
import type { ConsonaAvatarConfig, ConsonaEyesConfig } from './consona.config.ts';
import { CONSONA_FAMILY } from './atoms/eyes.consona.atom.ts';
import { HEAD_SHAPE_VARIANTS } from './variants/head.variants.ts';
import { EYE_SHAPE_VARIANTS, EYE_TILT_VARIANTS } from './variants/eye.variants.ts';
import { ACCENT_COLORS, resolvePalette, type AccentColor, type ConsonaPaletteId } from './palettes/consona.palettes.ts';
import { consonaEngine } from './sdk/ConsonaEngine.ts';
import { registerConsonaRandomizer } from './consona.randomizer.ts';
import { decodeAvatarConfig, encodeAvatarConfig, isAvatarCode } from './sdk/AvatarConfigCoder.ts';

/**
 * Consona studio bridge: the Consona config (`ConsonaAvatarConfig`) exposed as
 * catalog atoms (head / eyes, family 'consona') + controls, and the studio
 * manifest the shared app studio renders (SVG stage, live option previews).
 */

type C = ConsonaAvatarConfig;

// ---------- catalog atoms ----------
/** Catalog atom id → config path of the selected variant. */
export const CONSONA_ATOM_PATHS = { head: 'head.shape', eyes: 'eyes.shape' } as const;

let atomsDone = false;
/** Consona's head / eyes atoms + one variant per drawable shape (idempotent). */
export function registerConsonaAtoms(): void {
  if (atomsDone) return;
  atomsDone = true;
  registerAvatarAtom({ id: 'head', family: CONSONA_FAMILY, name: 'Body Silhouette', order: 0, description: 'Head / body outline' });
  registerAvatarAtom({ id: 'eyes', family: CONSONA_FAMILY, name: 'Eye Variant Shape', order: 1, description: 'Eye glyph' });
  for (const [atom, list] of [['head', HEAD_SHAPE_VARIANTS], ['eyes', EYE_SHAPE_VARIANTS]] as const)
    for (const v of list)
      registerAvatarAtomVariant({
        atom,
        family: CONSONA_FAMILY,
        id: v.id,
        name: v.meta?.label ?? v.id,
        // Consona configs are edited through `CONSONA_ATOM_PATHS`; composing records the pick
        apply(d) {
          d.meta[atom] = v.id;
        },
      });
}

// ---------- helpers ----------
const eyes = <K extends keyof ConsonaEyesConfig>(k: K, fallback: NonNullable<ConsonaEyesConfig[K]>) => (c: C) => c.eyes[k] ?? fallback;
const setEyes = (k: keyof ConsonaEyesConfig) => (c: C, v: unknown): C => ({ ...c, eyes: { ...c.eyes, [k]: v } });
const setHead = (k: keyof C['head']) => (c: C, v: unknown): C => ({ ...c, head: { ...c.head, [k]: v } });
const setBehavior = (k: string) => (c: C, v: unknown): C => ({ ...c, behavior: { ...c.behavior, [k]: v } });
const behaviorOn = (k: 'interactive' | 'autoBlink' | 'animated') => (c: C) => c.behavior?.[k] !== false;

export const consonaPupilOn = (c: C): boolean =>
  Boolean(c.eyes.showPupil ?? (typeof c.eyes.pupil === 'object' ? c.eyes.pupil.enabled : c.eyes.pupil));
const bgMode = (c: C) => c.eyes.bgMode ?? (consonaPupilOn(c) ? 'white' : 'accent');

/** Current light / dark shade (palette id wins, then palette, then config). */
export function consonaMode(c: C): 'light' | 'dark' {
  const pal = resolvePalette(c.paletteId, c.mode);
  return c.paletteId.endsWith('-dark') || c.paletteId === 'dark'
    ? 'dark'
    : c.paletteId.endsWith('-light') || c.paletteId === 'light'
      ? 'light'
      : pal.mode ?? c.mode ?? 'light';
}
export const consonaAccent = (c: C): AccentColor => resolvePalette(c.paletteId, c.mode).accentColor ?? 'mono';
const paletteFor = (accent: AccentColor, mode: 'light' | 'dark'): ConsonaPaletteId =>
  accent === 'mono' ? mode : (`${accent}-${mode}` as ConsonaPaletteId);

const range = (path: string, label: string, group: string, min: number, max: number, get: (c: C) => number, set: (c: C, v: unknown) => C, o: { step?: number; unit?: string; scale?: number } = {}): AvatarControl<C> => ({
  kind: 'range', path, label, group, min, max, step: o.step ?? 0.01, unit: o.unit, scale: o.scale, get, set,
});
const card = (path: string, label: string, description: string, group: string, get: (c: C) => boolean, set: (c: C, v: unknown) => C): AvatarControl<C> => ({
  kind: 'toggle', display: 'card', path, label, description, group, get, set,
  // behaviour switches (gaze / blink / loops) are not part of the look
  randomize: !path.startsWith('behavior.'),
});

const EYE_BG_MODES = [
  { value: 'white', label: 'White', description: 'Porcelain white ocular background' },
  { value: 'black', label: 'Black', description: 'Obsidian void dark background' },
  { value: 'accent', label: 'Accent', description: 'Curated saturated theme accent' },
  { value: 'softAccent', label: 'Soft Accent', description: 'Luminous pastel theme tint' },
];
const BORDER_MODES = [
  { value: 'accent', label: 'Accent Match' },
  { value: 'contrast', label: 'Accent Alt' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'none', label: 'No Border' },
];
const pupilToggle = (c: C, v: unknown): C => ({ ...c, eyes: { ...c.eyes, pupil: !!v, showPupil: !!v } });

// ---------- controls ----------
export const CONSONA_CONTROLS: AvatarControl<C>[] = [
  // Accent & Shade (stage panel)
  {
    kind: 'select', display: 'segmented', path: 'mode', label: 'Shade', group: 'Accent & Shade',
    options: [{ value: 'light', label: 'Light Shade' }, { value: 'dark', label: 'Dark Shade' }],
    get: consonaMode,
    set: (c, v) => ({ ...c, mode: v as 'light' | 'dark', paletteId: paletteFor(consonaAccent(c), v as 'light' | 'dark') }),
  },
  {
    kind: 'select', display: 'swatches', path: 'paletteId', label: 'Accent', group: 'Accent & Shade',
    options: ACCENT_COLORS.map((a) => ({ value: a.id, label: a.name, swatch: a.swatch })),
    get: consonaAccent,
    set: (c, v) => {
      const mode = consonaMode(c);
      return { ...c, paletteId: paletteFor(v as AccentColor, mode), mode };
    },
  },
  // Preferences
  { kind: 'select', display: 'cards', path: 'eyes.bgMode', label: 'Eye background', group: 'Eye Background Color (Sclera)', options: EYE_BG_MODES, get: bgMode, set: setEyes('bgMode') },
  card('eyes.pupil', 'Shape-Matched Pupil', 'Adaptive optical pupil tracking inside sclera', 'Features & Expressive Toggles', consonaPupilOn, pupilToggle),
  card('head.surfaceShadow', 'Ground Surface Shadow', 'Floor contact shadow cast by chassis on surface', 'Features & Expressive Toggles', (c) => Boolean(c.head.surfaceShadow), setHead('surfaceShadow')),
  card('behavior.interactive', 'Pointer Gaze Spring Tracking', 'Reactive mouse/touch tracking with damped physics', 'Features & Expressive Toggles', behaviorOn('interactive'), setBehavior('interactive')),
  card('behavior.autoBlink', 'Autonomous Micro-Blinking', 'Natural random eyelid blinks & double-blinks', 'Features & Expressive Toggles', behaviorOn('autoBlink'), setBehavior('autoBlink')),
  card('behavior.animated', 'Kinematic Animation Loops', 'Continuous motion loops, breathing, & preset physics', 'Features & Expressive Toggles', behaviorOn('animated'), setBehavior('animated')),
  // Geometry
  range('eyes.openness', 'Aperture Openness', 'Aperture & Eyelid Geometry', 0, 1, eyes('openness', 1), setEyes('openness'), { unit: '%', scale: 100 }),
  range('eyes.size', 'Eye Width Scale', 'Aperture & Eyelid Geometry', 0.1, 1.5, eyes('size', 0.5), setEyes('size'), { unit: '%', scale: 100 }),
  range('eyes.aspectRatio', 'Aspect Ratio (W/H)', 'Aperture & Eyelid Geometry', 0.4, 2.5, eyes('aspectRatio', 1), setEyes('aspectRatio'), { unit: 'x' }),
  {
    kind: 'select', display: 'buttons', path: 'eyes.tiltMode', label: '', group: 'Optical Tilt & Alignment',
    options: EYE_TILT_VARIANTS.map((v) => ({ value: v.id, label: v.meta?.label ?? v.id, description: v.meta?.description ?? '' })),
    set: setEyes('tiltMode'),
  },
  range('eyes.tiltAngle', 'Tilt Angle', 'Optical Tilt & Alignment', -45, 45, eyes('tiltAngle', 0), setEyes('tiltAngle'), { step: 1, unit: '°' }),
  range('eyes.spacing', 'Eye Spacing (Separation)', 'Spatial Layout & Travel', 0, 1, eyes('spacing', 0.5), setEyes('spacing'), { unit: '%', scale: 100 }),
  range('eyes.gazeExcursion', 'Gaze Excursion Sensitivity', 'Spatial Layout & Travel', 0, 2, eyes('gazeExcursion', 0.5), setEyes('gazeExcursion'), { unit: '%', scale: 100 }),
  range('eyes.xOffset', 'Eye X Offset (Lateral)', 'Spatial Layout & Travel', -1, 1, eyes('xOffset', 0), setEyes('xOffset')),
  range('eyes.yOffset', 'Eye Y Offset (Vertical)', 'Spatial Layout & Travel', -1, 1, eyes('yOffset', 0), setEyes('yOffset')),
  range('head.roundness', 'Head Corner Roundness', 'Body Curvature & Eye Borders', 0, 1, (c) => c.head.roundness ?? 0.85, setHead('roundness'), { unit: '%', scale: 100 }),
  range('eyes.borderWidth', 'Eye Border Stroke Width', 'Body Curvature & Eye Borders', 0, 1, eyes('borderWidth', 0), setEyes('borderWidth'), { unit: '%', scale: 100 }),
  { kind: 'select', display: 'buttons', path: 'eyes.borderMode', label: 'Border Outline Color Mode', group: 'Body Curvature & Eye Borders', options: BORDER_MODES, get: eyes('borderMode', 'accent'), set: setEyes('borderMode') },
  // same field as the Preferences block, compact buttons here
  { kind: 'select', display: 'buttons', path: 'eyes.bgMode', label: 'Eye Background Color (Sclera Fill)', group: 'Body Curvature & Eye Borders', options: EYE_BG_MODES.map(({ value, label }) => ({ value, label })), get: bgMode, set: setEyes('bgMode') },
  { ...range('eyes.pupilScale', 'Pupil Aperture Scale', 'Pupil Kinematics & Scale', 0.15, 0.85, eyes('pupilScale', 0.48), setEyes('pupilScale'), { unit: '%', scale: 100 }), when: consonaPupilOn },
  { ...range('eyes.pupilGazeTracking', 'Pupil Gaze Shift Sensitivity', 'Pupil Kinematics & Scale', 0, 2, eyes('pupilGazeTracking', 0.8), setEyes('pupilGazeTracking'), { unit: '%', scale: 100 }), when: consonaPupilOn },
  // Animation
  card('behavior.animated', 'Kinematic Loop Motion', 'Procedural sway, respiration, & preset dynamics', 'Procedural Kinematics Engine', behaviorOn('animated'), setBehavior('animated')),
  card('behavior.interactive', 'Interactive Pointer Gaze', 'Reactive spring gaze tracking & 3D head follow', 'Procedural Kinematics Engine', behaviorOn('interactive'), setBehavior('interactive')),
  card('behavior.autoBlink', 'Autonomous Micro-Blinking', 'Natural organic eyelid blinks & micro-saccades', 'Procedural Kinematics Engine', behaviorOn('autoBlink'), setBehavior('autoBlink')),
];

// ---------- behavior modifiers ----------
const SPIN_AXES: { id: SpinAxis; label: string; desc: string }[] = [
  { id: 'y', label: 'Y-Yaw', desc: 'Horizontal 360° Turntable' },
  { id: 'x', label: 'X-Pitch', desc: 'Vertical 360° Somersault' },
  { id: 'z', label: 'Z-Roll', desc: 'In-Plane 2D Roll' },
  { id: 'xy', label: 'XY 45°', desc: 'Diagonal Pitch-Yaw Somersault' },
  { id: 'xz', label: 'XZ 45°', desc: 'Diagonal Pitch-Roll Somersault' },
  { id: 'yz', label: 'YZ 45°', desc: 'Diagonal Yaw-Roll Turntable' },
  { id: 'xyz', label: '3D Orbit', desc: 'Full 3D Multi-Axis Tumbler' },
];

type P = Record<string, unknown>;
const BEHAVIOR_PARAMS: AvatarControl<P>[] = [
  { kind: 'range', path: 'speed', label: 'Execution Speed Multiplier', group: 'Behavior Kinematics Modifiers', min: 0.5, max: 2.5, step: 0.1, unit: 'x' },
  { kind: 'range', path: 'weight', label: 'Behavior Amplitude / Weight', group: 'Behavior Kinematics Modifiers', min: 0.2, max: 2, step: 0.1, unit: 'x' },
  { kind: 'select', display: 'segmented', path: 'axis', label: '3D Spin Rotational Axis', group: 'Behavior Kinematics Modifiers', options: SPIN_AXES.map((a) => ({ value: String(a.id), label: a.label, description: a.desc })) },
];

export const CONSONA_STAGE_SIZES: AvatarStudioStageSize[] = [
  { id: 'main', title: 'Main Avatar', label: '260px', px: 260, thumb: 36, description: 'Primary hero presence for conversational agents & assistants' },
  { id: 'small', title: 'Small Avatar', label: '64px', px: 64, thumb: 32, description: 'Compact card / list item representation for UI feeds' },
  { id: 'micro', title: 'Micro Avatar', label: '40px', px: 40, thumb: 28, description: 'Ultra-compact chip / status pill with boosted optics' },
  { id: 'all', title: 'All Targets (Sync)', label: 'Synced', px: 260, thumb: 36, description: 'Broadcast all parametric tweaks across Main, Small, and Micro simultaneously' },
];

// ---------- manifest ----------
let done = false;
/** Register Consona's atoms and studio manifest (idempotent). */
export function registerConsonaStudio(): void {
  if (done) return;
  done = true;
  registerConsonaAtoms();
  registerConsonaRandomizer();
  registerAvatarStudio<C>({
    id: 'consona',
    label: 'Consona',
    title: 'Consona Avatar Studio',
    families: [CONSONA_FAMILY],
    renderer: 'svg',
    stage: { size: 'compact', sizes: CONSONA_STAGE_SIZES },
    previews: 'live',
    sections: [
      {
        id: 'characters',
        label: 'Characters / Atoms',
        items: [
          { type: 'controls', groups: ['Accent & Shade'] },
          { type: 'divider' },
          { type: 'atoms', atom: 'head', columns: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-5' },
          { type: 'divider' },
          { type: 'atoms', atom: 'eyes', columns: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6' },
          { type: 'controls', groups: ['Eye Background Color (Sclera)'], badge: (c) => ({ text: bgMode(c), tone: 'value' }) },
          { type: 'divider' },
          { type: 'controls', groups: ['Features & Expressive Toggles'], columns: 2 },
        ],
      },
      {
        id: 'parameters',
        label: 'Parameters',
        items: [
          { type: 'channels' },
          { type: 'controls', groups: ['Procedural Kinematics Engine'], columns: 3, badge: (c) => (c.behavior?.animated !== false ? { text: 'RUNNING', tone: 'on' } : { text: 'PAUSED', tone: 'off' }) },
          { type: 'controls', groups: ['Aperture & Eyelid Geometry'], columns: 3 },
          { type: 'controls', groups: ['Optical Tilt & Alignment'], columns: 1, badge: (c) => ({ text: `${c.eyes.tiltAngle ?? 0}°`, tone: 'chip' }) },
          { type: 'controls', groups: ['Spatial Layout & Travel'], columns: 2 },
          { type: 'controls', groups: ['Body Curvature & Eye Borders'], columns: 2 },
          { type: 'controls', groups: ['Pupil Kinematics & Scale'], columns: 2 },
        ],
      },
      { id: 'behaviors', label: 'Behaviors', items: [{ type: 'behaviors', chain: true }] },
      { id: 'events', label: 'Events', items: [{ type: 'events' }] },
    ],
    source: {
      kind: 'config',
      controls: CONSONA_CONTROLS,
      atomPaths: CONSONA_ATOM_PATHS,
      preview: (c, size) => {
        try {
          return consonaEngine.renderToSvg(c, { size, background: 'transparent' });
        } catch {
          return '';
        }
      },
      handle: (stageId) => createConsonaAvatarHandle(consonaEngine, stageId),
      behaviorParams: { controls: BEHAVIOR_PARAMS, defaults: { speed: 1, weight: 1, axis: 'y' } },
      // header blink: every Consona avatar on the page (as before)
      blink: () => consonaEngine.triggerBlink(),
      code: { encode: encodeAvatarConfig, decode: decodeAvatarConfig, isCode: isAvatarCode },
      stageBadges: (c) => [
        { text: c.behavior?.interactive !== false ? 'Gaze Active' : 'Static Gaze', tone: c.behavior?.interactive !== false ? 'on' : 'off' },
        { text: c.behavior?.preset ?? 'neutral', tone: 'chip' },
      ],
    },
    order: 0,
  });
}
