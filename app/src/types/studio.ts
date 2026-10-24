import type {
  ConsonaPaletteId,
  ConsonaHeadShape,
  ConsonaEyeShape,
  EyeTiltMode,
  ConsonaAvatarConfig,
  EyeBgColorMode,
} from '@consona/avatar-enhanced';
import { HEAD_SHAPE_IDS } from '@consona/avatar-enhanced';

export interface StudioParams {
  // Identity & discrete attributes
  seed: string;
  paletteId: ConsonaPaletteId;
  headShape: ConsonaHeadShape;
  eyeShape: ConsonaEyeShape;
  tiltMode: EyeTiltMode;

  // Alignment & Angle
  tiltAngle: number;
  eyeSpacing: number;
  eyeYOffset: number;
  eyeXOffset: number;
  gazeExcursion: number;

  // Geometry & Dimensions
  openness: number;
  eyeWidth: number;
  eyeHeight: number;
  headRoundness: number;
  surfaceShadow?: boolean;
  eyeBorderWidth?: number;
  eyeBorderMode?: 'none' | 'accent' | 'contrast' | 'white' | 'black';
  eyeBgMode?: EyeBgColorMode;
  eyeBgColor?: string;

  // Shape-Matched Pupil
  showPupil?: boolean;
  pupilScale?: number;
  pupilGazeTracking?: number;

  // Animation & Interaction
  /** Resting preset (see `listPresets('consona')`). */
  preset: string;
  interactiveTracking: boolean;
  autoBlink: boolean;
  animated?: boolean;
  manualGazeX: number;
  manualGazeY: number;
}

export interface EyeVariantItem {
  id: ConsonaEyeShape;
  label: string;
  icon: string;
}

