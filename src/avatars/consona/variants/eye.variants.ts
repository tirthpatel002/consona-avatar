import { defineVariant } from '../../../core/define/defineVariant.ts';
import type { ConsonaEyeShape, EyeTiltMode } from '../atoms/eyes.consona.atom.ts';

/** All eye shapes the atom can draw — Studio must expose this full set. */
export const EYE_SHAPE_VARIANTS = [
  defineVariant<ConsonaEyeShape>('eyes.shape', 'capsule', { label: 'Capsule' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'dot', { label: 'Solid Dot' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'archUp', { label: 'Smiling Arch' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'archDown', { label: 'Focused Arch' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'line', { label: 'Zen Line' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'cross', { label: 'Robo Cross' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'diamond', { label: 'Diamond' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'star', { label: 'Sparkle' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'ring', { label: 'Hollow Ring' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'squircle', { label: 'Soft Chip' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'halfPill', { label: 'Half Capsule' }),
  defineVariant<ConsonaEyeShape>('eyes.shape', 'heart', { label: 'Vector Heart' }),
] as const;

export const EYE_SHAPE_IDS: ConsonaEyeShape[] = EYE_SHAPE_VARIANTS.map((v) => v.id);

export const EYE_TILT_VARIANTS = [
  defineVariant<EyeTiltMode>('eyes.tiltMode', 'spatial3D', {
    label: 'Spatial 3D',
    description: 'Spherical 3D gaze geometry',
  }),
  defineVariant<EyeTiltMode>('eyes.tiltMode', 'mirrored', {
    label: 'Mirrored',
    description: 'Symmetric optical flare',
  }),
  defineVariant<EyeTiltMode>('eyes.tiltMode', 'parallel', {
    label: 'Parallel',
    description: 'Synchronized alignment',
  }),
  defineVariant<EyeTiltMode>('eyes.tiltMode', 'independent', {
    label: 'Independent',
    description: 'Asymmetric tilt offset',
  }),
] as const;

export const EYE_TILT_IDS: EyeTiltMode[] = EYE_TILT_VARIANTS.map((v) => v.id);
