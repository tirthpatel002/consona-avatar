import type { AvatarJellyOptions } from '../../core/types/AvatarDefinition.ts';
import type { ResolvedEyesOptions } from '../../core/face/eyes.ts';
import { registerAvatarFamilyDefaults } from '../../core/define/familyDefaults.ts';
import { ALLIE_FAMILIES } from './allie.family.ts';
import { installDefaultMouthShapes, registerMouthDefaults } from '../../core/face/mouth.ts';
import type { ResolvedMouthOptions } from '../../core/face/mouth.ts';

/** Allie eyes: large, deep relief pills with a thick body-shade outline; pupils off. */
export const ALLIE_EYES: ResolvedEyesOptions = {
  shape: 'pill',
  spacing: 0.5,
  size: 0.42,
  height: 0,
  depth: 0.8,
  lid: 0,
  color: 'auto',
  outline: 'auto',
  outlineWidth: 0.2,
  pupil: false,
  pupilStyle: 'fill',
  tint: true,
};

/** Allie "water balloon" soft body. */
export const ALLIE_JELLY: Required<AvatarJellyOptions> = { stiffness: 110, damping: 0.16, amount: 1.08, idle: 0.38, poke: 1.05 };

/** Allie mouth: under the eyes (body units below the eye anchor centre), Allie-scaled, colour derived from the accent. */
export const ALLIE_MOUTH: ResolvedMouthOptions = { shape: 'smile', width: 0.3, curve: 1, open: 0.5, color: 'auto', height: -0.4 };

/** Register Allie's eye + jelly + mouth defaults for both Allie families (idempotent). */
export function registerAllieDefaults(): void {
  installDefaultMouthShapes();
  for (const f of ALLIE_FAMILIES) {
    registerAvatarFamilyDefaults(f, { eyes: ALLIE_EYES, jelly: ALLIE_JELLY });
    registerMouthDefaults(f, ALLIE_MOUTH);
  }
}
registerAllieDefaults();
