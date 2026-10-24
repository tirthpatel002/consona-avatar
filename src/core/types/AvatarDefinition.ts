import type { AvatarPoseWriter } from '../animation/pose.ts';
import type { BehaviorEnd } from '../animation/timeline.ts';
import type { AvatarEyeAnchor, AvatarEyesOptions } from '../face/eyes.ts';
import type { AvatarGazeOptions } from '../controllers/gaze.ts';
/**
 * Avatar core types — renderer-agnostic (no `three` import).
 *
 * A avatar is described declaratively by an `AvatarDefinition`; the Three.js
 * adapter (`@consona/avatar/three`) turns it into a scene rig, and the
 * `AvatarStateMachine` drives behaviors/presets against any rig that satisfies
 * the structural `AvatarRig` contract below (Three.js Object3D does).
 */

/** Anything with x/y/z and a `set` — matches THREE.Vector3 and THREE.Euler structurally. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): unknown;
}

export interface TransformLike {
  position: Vec3Like;
  rotation: Vec3Like;
  scale: Vec3Like;
  /** Orientation quaternion (THREE.Object3D has one, kept in sync with `rotation`). */
  quaternion?: { set(x: number, y: number, z: number, w: number): unknown };
}

/**
 * Hierarchy contract used by procedural behaviors:
 * root (position / jump) > squash (uniform scale) > body (rotation / squash-stretch; carries the eyes) > head (free pivot for behaviors).
 */
export interface AvatarRig {
  root: TransformLike;
  body: TransformLike;
  head: TransformLike;
  /** Optional raised hand pivot (e.g. the yellow blob's nub). */
  hand?: TransformLike;
  /** Resting root Y. */
  baseY: number;
  /** Resting hand Z rotation. */
  handRest: number;
  /** Per-avatar random phase so idle loops are not in lockstep. */
  phase: number;
}

/** Describes one behavior parameter for tools (studio controls). */
export type BehaviorParam =
  | { kind: 'number'; label?: string; default: number; min?: number; max?: number; step?: number }
  | { kind: 'select'; label?: string; default: string; options: string[] }
  | { kind: 'text'; label?: string; default: string }
  | { kind: 'vector3'; label?: string; default: [number, number, number]; presets?: Record<string, [number, number, number]> };

/** Mutable face state shared by the state machine and the eye rig (eyes never move on the body). */
export interface AvatarFaceState {
  /** 0 = open, 1 = closed. */
  blink: number;
  preset: PresetName;
  /**
   * Temporary eye-pose overlay written by behaviors (`ctx.pose.eyePose`): the
   * named preset eye pose is added RELATIVELY (its offset from neutral, x weight)
   * on top of the live preset eyes; `mirror` swaps its left/right eyes. The eye
   * rig eases toward it like a preset change (smooth in / out, seamless pickup).
   */
  eyeOverlay?: AvatarEyeOverlay | null;
  /** Mouth shape an behavior shows for now (`ctx.pose.mouth`); null = the configured / preset mouth. */
  mouth?: string | null;
}

export interface AvatarEyeOverlay {
  pose: PresetName;
  weight: number;
  mirror: boolean;
}

/** Preset key (eye pose registry, see `registerEyePose`). */
export type PresetName = string;

export type ColorLike = number | string;

/** Renderer a family / avatar targets: 'svg' (core scene graph), 'three' (`@consona/avatar/three`), or a custom adapter id. */
export type AvatarRendererId = 'svg' | 'three' | (string & {});

/** Point deformer applied to every vertex of a unit sphere. `angle` = atan2(z, x). */
export type ShapeDeformer = (v: { x: number; y: number; z: number }, angle: number) => void;

/** Registered body shape name (see `registerAvatarShape`); `'sphere'` is always available. */
export type BodyShapeName = string;

export interface AvatarBodyOptions {
  /**
   * Registered shape name (a sphere deformer from `registerAvatarShape`, or a
   * Three body-geometry builder from `registerBodyGeometry`), or a custom deformer.
   */
  shape: BodyShapeName | ShapeDeformer;
  /** Builder-specific parameters (body-geometry builders). */
  params?: Record<string, unknown>;
  color: ColorLike;
  /**
   * The body colour accessories / tinted eye parts were authored against
   * (default: the colour at mount). They keep their relative tint/shade/hue
   * offset from it when `color` changes, so presets are unchanged at their
   * default colour.
   */
  colorRef?: ColorLike;
  /** Uniform scale of the whole character (default 1). */
  scale?: number;
  /** Sphere tessellation (default [96, 64]). */
  segments?: [number, number];
}

/**
 * Accessory descriptor. `type` selects a builder registered with the Three
 * adapter's `registerAccessory(type, builder)`; remaining fields are builder options.
 * Avatar packages narrow this with their own typed descriptors.
 */
export interface AvatarAccessory {
  type: string;
  /** `false` skips building it (studio toggles). Default true. */
  enabled?: boolean;
  /**
   * Colours follow the body colour as a relative tint/shade/hue offset from
   * `body.colorRef` (default true). `false` = explicit, fixed colours.
   */
  followBody?: boolean;
  [option: string]: unknown;
}

/** Procedural (or clip-backed) behavior. */
export interface BehaviorContext<R extends AvatarRig = AvatarRig> {
  rig: R;
  /**
   * Where the behavior writes its motion (reset every frame). `relative`
   * behaviors write offsets from rest that are layered on the live pose;
   * `absolute` behaviors write the pose to reach.
   */
  pose: AvatarPoseWriter;
  face: AvatarFaceState;
  /** Seconds since the behavior started (clamped to duration). */
  t: number;
  dt: number;
  /** Parameters of this run (`do(name, { params })`); `{}` when none. */
  params: Record<string, unknown>;
  /** Duration of this run in seconds (the definition's, or `params.duration`). */
  duration: number;
}

