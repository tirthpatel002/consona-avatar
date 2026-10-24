import { clamp } from '../../../core/math/Interpolation.ts';
import type { ConsonaAvatarConfig, ConsonaPupilConfig } from '../consona.config.ts';
import { resolvePalette, type ConsonaPaletteId } from '../palettes/consona.palettes.ts';

export const CANVAS_DOMAIN = {
  SPACING_MIN: 10,
  SPACING_MAX: 34,
  Y_OFFSET_CENTER: 44,
  Y_OFFSET_RANGE: 14, // 44 - 14 = 30 (min), 44 + 14 = 58 (max)
  X_OFFSET_RANGE: 14,
  GAZE_EXCURSION_MIN: 0,
  GAZE_EXCURSION_BASE: 12, // Baseline sensitivity at 100% (1.0)
  GAZE_EXCURSION_MAX: 24,  // At 200% (2.0)
  BASE_EYE_WIDTH: 10.5,
  BASE_EYE_HEIGHT: 22.0,
  BASE_HEAD_WIDTH: 78.0,
  BASE_HEAD_HEIGHT: 78.0,
} as const;

export function normalizePupilConfig(config?: boolean | ConsonaPupilConfig): ConsonaPupilConfig {
  if (typeof config === 'boolean') {
    return { enabled: config, scale: 0.48, gazeTracking: 0.80 };
  }
  return {
    enabled: config?.enabled ?? false,
    scale: config?.scale ?? 0.48,
    color: config?.color,
    gazeTracking: config?.gazeTracking ?? 0.80,
  };
}

/**
 * Transforms a normalized ConsonaAvatarConfig into node channel parameter maps.
 */
