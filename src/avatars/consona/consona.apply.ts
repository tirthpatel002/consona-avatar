import type { AvatarInstance } from '../../core/engine/AvatarInstance.ts';
import type { ConsonaAvatarConfig, ConsonaPupilConfig } from './consona.config.ts';
import { resolvePalette } from './palettes/consona.palettes.ts';
import { normalizeToCanvas } from './layout/consona.layout.ts';
import { lerp as mix } from '../../core/math/Interpolation.ts';

/**
 * Consona config → live instance (family logic; the engine stays a facade).
 */
/** Last config preset applied per instance. */
const configPresets = new WeakMap<AvatarInstance, string>();

/** Pupil config → eye channels. */
export function consonaPupilChannels(pupil: boolean | ConsonaPupilConfig): Record<string, unknown> {
  const isEnabled = typeof pupil === 'object' ? pupil.enabled !== false : Boolean(pupil);
  return {
    pupilEnabled: isEnabled,
    pupilScale: typeof pupil === 'object' && pupil.scale !== undefined ? pupil.scale : 0.48,
    pupilGazeTracking:
      typeof pupil === 'object' && pupil.gazeTracking !== undefined ? pupil.gazeTracking : 0.45,
  };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
  }
  return false;
}

/** Write a channel only when its value changes (no dirty storms). */
export function setConsonaChannel(
  instance: AvatarInstance,
  nodeId: string,
  channelName: string,
  value: unknown
): void {
  const current = instance.channels.get(nodeId, channelName);
  if (valuesEqual(current, value)) return;
  instance.channels.set(nodeId, channelName, value);
}

/**
 * Apply public config → channels. Skips unchanged channel writes and behavior toggles.
 */
export function applyConsonaConfig(instance: AvatarInstance, config: ConsonaAvatarConfig): void {
  const palette = resolvePalette(config.paletteId, config.mode);
  const mode = config.mode ?? palette.mode ?? 'light';
  if (
    instance.renderContext.paletteId !== config.paletteId ||
    instance.renderContext.mode !== mode
  ) {
    instance.setPalette(config.paletteId, palette, mode);
  } else {
    instance.renderContext.theme = palette;
  }
  instance.renderContext.seed = config.seed ?? 'default';

  const normalized = normalizeToCanvas(config);
  if (normalized.head) {
    for (const [key, val] of Object.entries(normalized.head)) {
      setConsonaChannel(instance, 'consona:head', key, val);
    }
  }
  if (normalized.eyes) {
    for (const [key, val] of Object.entries(normalized.eyes)) {
      setConsonaChannel(instance, 'consona:eyes', key, val);
    }
  }

  const isInteractive = config.behavior?.interactive !== false;
  const gazeCtrl = instance.getController('pointer-gaze') as { enabled?: boolean } | undefined;
  if (gazeCtrl && gazeCtrl.enabled !== isInteractive) {
    gazeCtrl.enabled = isInteractive;
  }

  const isAutoBlink = config.behavior?.autoBlink !== false;
  const blinkCtrl = instance.getController('auto-blink') as { enabled?: boolean } | undefined;
  if (blinkCtrl && blinkCtrl.enabled !== isAutoBlink) {
    blinkCtrl.enabled = isAutoBlink;
    if (!isAutoBlink) instance.mixer.stop('blink');
  }

  const isAnimated = config.behavior?.animated !== false;
  if (instance.animated !== isAnimated) {
    instance.animated = isAnimated;
    if (!isAnimated) {
      instance.mixer.stopAll();
      instance.scene.root.traverse((node) => node.channels.resetToRestingState());
    }
  }

  // resting preset: applied when the config's preset changes (a live `apply` on the handle stays until then)
  const preset = config.behavior?.preset ?? 'neutral';
  if (configPresets.get(instance) !== preset) {
    configPresets.set(instance, preset);
    instance.apply(preset);
  }
}

/** Blend two configs (numbers lerp, discrete fields switch at t = 0.5). */
export function interpolateConsonaConfig(from: ConsonaAvatarConfig, to: ConsonaAvatarConfig, t: number): ConsonaAvatarConfig {
  const clampedT = Math.max(0, Math.min(1, t));
  const lerp = (a: number, b: number) => mix(a, b, clampedT);
  return {
    seed: clampedT < 0.5 ? from.seed : to.seed,
    paletteId: clampedT < 0.5 ? from.paletteId : to.paletteId,
    mode: clampedT < 0.5 ? from.mode : to.mode,
    head: {
      shape: clampedT < 0.5 ? from.head.shape : to.head.shape,
      roundness: lerp(from.head.roundness ?? 0.85, to.head.roundness ?? 0.85),
      surfaceShadow: clampedT < 0.5 ? from.head.surfaceShadow : to.head.surfaceShadow,
    },
    eyes: {
      shape: clampedT < 0.5 ? from.eyes.shape : to.eyes.shape,
      openness: lerp(from.eyes.openness ?? 1, to.eyes.openness ?? 1),
      size: lerp(from.eyes.size ?? 0.5, to.eyes.size ?? 0.5),
      aspectRatio: lerp(from.eyes.aspectRatio ?? 1, to.eyes.aspectRatio ?? 1),
      spacing: lerp(from.eyes.spacing ?? 0.5, to.eyes.spacing ?? 0.5),
      xOffset: lerp(from.eyes.xOffset ?? 0, to.eyes.xOffset ?? 0),
      yOffset: lerp(from.eyes.yOffset ?? 0, to.eyes.yOffset ?? 0),
      tiltAngle: lerp(from.eyes.tiltAngle ?? 0, to.eyes.tiltAngle ?? 0),
      tiltMode: clampedT < 0.5 ? from.eyes.tiltMode : to.eyes.tiltMode,
      showPupil: clampedT < 0.5 ? from.eyes.showPupil : to.eyes.showPupil,
      pupilScale: lerp(from.eyes.pupilScale ?? 0.48, to.eyes.pupilScale ?? 0.48),
      pupilGazeTracking: lerp(
        from.eyes.pupilGazeTracking ?? 0.8,
        to.eyes.pupilGazeTracking ?? 0.8
      ),
      borderWidth: lerp(from.eyes.borderWidth ?? 0, to.eyes.borderWidth ?? 0),
      borderMode: clampedT < 0.5 ? from.eyes.borderMode : to.eyes.borderMode,
      bgMode: clampedT < 0.5 ? from.eyes.bgMode : to.eyes.bgMode,
      bgColor: clampedT < 0.5 ? from.eyes.bgColor : to.eyes.bgColor,
    },
    behavior: {
      ...from.behavior,
      ...(clampedT >= 0.5 ? to.behavior : {}),
    },
  };
}

