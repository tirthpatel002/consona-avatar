import { defineVariant } from '../../../core/define/defineVariant.ts';
import type { ConsonaHeadShape } from '../atoms/head.consona.atom.ts';

/** All 14 head shapes the atom can draw — Studio must expose this full set. */
export const HEAD_SHAPE_VARIANTS = [
  defineVariant<ConsonaHeadShape>('head.shape', 'circle', { label: 'Circle' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'square', { label: 'Square' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'squircle', { label: 'Squircle' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'egg', { label: 'Egg' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'diamond', { label: 'Diamond' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'capsule', { label: 'Capsule' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'pear', { label: 'Pear' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'hexagon', { label: 'Hexagon' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'pillHorizontal', { label: 'Wide Pill' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'pillVertical', { label: 'Tall Pill' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'arch', { label: 'Arch' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'triangle', { label: 'Triangle' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'heart', { label: 'Heart' }),
  defineVariant<ConsonaHeadShape>('head.shape', 'star', { label: 'Star' }),
] as const;

export const HEAD_SHAPE_IDS: ConsonaHeadShape[] = HEAD_SHAPE_VARIANTS.map((v) => v.id);
