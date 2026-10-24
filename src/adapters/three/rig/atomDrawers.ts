import type * as THREE from 'three';
import type { ResolvedAvatarDefinition } from '../../../core/define/resolveAvatar.ts';
import type { FurLayers } from './parts/furShells.ts';
import type { FurTweens } from './parts/furTweens.ts';
import type { EyeRig, EyeClearing } from './parts/reliefEyes.ts';
import type { JellySim } from './parts/jelly.ts';
import type { MouthClearing } from './parts/mouthMask.ts';
import type { BandClearing } from './parts/bandMask.ts';
import type { RigAccessory, ThreeAvatarRig } from './assembleRig.ts';
import type { RigAnchors, RigLimbs } from './anchors.ts';
import type { AtomDefinition } from '../../../core/atom/atom.ts';
import type { AtomDrawing } from './parts/atoms.ts';
import type { AtomState, AvatarReachState } from '../../../core/atom/atomLayer.ts';
import type { Rgb } from '../../../core/color/color.ts';
import type { ChannelBank } from '../../../core/channel/channel.ts';
import type { AvatarLimbTracker } from '../../../core/atom/limbLayer.ts';
import type { AvatarEffectQueue } from '../../../core/event/effects.ts';

/**
 * Emissive spot a surface part exposes (e.g. `shellFur`): `uGlow` = centre
 * (procedural space) + radius, `uGlowColor` = colour × strength (black = off,
 * the shader skips it). A composition atom (e.g. a plugin glow) drives it — uniform writes only.
 */
export interface SurfaceGlowUniforms {
  uGlow: { value: THREE.Vector4 };
  uGlowColor: { value: THREE.Color };
}

// ---------- pluggable parts ----------

/** Mutable build state handed to every atom drawer in order. */
export interface RigBuildContext {
  def: ResolvedAvatarDefinition;
  profile: Required<RigProfile>;
  root: THREE.Group;
  squash: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  procedural: THREE.Group;
  pivots: Record<string, THREE.Group>;
  /** Set by the `body` part. */
  geometry?: THREE.BufferGeometry;
  /** Body-space probe mesh sharing `geometry` (raycasts). */
  probe?: THREE.Mesh;
  surfaceAt?: ThreeAvatarRig['surfaceAt'];
  surfaceRadial?: ThreeAvatarRig['surfaceRadial'];
  /** Set by a surface part (e.g. `furShells`); the `body` fallback is a plain mesh. */
  bodyMesh?: THREE.Mesh;
  layers?: FurLayers;
  /** Live fur tweens owned by the fur part (`furShells` / `shellFur`). */
  furTweens?: FurTweens;
  /** Optional eye clearing hook provided by a surface part. */
  eyeClearing?: EyeClearing | null;
  eyes?: EyeRig;
  /** Optional mouth clearing hook provided by a surface part (e.g. `shellFur`). */
  mouthClearing?: MouthClearing | null;
  /** Optional hairband decal hook provided by a surface part (e.g. `shellFur`). */
  bandClearing?: BandClearing | null;
  accessories: RigAccessory[];
  /** Per-frame hooks a part can register (e.g. custom eyes that blink). */
  updaters: RigUpdater[];
  buildAccessory?: ThreeAvatarRig['buildAccessory'];
  jelly?: JellySim;
  /** Anchor resolver (family provider or generic; reads the live fields above lazily). */
  anchors: RigAnchors;
  /** Simulated limbs, set by a limb part (e.g. `tentacles`): tips feed anchors. */
  limbs?: RigLimbs;
  /** Emissive spot on the body surface (set by `shellFur`); glow drawers fall back to a sprite without it. */
  surfaceGlow?: SurfaceGlowUniforms;
}

