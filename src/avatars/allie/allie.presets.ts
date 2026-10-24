import { defineAvatar } from '../../core/define/defineAvatar.ts';
import { composeAvatar } from '../../core/catalog/catalog.ts';
import type { AvatarComposition } from '../../core/catalog/catalog.ts';
import type { AvatarDefinition } from '../../core/types/AvatarDefinition.ts';
import type { ResolvedAvatarDefinition } from '../../core/define/resolveAvatar.ts';
import { allieBehaviors, allieThreadiesBehaviors } from './allie.behaviors.ts';
import { registerAllieAtoms } from './allie.atoms.ts';
import { ALLIE_FAMILY } from './allie.family.ts';

/** Wrap `defineAvatar` with the Allie behaviors. */
export function defineAllieAvatar(def: AvatarDefinition): ResolvedAvatarDefinition {
  return defineAvatar({
    family: ALLIE_FAMILY,
    ...def,
    behaviors: [...allieBehaviors, ...allieThreadiesBehaviors, ...(def.behaviors ?? [])],
  });
}

/**
 * Preset compositions: { body, eyes, preset, mouth }. Eye shapes + presets
 * approximate each character's former glyph eyes (^ ^ → pill + joyful,
 * ♥ → heart + love, ✧ → star + excited, • → sphere + curious, …).
 */
export const allieClassicCompositions: AvatarComposition[] = [
  { id: 'blue', name: 'Blue Teardrop', atoms: { body: 'teardrop', eyes: 'pill', preset: 'look', mouth: 'smile' } },
  { id: 'pink', name: 'Pink Flower', atoms: { body: 'flower', eyes: 'pill', preset: 'wink', mouth: 'smile' } },
  { id: 'yellow', name: 'Yellow Blob', atoms: { body: 'blob', eyes: 'pill', preset: 'happy', mouth: 'smile' } },
  { id: 'green', name: 'Green Dome', atoms: { body: 'dome', eyes: 'star', preset: 'sparkle', mouth: 'smile' } },
];

export const allieThreadiesCompositions: AvatarComposition[] = [
  { id: 'pippo', name: 'Pippo', atoms: { body: 'capsule-sprout', eyes: 'pill', preset: 'joyful', mouth: 'smile' } },
  { id: 'tuff', name: 'Tuff', atoms: { body: 'boucle-cube', eyes: 'star', preset: 'excited', mouth: 'smile' } },
  { id: 'rolly', name: 'Rolly', atoms: { body: 'ring-donut', eyes: 'pill', preset: 'content', mouth: 'none' } },
  { id: 'spirou', name: 'Spirou', atoms: { body: 'snowman', eyes: 'sphere', preset: 'curious', mouth: 'smile' } },
  { id: 'moko', name: 'Moko', atoms: { body: 'beanie', eyes: 'pill', preset: 'determined', mouth: 'smile' } },
  { id: 'fifi', name: 'Fifi', atoms: { body: 'scallop-flower', eyes: 'heart', preset: 'love', mouth: 'smile' } },
  { id: 'chobi', name: 'Chobi', atoms: { body: 'nub-dome', eyes: 'pill', preset: 'happy', mouth: 'smile' } },
  { id: 'poko', name: 'Poko', atoms: { body: 'horned-fluff', eyes: 'pill', preset: 'calm', mouth: 'smile' } },
  { id: 'lilo', name: 'Lilo', atoms: { body: 'loop-box', eyes: 'sphere', preset: 'playful', mouth: 'smile' } },
  { id: 'barnaby', name: 'Barnaby', atoms: { body: 'cable-arch', eyes: 'sphere', preset: 'surprised', mouth: 'none' } },
  { id: 'hearty', name: 'Hearty', atoms: { body: 'heart', eyes: 'sphere', preset: 'happy', mouth: 'smile' } },
];

registerAllieAtoms();
const byId = (list: AvatarComposition[]) => list.map((c) => composeAvatar(c));

export const [blueTeardropAvatar, pinkFlowerAvatar, yellowBlobAvatar, greenDomeAvatar] = byId(allieClassicCompositions) as [
  ResolvedAvatarDefinition,
  ResolvedAvatarDefinition,
  ResolvedAvatarDefinition,
  ResolvedAvatarDefinition,
];

/** The four classic Allie presets. */
export const alliePresets: readonly ResolvedAvatarDefinition[] = [blueTeardropAvatar, pinkFlowerAvatar, yellowBlobAvatar, greenDomeAvatar];

/** The eleven "Threadies" presets (incl. Hearty). */
export const allieThreadiesPresets: readonly ResolvedAvatarDefinition[] = byId(allieThreadiesCompositions);