export function normalizeToCanvas(
  config: ConsonaAvatarConfig
): Record<string, any> {
  const paletteId = (config.paletteId as string) ?? 'light';
  const mode = config.mode ?? 'light';
  const paletteDef = resolvePalette(paletteId, mode);

  // 1. Spacing & Position
  const spacingRatio = clamp(config.eyes?.spacing ?? 0.5, 0, 1);
  const canvasSpacing = CANVAS_DOMAIN.SPACING_MIN + spacingRatio * (CANVAS_DOMAIN.SPACING_MAX - CANVAS_DOMAIN.SPACING_MIN);
  const canvasYOffset = CANVAS_DOMAIN.Y_OFFSET_CENTER + clamp(config.eyes?.yOffset ?? 0, -1, 1) * CANVAS_DOMAIN.Y_OFFSET_RANGE;
  const canvasXOffset = clamp(config.eyes?.xOffset ?? 0, -1, 1) * CANVAS_DOMAIN.X_OFFSET_RANGE;

  // 2. Eye Sizing & Dimensions
  const sizeRatio = clamp(config.eyes?.size ?? 0.5, 0, 1);
  const sizeFactor = 0.5 + sizeRatio * 1.0; // [0.5, 1.5]
  const aspectRatio = clamp(config.eyes?.aspectRatio ?? 1.0, 0.4, 2.5);
  const aspectMod = Math.sqrt(aspectRatio);

  const eyeWidth = CANVAS_DOMAIN.BASE_EYE_WIDTH * sizeFactor * aspectMod;
  const eyeHeight = CANVAS_DOMAIN.BASE_EYE_HEIGHT * sizeFactor / aspectMod;

  // 3. Gaze Excursion & Tilt with desensitized low-end response curve (power 2.4)
  const rawExcursion = clamp(config.eyes?.gazeExcursion ?? 0.5, 0, 2);
  const canvasExcursion = rawExcursion <= 1.0
    ? Math.pow(rawExcursion, 2.4) * CANVAS_DOMAIN.GAZE_EXCURSION_BASE
    : CANVAS_DOMAIN.GAZE_EXCURSION_BASE + (rawExcursion - 1.0) * (CANVAS_DOMAIN.GAZE_EXCURSION_MAX - CANVAS_DOMAIN.GAZE_EXCURSION_BASE);
  const tiltDeg = clamp(config.eyes?.tiltAngle ?? 0, -45, 45);
  const openness = clamp(config.eyes?.openness ?? 1.0, 0, 1);

  // 4. Head Geometry
  const headScaleX = clamp(config.head?.scaleX ?? 1.0, 0.4, 2.0);
  const headScaleY = clamp(config.head?.scaleY ?? 1.0, 0.4, 2.0);
  const headRoundness = clamp(config.head?.roundness ?? 0.85, 0, 1);

  // 5. Eye Border / Stroke Resolution
  const borderRatio = clamp(config.eyes?.borderWidth ?? 0, 0, 1);
  const strokeWidth = borderRatio > 0 ? 0.6 + borderRatio * 3.4 : 0;

  let strokeColor: string = '';
  if (strokeWidth > 0) {
    const borderMode = config.eyes?.borderMode ?? (config.eyes?.borderColor ? 'custom' : 'accent');
    switch (borderMode) {
      case 'white':
        strokeColor = '#FFFFFF';
        break;
      case 'black':
        strokeColor = '#000000';
        break;
      case 'contrast':
      case 'accent-alt':
        strokeColor = paletteDef.eyeBorderAlt ?? paletteDef.highlight ?? '#FFFFFF';
        break;
      case 'custom':
        strokeColor = config.eyes?.borderColor ?? paletteDef.eyeBorder ?? paletteDef.accent;
        break;
      case 'accent':
      default:
        strokeColor = paletteDef.eyeBorder ?? paletteDef.accent ?? '#FFFFFF';
        break;
    }
  }

  const pupilCfg = normalizePupilConfig(
    config.eyes?.pupil !== undefined
      ? config.eyes.pupil
      : config.eyes?.showPupil !== undefined
      ? config.eyes.showPupil
      : false
  );
  if (config.eyes?.pupilScale !== undefined) pupilCfg.scale = config.eyes.pupilScale;
  if (config.eyes?.pupilColor !== undefined) pupilCfg.color = config.eyes.pupilColor;
  if (config.eyes?.pupilGazeTracking !== undefined) pupilCfg.gazeTracking = config.eyes.pupilGazeTracking;

  const headChannels = {
    shape: config.head?.shape ?? 'circle',
    width: CANVAS_DOMAIN.BASE_HEAD_WIDTH * headScaleX,
    height: CANVAS_DOMAIN.BASE_HEAD_HEIGHT * headScaleY,
    roundness: headRoundness,
    surfaceShadow: config.head?.surfaceShadow ?? false,
  };

  const eyesChannels = {
    shape: config.eyes?.shape ?? 'capsule',
    spacing: canvasSpacing,
    yOffset: canvasYOffset,
    xOffset: canvasXOffset,
    width: eyeWidth,
    height: eyeHeight,
    tiltMode: config.eyes?.tiltMode ?? 'spatial3D',
    tiltDeg,
    openness,
    gazeExcursion: canvasExcursion,
    strokeWidth,
    strokeColor,
    bgMode: config.eyes?.bgMode ?? (pupilCfg.enabled ? 'white' : 'accent'),
    bgColor: config.eyes?.bgColor ?? '',
    pupilEnabled: pupilCfg.enabled,
    pupilScale: pupilCfg.scale,
    pupilColor: pupilCfg.color ?? '',
    pupilGazeTracking: pupilCfg.gazeTracking,
    leftEye: {
      shape: config.eyes?.shape ?? 'capsule',
      openness,
    },
    rightEye: {
      shape: config.eyes?.shape ?? 'capsule',
      openness,
    },
  };

  return {
    seed: config.seed,
    paletteId: config.paletteId,
    mode: config.mode,
    head: headChannels,
    eyes: eyesChannels,
    'consona:head': headChannels,
    'consona:eyes': eyesChannels,
    ...config.atoms,
  };
}

/**
 * Converts channel values back into a normalized ConsonaAvatarConfig.
 */
