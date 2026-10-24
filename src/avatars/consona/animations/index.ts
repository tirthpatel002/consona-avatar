export * from './all.ts';
export { CONSONA_ANIMATION_UI } from './animationUi.ts';

import * as allAnimations from './all.ts';
import { collectDefinedAnimations } from '../../../core/define/collectDefinedAnimations.ts';
import type { DefinedAnimation } from '../../../core/define/defineAnimation.ts';
import { CONSONA_ANIMATION_UI } from './animationUi.ts';

/** Single owned collection — avatar + editor derive from this. */
export const CONSONA_ANIMATIONS: DefinedAnimation[] = collectDefinedAnimations(
  allAnimations as Record<string, unknown>
).map((anim) => {
  const ui = CONSONA_ANIMATION_UI[anim.name];
  if (!ui) return anim;
  return { ...anim, meta: { ...ui, ...anim.meta } };
});
