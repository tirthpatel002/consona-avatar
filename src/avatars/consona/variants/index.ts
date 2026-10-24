import { HEAD_SHAPE_VARIANTS } from './head.variants.ts';
import { EYE_SHAPE_VARIANTS, EYE_TILT_VARIANTS } from './eye.variants.ts';

export * from './head.variants.ts';
export * from './eye.variants.ts';

/** All Consona Studio-facing variants (head shapes, eye shapes, tilt modes). */
export const CONSONA_VARIANTS = [
  ...HEAD_SHAPE_VARIANTS,
  ...EYE_SHAPE_VARIANTS,
  ...EYE_TILT_VARIANTS,
] as const;
