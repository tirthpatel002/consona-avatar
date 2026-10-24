import type { ConsonaPaletteId } from './palettes/consona.palettes.ts';
import type { ConsonaHeadShape } from './atoms/head.consona.atom.ts';
import type { ConsonaEyeShape, EyeTiltMode } from './atoms/eyes.consona.atom.ts';

export type { ConsonaHeadShape, ConsonaEyeShape, EyeTiltMode };

export interface ConsonaPupilConfig {
  enabled: boolean;
  scale?: number; // [0.2, 0.8], default 0.48
  color?: string; // Hex color or palette override
  gazeTracking?: number; // [0, 1.0], default 0.45
  opacity?: number;
}

export interface ConsonaHeadConfig {
  shape: ConsonaHeadShape;
  roundness?: number; // [0, 1.0], default 0.85
  scaleX?: number;    // [0.4, 2.0], default 1.0
  scaleY?: number;    // [0.4, 2.0], default 1.0
  surfaceShadow?: boolean; // 3D drop shadow onto floor
}

export type EyeBgColorMode = 'white' | 'black' | 'accent' | 'softAccent' | 'contrast' | 'custom';

export interface ConsonaEyesConfig {
  shape: ConsonaEyeShape;
  tiltMode?: EyeTiltMode;
  tiltAngle?: number; // [-45, 45], default 0
  spacing?: number;   // [0, 1.0], default 0.5
  yOffset?: number;   // [-1.0, 1.0], default 0.0
  xOffset?: number;   // [-1.0, 1.0], default 0.0
  size?: number;      // [0, 1.0], default 0.5
  aspectRatio?: number; // [0.4, 2.5], default 1.0
  openness?: number;  // [0, 1.0], default 1.0
  gazeExcursion?: number; // [0, 2.0], default 0.5
  borderWidth?: number; // [0, 1.0], default 0.0
  borderMode?: 'accent' | 'contrast' | 'white' | 'black' | 'custom' | 'accent-alt' | 'none';
  borderColor?: string;
  bgMode?: EyeBgColorMode; // 'white' | 'black' | 'accent' | 'softAccent' | 'contrast' | 'custom'
  bgColor?: string;        // Hex override when bgMode is 'custom'
  pupil?: boolean | ConsonaPupilConfig;
  showPupil?: boolean;
  pupilScale?: number;
  pupilColor?: string;
  pupilGazeTracking?: number;
}

export interface ConsonaBehaviorConfig {
  interactive?: boolean;
  autoBlink?: boolean;
  animated?: boolean;
  /** Resting preset (e.g. 'neutral', 'happy', 'thinking', 'scanning'; see `listPresets('consona')`). */
  preset?: string;
  glow?: boolean;
  influenceRadius?: number;
}

export interface ConsonaAvatarConfig {
  seed: string;
  paletteId: ConsonaPaletteId;
  mode?: 'light' | 'dark';
  head: ConsonaHeadConfig;
  eyes: ConsonaEyesConfig;
  behavior?: ConsonaBehaviorConfig;
  atoms?: Record<string, any>;
}

export type PartialConsonaAvatarConfig = {
  seed?: string;
  paletteId?: ConsonaPaletteId;
  mode?: 'light' | 'dark';
  head?: Partial<ConsonaHeadConfig>;
  eyes?: Partial<ConsonaEyesConfig>;
  behavior?: Partial<ConsonaBehaviorConfig>;
  atoms?: Record<string, any>;
};

/**
 * Creates a fully validated, default ConsonaAvatarConfig merged with any partial overrides.
 */
export function createDefaultAvatarConfig(
  seed: string = 'consona-default',
  paletteId: ConsonaPaletteId = 'light',
  overrides?: PartialConsonaAvatarConfig
): ConsonaAvatarConfig {
  const isPupil = overrides?.eyes?.showPupil ?? overrides?.eyes?.pupil ?? false;
  const isShadow = overrides?.head?.surfaceShadow ?? false;

  const headOverrides = overrides?.head || {};
  const head: ConsonaHeadConfig = {
    roundness: headOverrides.roundness ?? 0.85,
    surfaceShadow: isShadow,
    scaleX: headOverrides.scaleX ?? 1.0,
    scaleY: headOverrides.scaleY ?? 1.0,
    shape: (headOverrides.shape || 'circle') as ConsonaHeadShape,
  };

  const eyesOverrides = overrides?.eyes || {};
  const eyes: ConsonaEyesConfig = {
    openness: eyesOverrides.openness ?? 1.0,
    size: eyesOverrides.size ?? 0.5,
    aspectRatio: eyesOverrides.aspectRatio ?? 1.0,
    spacing: eyesOverrides.spacing ?? 0.5,
    xOffset: eyesOverrides.xOffset ?? 0.0,
    yOffset: eyesOverrides.yOffset ?? 0.0,
    tiltMode: eyesOverrides.tiltMode || 'spatial3D',
    tiltAngle: eyesOverrides.tiltAngle ?? 0.0,
    borderWidth: eyesOverrides.borderWidth ?? 0.0,
    borderMode: eyesOverrides.borderMode || 'accent',
    bgMode: eyesOverrides.bgMode ?? (isPupil ? 'white' : 'accent'),
    bgColor: eyesOverrides.bgColor,
    pupil: isPupil,
    showPupil: Boolean(typeof isPupil === 'object' ? isPupil.enabled !== false : isPupil),
    pupilScale: eyesOverrides.pupilScale ?? 0.48,
    pupilGazeTracking: eyesOverrides.pupilGazeTracking ?? 0.80,
    shape: (eyesOverrides.shape || 'capsule') as ConsonaEyeShape,
    gazeExcursion: eyesOverrides.gazeExcursion ?? 0.5,
  };

  const preset = overrides?.behavior?.preset ?? 'neutral';

  return {
    seed: overrides?.seed ?? seed,
    paletteId: overrides?.paletteId ?? paletteId,
    mode: overrides?.mode ?? (paletteId.endsWith('-dark') || paletteId === 'dark' ? 'dark' : 'light'),
    head,
    eyes,
    behavior: {
      interactive: overrides?.behavior?.interactive ?? true,
      autoBlink: overrides?.behavior?.autoBlink ?? true,
      animated: overrides?.behavior?.animated ?? true,
      glow: overrides?.behavior?.glow ?? false,
      ...overrides?.behavior,
      preset,
    },
    atoms: {
      ...overrides?.atoms,
    },
  };
}