/** Per-frame state handed to rig-part updaters (after behaviors / gaze / jelly). */
export interface RigFrame {
  dt: number;
  time: number;
  /** 0..1 (random blink + eye-swap blink). */
  blink: number;
  /** Behavior eye-pose overlay (relative, see `AvatarFaceState.eyeOverlay`). */
  eyeOverlay?: { pose: string; weight: number; mirror?: boolean } | null;
  /** Mouth shape an behavior shows right now (null / undefined = configured / preset mouth). */
  mouthShape?: string | null;
  preset: string;
  /** Live atoms (`AvatarStateMachine.atoms.states`); the `atoms` part draws the visible ones. */
  atoms?: readonly AtomState[];
  /** Live reach request (`AvatarStateMachine.reach`); limb parts answer it. */
  reach?: AvatarReachState;
  /** The definition currently shown: the edited definition with the preset's live overrides. */
  definition: ResolvedAvatarDefinition;
  /** Bumped when `definition` changed in place (preset modulation); compare with identity to skip work. */
  revision: number;
  rig: ThreeAvatarRig;
  /** Body colour as shown (sRGB 0..1, valence tint applied). */
  bodyRgb?: Readonly<Rgb>;
  /** Valence glow colour (sRGB) and its strength 0..1 (`glow`). */
  glowRgb?: Readonly<Rgb>;
  glow?: number;
  /** Live `valence` channel −1..1. */
  valence?: number;
  /** Bumped whenever `bodyRgb` / the glow changed (parts compare it numerically). */
  colorRevision?: number;
  /** The avatar's channels (fixed slots; parts resolve the slots they read once). */
  channels?: ChannelBank;
  /** Per-limb requests + limb tone (calm / slack) from behaviors and postures. */
  limbs?: AvatarLimbTracker;
  /** One-shot effect requests to drain (`effects` part). */
  effects?: AvatarEffectQueue;
  /** Camera of this frame (billboards), null when unknown. */
  camera?: THREE.Camera | null;
}
/**
 * Per-frame hook. The SAME frame object is handed to every updater every
 * frame (refilled, never reallocated): read it, don't keep it.
 */
export type RigUpdater = (frame: RigFrame) => void;

/**
 * The Three drawer of one atom kind (one registry per renderer). A
 * structural atom (listed in a family's composition) is built into the rig
 * once (`build`); an anchored atom (attached at an anchor at runtime by a
 * behavior / channel) gets its drawing lazily, once per rig (`draw`).
 */
export interface AtomDrawer {
  kind: string;
  build?(ctx: RigBuildContext): void;
  draw?(atom: AtomDefinition): AtomDrawing;
}

const drawers = new Map<string, AtomDrawer>();

/** Register (or replace) the Three drawer of an atom kind. */
export function registerAtomDrawer(drawer: AtomDrawer): void {
  drawers.set(drawer.kind, drawer);
}

export function getAtomDrawer(kind: string): AtomDrawer | undefined {
  return drawers.get(kind);
}

export function listAtomDrawers(): string[] {
  return Array.from(drawers.keys());
}

/** Per-family rig profile: the default composition, extra pivots, body centre. */
export interface RigProfile {
  /** Structural atom kinds in build order (default `DEFAULT_COMPOSITION`). */
  atoms?: string[];
  /** Extra empty pivots under `body` (e.g. 'tail'), exposed as `rig.pivots`. */
  pivots?: string[];
  /** Body centre height (default 0.75). */
  bodyCenterY?: number;
}

/** `reliefMouth` is a no-op for definitions without a `mouth` (families opt in via mouth defaults); `atoms` / `effects` cost nothing until something shows (lazy, idle early-exit). */
export const DEFAULT_COMPOSITION = ['body', 'furShells', 'reliefEyes', 'reliefMouth', 'accessories', 'atoms', 'effects', 'jelly'];
const DEFAULT_PROFILE: Required<RigProfile> = { atoms: DEFAULT_COMPOSITION, pivots: [], bodyCenterY: 0.75 };
const profiles = new Map<string, RigProfile>();

/** Declare a family's rig profile (merged over the neutral default). */
export function registerRigProfile(family: string, profile: RigProfile): void {
  profiles.set(family, { ...profiles.get(family), ...profile });
}

export function getRigProfile(family?: string): Required<RigProfile> {
  return { ...DEFAULT_PROFILE, ...((family && profiles.get(family)) || {}) };
}