/** A timed cue of an behavior run (see `BehaviorDefinition.cues`). */
export interface BehaviorCue {
  /** Seconds into the run. */
  at: number;
  /** Cue name (e.g. 'step', 'beat', 'tap', 'sparkle'). */
  name: string;
  /** Payload passed with the `cue` event (e.g. the step's text). */
  data?: Readonly<Record<string, unknown>>;
  /** Effect queued for the renderer when the cue fires. */
  effect?: import('../event/effects.ts').AvatarEffectRequest;
}

export interface BehaviorDefinition<R extends AvatarRig = AvatarRig> {
  name: string;
  /**
   * Seconds. `Infinity` loops forever (idle). `'clip'` finishes only when
   * `AvatarStateMachine.complete()` is called (e.g. by an AnimationMixer 'finished' event).
   */
  duration: number | 'clip';
  /** Preset shown while the behavior plays; `null`/omitted keeps the current default preset. */
  preset?: PresetName | null;
  /** When true the pointer-follow gaze is suspended (the behavior drives the body). */
  ownsGaze?: boolean;
  /**
   * How much the gaze may still turn the face/body during this behavior, 0..1
   * (blended smoothly). Default 1 for the idle behavior, 0.8 otherwise; e.g. 0 for a spin.
   */
  gaze?: number;
  /** Studio/UI hints for `params` (auto-generated controls). */
  params?: Record<string, BehaviorParam>;
  /** 'relative' (default): offsets on top of the live pose. 'absolute': a pose reached from the live pose (poses, look-ats). */
  mode?: 'relative' | 'absolute';
  /** Seconds to blend in from the live pose (default 0.15; idle 0.35). */
  blendIn?: number;
  /** When it ends with nothing queued: 'rest' (default) eases back over ~0.35 s; 'hold' keeps the final pose until the next behavior. */
  end?: BehaviorEnd;
  /**
   * Waiting behavior: named outcomes → follow-up behavior. The behavior runs (usually
   * `duration: Infinity`, a looping wait phase after its intro) until
   * `resolve(outcome)` hands off to the follow-up from the live pose — a normal
   * seamless behavior switch (atoms / reach the follow-up keeps writing carry on).
   * The first outcome is the default. Any other behavior still interrupts it.
   */
  outcomes?: Readonly<Record<string, string>>;
  /** Not listed in behavior pickers (e.g. follow-ups reached through `outcomes`). */
  hidden?: boolean;
  /**
   * Timed cues: the state machine emits a `cue` event when the run crosses
   * each one (hosts sync UI text / haptics to it) and queues its `effect`
   * (e.g. sparkles) for the renderer. A function is evaluated once per run
   * (it gets the run's duration / params, e.g. sequenced steps scaled to
   * `params.duration`).
   */
  cues?: readonly BehaviorCue[] | ((run: { duration: number; params: Record<string, unknown> }) => readonly BehaviorCue[]);
  /** Channel targets held while this runs (e.g. `{ pulse: 60 }` for a calm rate): win over `set()` for levels; a rhythm's measured rate wins. */
  channels?: Readonly<Record<string, number>>;
  enter?(ctx: BehaviorContext<R>): void;
  update?(ctx: BehaviorContext<R>): void;
  exit?(ctx: BehaviorContext<R>): void;
}

export interface AvatarModelOptions {
  /** glTF / GLB url exported from Blender. */
  url: string;
  /** Hide the procedural body + accessories when the model loads (default true). */
  replaceProcedural?: boolean;
  /** Map avatar behavior name -> glTF clip name. Unmapped behaviors stay procedural. */
  clips?: Record<string, string>;
  /** Transform applied to the loaded scene. */
  position?: [number, number, number];
  scale?: number;
}

export interface AvatarDefinition {
  id: string;
  name?: string;
  /** Renderer adapter (default: the family's renderer, usually 'three' for body avatars). */
  renderer?: AvatarRendererId;
  /** Avatar family id: scopes registry lookups (behaviors, presets) to that family before the shared entries. */
  family?: string;
  body: AvatarBodyOptions;
  /** Where the eyes sit on this body (default `DEFAULT_ANCHOR`). */
  anchor?: AvatarEyeAnchor;
  /** Eyes (one 3D eye system, embedded in the body surface; shape + layout + colours). */
  eyes?: AvatarEyesOptions;
  /** Default preset (eye pose). */
  preset?: PresetName;
  accessories?: AvatarAccessory[];
  /** Extra / overriding behaviors for this avatar. */
  behaviors?: BehaviorDefinition[];
  /** Optional Blender/GLB replacement path. */
  model?: AvatarModelOptions;
  /** World position of the base [x, y, z] (default [0, -1.7, 0]). */
  position?: [number, number, number];
  /** Soft-body ("water balloon") secondary motion. `false` disables it. */
  jelly?: AvatarJellyOptions | false;
  /** Gaze: the whole body turns / tilts / leans toward the pointer / `lookAt`. `false` disables it. */
  gaze?: AvatarGazeOptions | false;
}

/** Soft-body jiggle tuning (damped springs driven by the avatar's own motion). */
export interface AvatarJellyOptions {
  /** Spring stiffness (default 120): higher = faster, tighter wobble. */
  stiffness?: number;
  /** Damping ratio (default 0.18): lower = wobbles longer before settling. */
  damping?: number;
  /** Overall deformation amount (default 1). */
  amount?: number;
  /** Gentle idle jiggle (default 0.35). */
  idle?: number;
  /** Poke/click dent strength (default 1). */
  poke?: number;
}