export function canvasToNormalized(
  channels: Record<string, any>,
  baseConfig?: Partial<ConsonaAvatarConfig>
): ConsonaAvatarConfig {
  const head = channels.head ?? channels['consona:head'];
  const eyes = channels.eyes ?? channels['consona:eyes'];

  const spacing = eyes?.spacing !== undefined
    ? clamp((eyes.spacing - CANVAS_DOMAIN.SPACING_MIN) / (CANVAS_DOMAIN.SPACING_MAX - CANVAS_DOMAIN.SPACING_MIN), 0, 1)
    : 0.5;

  const yOffset = eyes?.yOffset !== undefined
    ? clamp((eyes.yOffset - CANVAS_DOMAIN.Y_OFFSET_CENTER) / CANVAS_DOMAIN.Y_OFFSET_RANGE, -1, 1)
    : 0.0;

  const xOffset = eyes?.xOffset !== undefined
    ? clamp(eyes.xOffset / CANVAS_DOMAIN.X_OFFSET_RANGE, -1, 1)
    : 0.0;

  const avgWidth = eyes?.width ?? CANVAS_DOMAIN.BASE_EYE_WIDTH;
  const avgHeight = eyes?.height ?? CANVAS_DOMAIN.BASE_EYE_HEIGHT;
  const areaRatio = Math.sqrt((avgWidth * avgHeight) / (CANVAS_DOMAIN.BASE_EYE_WIDTH * CANVAS_DOMAIN.BASE_EYE_HEIGHT));
  const size = clamp(areaRatio - 0.5, 0, 1);
  const aspectRatio = clamp((avgWidth / CANVAS_DOMAIN.BASE_EYE_WIDTH) / (avgHeight / CANVAS_DOMAIN.BASE_EYE_HEIGHT), 0.4, 2.5);

  let gazeExcursion = 0.5;
  if (eyes?.gazeExcursion !== undefined) {
    const ce = clamp(eyes.gazeExcursion, CANVAS_DOMAIN.GAZE_EXCURSION_MIN, CANVAS_DOMAIN.GAZE_EXCURSION_MAX);
    if (ce <= CANVAS_DOMAIN.GAZE_EXCURSION_BASE) {
      gazeExcursion = Math.pow(ce / CANVAS_DOMAIN.GAZE_EXCURSION_BASE, 1 / 2.4);
    } else {
      gazeExcursion = 1.0 + (ce - CANVAS_DOMAIN.GAZE_EXCURSION_BASE) / (CANVAS_DOMAIN.GAZE_EXCURSION_MAX - CANVAS_DOMAIN.GAZE_EXCURSION_BASE);
    }
  }

  return {
    seed: channels.seed ?? baseConfig?.seed ?? 'consona-default',
    paletteId: (channels.paletteId ?? baseConfig?.paletteId ?? 'light') as ConsonaPaletteId,
    head: {
      shape: head?.shape ?? 'circle',
      roundness: head?.roundness ?? 0.85,
      scaleX: head?.width ? head.width / CANVAS_DOMAIN.BASE_HEAD_WIDTH : 1.0,
      scaleY: head?.height ? head.height / CANVAS_DOMAIN.BASE_HEAD_HEIGHT : 1.0,
      surfaceShadow: head?.surfaceShadow ?? false,
    },
    eyes: {
      shape: eyes?.shape ?? 'capsule',
      tiltMode: eyes?.tiltMode ?? 'spatial3D',
      tiltAngle: eyes?.tiltDeg ?? 0,
      spacing,
      yOffset,
      xOffset,
      size,
      aspectRatio,
      openness: eyes?.openness ?? 1.0,
      gazeExcursion,
      bgMode: eyes?.bgMode ?? baseConfig?.eyes?.bgMode,
      bgColor: eyes?.bgColor || baseConfig?.eyes?.bgColor || undefined,
      pupil: eyes?.pupilEnabled ?? false,
      showPupil: Boolean(eyes?.pupilEnabled),
      pupilScale: eyes?.pupilScale ?? 0.48,
      pupilColor: eyes?.pupilColor || undefined,
      pupilGazeTracking: eyes?.pupilGazeTracking ?? 0.80,
    },
    behavior: {
      interactive: baseConfig?.behavior?.interactive ?? true,
      autoBlink: baseConfig?.behavior?.autoBlink ?? true,
      preset: baseConfig?.behavior?.preset ?? 'neutral',
      glow: baseConfig?.behavior?.glow ?? false,
      influenceRadius: baseConfig?.behavior?.influenceRadius ?? 340,
    },
  };
}