export interface AnimationModeItem {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export const EYE_VARIANTS_CATALOG: EyeVariantItem[] = [
  { id: 'capsule', label: 'Capsule', icon: '❚❚' },
  { id: 'dot', label: 'Solid Dot', icon: '●●' },
  { id: 'archUp', label: 'Smiling Arch', icon: '⌒⌒' },
  { id: 'archDown', label: 'Focused Arch', icon: '⌣⌣' },
  { id: 'line', label: 'Zen Dash', icon: '——' },
  { id: 'cross', label: 'Robo Cross', icon: '++' },
  { id: 'diamond', label: 'Diamond', icon: '◆◆' },
  { id: 'star', label: 'Sparkle Star', icon: '✦✦' },
  { id: 'ring', label: 'Hollow Ring', icon: '○○' },
  { id: 'squircle', label: 'Soft Chip', icon: '■■' },
  { id: 'halfPill', label: 'Half Capsule', icon: '◖◖' },
  { id: 'heart', label: 'Vector Heart', icon: '♥♥' },
];

export const ANIMATION_MODES_CATALOG: AnimationModeItem[] = [
  { id: 'naturalBlink', label: 'Natural Blink', icon: '⚡', description: 'Autonomous micro-blinking & double-blinks' },
  { id: 'jumpingSquishy', label: 'Squishy Jump', icon: '🦘', description: 'Physically-modeled squash, stretch, ballistic jump & jelly landing' },
  { id: 'breathing', label: 'Breathing Float', icon: '🫧', description: 'Organic respiration cycle & chest expansion' },
  { id: 'curiousTilt', label: 'Curious Inquisitive', icon: '🤔', description: 'Inquisitive head cock with attentive wide-eyed saccades' },
  { id: 'thinking', label: 'Thinking / Processing', icon: '💭', description: 'Pondering upward-lateral gaze drift with contemplative aperture' },
  { id: 'focusedListening', label: 'Focused Listening', icon: '🎯', description: 'Attentive affirmative micro-nods with steady locked gaze' },
  { id: 'playfulWink', label: 'Playful Companion', icon: '😉', description: 'Cheerful head micro-sway with synchronized playful squint' },
  { id: 'drowsy', label: 'Drowsy / Sleepy', icon: '😴', description: 'Heavy sinking head droop with drooping eyelid cycles' },
  { id: 'saccades', label: 'Saccade Looks', icon: '👀', description: 'Ballistic focal shifts & ocular fixation' },
  { id: 'pulse', label: 'Pulse Scale', icon: '💓', description: 'Rhythmic cardiac double-beat surge' },
  { id: 'radarScan', label: 'Radar Scan', icon: '📡', description: 'Futuristic horizon surveillance sweep' },
  { id: 'dizzySpin', label: 'Dizzy Spin', icon: '💫', description: 'Harmonic orbital gaze & gyro-tilt' },
  { id: 'happyBounce', label: 'Happy Bounce', icon: '✨', description: 'Squash-and-stretch spring bounce' },
  { id: 'idle', label: 'Still / Idle', icon: '⏸', description: 'Serene stillness for static inspection' },
];

export const HEAD_SHAPES_CATALOG: ConsonaHeadShape[] = [...HEAD_SHAPE_IDS];

export type StudioTargetScope = 'all' | 'main' | 'small' | 'micro';

export function createDefaultStudioParams(overrides?: Partial<StudioParams>): StudioParams {
  return {
    seed: 'avatar-bot-01',
    paletteId: 'light',
    headShape: 'circle',
    eyeShape: 'capsule',
    tiltMode: 'spatial3D',
    tiltAngle: 0,
    eyeSpacing: 0.5,
    eyeYOffset: 0.0,
    eyeXOffset: 0.0,
    gazeExcursion: 0.5,
    openness: 1.0,
    eyeWidth: 0.5,
    eyeHeight: 0.5,
    headRoundness: 0.85,
    surfaceShadow: false,
    eyeBorderWidth: 0.0,
    eyeBorderMode: 'accent',
    eyeBgMode: 'accent',
    showPupil: false,
    pupilScale: 0.48,
    pupilGazeTracking: 0.80,
    preset: 'calm',
    interactiveTracking: true,
    autoBlink: true,
    animated: true,
    manualGazeX: 0,
    manualGazeY: 0,
    ...overrides,
  };
}

export function studioParamsToAvatarConfig(
  params: StudioParams
): ConsonaAvatarConfig {
  const size = (params.eyeWidth + params.eyeHeight) / 2;
  const aspectRatio = (0.5 + params.eyeWidth) / (0.5 + params.eyeHeight);
  const avatarMode: 'light' | 'dark' =
    params.paletteId.endsWith('-dark') || params.paletteId === 'dark' ? 'dark' : 'light';

  return {
    seed: params.seed,
    paletteId: params.paletteId,
    mode: avatarMode,
    head: {
      shape: params.headShape,
      roundness: params.headRoundness,
      surfaceShadow: params.surfaceShadow ?? false,
    },
    eyes: {
      shape: params.eyeShape,
      tiltMode: params.tiltMode,
      tiltAngle: params.tiltAngle,
      spacing: Math.max(0, Math.min(1, params.eyeSpacing)),
      yOffset: Math.max(-1, Math.min(1, params.eyeYOffset)),
      xOffset: Math.max(-1, Math.min(1, params.eyeXOffset)),
      size: Math.max(0, Math.min(1, size)),
      aspectRatio,
      openness: Math.max(0, Math.min(1, params.openness)),
      gazeExcursion: Math.max(0, Math.min(2, params.gazeExcursion)),
      borderWidth: params.eyeBorderWidth ?? 0,
      borderMode: params.eyeBorderMode ?? 'accent',
      bgMode: params.eyeBgMode ?? (params.showPupil ? 'white' : 'accent'),
      bgColor: params.eyeBgColor,
      pupil: params.showPupil ?? false,
      showPupil: params.showPupil ?? false,
      pupilScale: params.pupilScale ?? 0.48,
      pupilGazeTracking: Math.max(0, Math.min(2, params.pupilGazeTracking ?? 0.80)),
    },
    behavior: {
      interactive: params.interactiveTracking,
      autoBlink: params.autoBlink ?? true,
      animated: params.animated !== false,
      preset: params.preset,
      glow: false,
    },
  };
}

export function avatarConfigToStudioParams(config: ConsonaAvatarConfig): StudioParams {
  const isPupil =
    config.eyes.showPupil ??
    (typeof config.eyes.pupil === 'object' ? config.eyes.pupil.enabled : config.eyes.pupil) ??
    false;

  const size = config.eyes.size ?? 0.5;
  const ratio = config.eyes.aspectRatio ?? 1.0;
  // Approximate width and height from size and aspect ratio
  const width = Math.max(0.1, Math.min(1.0, size * (2 * ratio / (1 + ratio))));
  const height = Math.max(0.1, Math.min(1.0, size * (2 / (1 + ratio))));

  return {
    seed: config.seed ?? 'avatar-bot-01',
    paletteId: config.paletteId ?? 'light',
    headShape: config.head.shape,
    eyeShape: config.eyes.shape,
    tiltMode: config.eyes.tiltMode ?? 'spatial3D',
    tiltAngle: config.eyes.tiltAngle ?? 0,
    eyeSpacing: config.eyes.spacing ?? 0.5,
    eyeYOffset: config.eyes.yOffset ?? 0.0,
    eyeXOffset: config.eyes.xOffset ?? 0.0,
    gazeExcursion: config.eyes.gazeExcursion ?? 0.5,
    openness: config.eyes.openness ?? 1.0,
    eyeWidth: width,
    eyeHeight: height,
    headRoundness: config.head.roundness ?? 0.85,
    surfaceShadow: Boolean(config.head.surfaceShadow),
    eyeBorderWidth: config.eyes.borderWidth ?? 0,
    eyeBorderMode: (config.eyes.borderMode as any) ?? 'accent',
    eyeBgMode: config.eyes.bgMode,
    eyeBgColor: config.eyes.bgColor,
    showPupil: Boolean(isPupil),
    pupilScale: config.eyes.pupilScale ?? 0.48,
    pupilGazeTracking: config.eyes.pupilGazeTracking ?? 0.80,
    preset: config.behavior?.preset ?? 'calm',
    interactiveTracking: config.behavior?.interactive ?? true,
    autoBlink: config.behavior?.autoBlink ?? true,
    animated: config.behavior?.animated !== false,
    manualGazeX: 0,
    manualGazeY: 0,
  };
}
