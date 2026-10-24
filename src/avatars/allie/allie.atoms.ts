import { installFacePresets } from '../../core/face/facePresets.ts';
import type { AvatarAccessory, AvatarBodyOptions, AvatarDefinition } from '../../core/types/AvatarDefinition.ts';
import type { AvatarFurOptions } from '../../core/plugins/fur.schema.ts';
// Allie authors `fur` (Three adapter fur feature; three-free module) and uses the default eye shapes + preset vocabulary.
import '../../core/plugins/fur.schema.ts';
import './allie.fur.ts';
import './allie.defaults.ts';
import { ALLIE_FAMILIES, ALLIE_FAMILY, ALLIE_THREADIES_FAMILY } from './allie.family.ts';
import { installDefaultEyePoses, installDefaultEyeShapes } from '../../core/face/eyes.ts';
import { reliefEyesIcon } from '../../core/face/eyeIcon.ts';
installDefaultEyeShapes();
installDefaultEyePoses();
installFacePresets(ALLIE_FAMILIES);
import type { AvatarAtomVariant, AvatarDraft } from '../../core/catalog/catalog.ts';
import { registerAvatarAtom, registerAvatarAtomVariant } from '../../core/catalog/catalog.ts';
import type { AvatarEyeAnchor, AvatarEyesOptions } from '../../core/face/eyes.ts';
import { listEyePoses } from '../../core/face/eyes.ts';
import { registerMouthAtom } from '../../core/face/mouth.ts';
import { allieShapes, allieThreadiesShapes } from './allie.shapes.ts';
import { allieBehaviors, allieThreadiesBehaviors } from './allie.behaviors.ts';
import {
  allieFluff,
  allieHand,
  allieHorns,
  allieLoop,
  allieNubs,
  alliePompom,
  allieSprout,
} from './allie.accessories.ts';

/**
 * Allie atoms. A avatar is `{ body, eyes, preset }`:
 *  - `body`: the character — silhouette, colour, yarn/fur surface,
 *    accessories, behaviors, and where the eyes sit on it (`anchor`);
 *  - `eyes`: the eye shape of the one 3D eye system (pill, sphere, star,
 *    heart, cube), embedded in the body surface with a body-shade outline;
 *  - `preset`: the resting eye shape pose (every preset works on every shape).
 * Eye / outline colours derive from the body colour (see `avatar/tint.ts`).
 * Any combination composes (`composeAvatar({ atoms: { body, eyes, preset } })`);
 * a missing `preset` falls back to the body's own designed preset.
 */

export const ALLIE_ATOMS = { body: 'body', eyes: 'eyes', preset: 'preset' } as const;

/** Where (and how big) the eyes sit on a body, in body units. */
export type AllieAnchor = AvatarEyeAnchor;

interface AllieMeta {
  /** Preset the body was designed with (used when no preset atom is selected). */
  preset?: string;
  [k: string]: unknown;
}

const meta = (d: AvatarDraft) => d.meta as AllieMeta;

/** Shared kit so every composed definition is self-contained. */
const kit = {
  behaviors: [...allieBehaviors, ...allieThreadiesBehaviors],
} satisfies Partial<AvatarDefinition>;

// ---------------------------------------------------------------- body

export interface AllieCharacterSpec {
  id: string;
  name: string;
  group: 'Classics' | 'Threadies';
  description?: string;
  body: AvatarBodyOptions;
  fur?: AvatarFurOptions;
  accessories?: AvatarAccessory[];
  anchor: AllieAnchor;
  preset: string;
  position?: [number, number, number];
  tags?: string[];
}

export const allieCharacterSpecs: AllieCharacterSpec[] = [
  // ----- classics (exact original parameters) -----
  {
    id: 'teardrop',
    name: 'Teardrop',
    group: 'Classics',
    body: { shape: allieShapes.teardrop, color: 0x2f7bff, scale: 1.05 },
    anchor: { y: -0.15, width: 1.45, height: 0.58 },
    preset: 'look',
    position: [-3.9, -1.7, -0.6],
  },
  {
    id: 'flower',
    name: 'Flower',
    group: 'Classics',
    body: { shape: 'allie:flower', color: 0xff2f8f, scale: 1.05 },
    anchor: { y: -0.05, width: 1.5, height: 0.6 },
    preset: 'wink',
    position: [-2.0, -1.7, -0.4],
  },
  {
    id: 'blob',
    name: 'Blob',
    group: 'Classics',
    body: { shape: allieShapes.blob, color: 0xffa51a, scale: 1.45 },
    fur: { length: 0.13 },
    anchor: { y: 0.05, width: 1.3, height: 0.56 },
    preset: 'happy',
    accessories: [
      allieHand({ side: 'left', length: 1.2, position: [-0.98, 0.5, 0.3], rest: 1.85 }),
      allieHand({ side: 'right', length: 1.2, position: [-0.98, 0.5, 0.3], rest: 1.85 }),
    ],
    position: [0.1, -1.7, 0.6],
  },
  {
    id: 'dome',
    name: 'Dome',
    group: 'Classics',
    body: { shape: allieShapes.dome, color: 0x8fdc1e, scale: 1.0 },
    anchor: { y: -0.05, width: 1.45, height: 0.58 },
    preset: 'sparkle',
    position: [2.2, -1.7, -0.4],
  },
  // ----- Threadies (reference lineup + "The Threadies" spec) -----
  {
    id: 'capsule-sprout',
    name: 'Ribbed Capsule',
    group: 'Threadies',
    description: 'Pippo — tall capsule, chunky vertical-rib knit',
    body: { shape: allieThreadiesShapes.capsule, color: '#F7B52A', scale: 0.95 },
    fur: { length: 0.035, pattern: 'rib', patternRepeat: [3, 5], bumpScale: 3, patternShade: 0.45, density: 0.9, droop: 1 },
    anchor: { y: 0.47, width: 0.68, height: 0.52 },
    preset: 'joyful',
  },
  {
    id: 'boucle-cube',
    name: 'Bouclé Cube',
    group: 'Threadies',
    description: 'Tuff — rounded cube, dense bouclé loops, chaotic yarn tuft',
    body: { shape: allieThreadiesShapes.cube, color: '#F9806F' },
    fur: { length: 0.06, pattern: 'boucle', patternRepeat: [4, 3], bumpScale: 2.6, patternShade: 0.4, density: 0.95, droop: 1 },
    accessories: [allieFluff({ color: '#FFAE85', radius: 0.42, furLength: 0.3, squash: 0.6 })],
    anchor: { y: -0.22, width: 1.04, height: 0.52 },
    preset: 'excited',
  },
  {
    id: 'ring-donut',
    name: 'Fleece Ring',
    group: 'Threadies',
    description: 'Rolly — upright torus, curly fleece',
    body: { shape: 'allie:torus', params: { radius: 0.6, tube: 0.42, holeY: -0.06 }, color: '#5B2F9E' },
    fur: { length: 0.07, pattern: 'boucle', patternRepeat: [10, 3], bumpScale: 2.4, patternShade: 0.35, density: 0.95, droop: 1 },
    anchor: { y: 0.42, width: 1.0, height: 0.4 },
    preset: 'content',
  },
  {
    id: 'snowman',
    name: 'Shaggy Snowman',
    group: 'Threadies',
    description: 'Spirou — stacked spheres, shaggy long yarn',
    body: { shape: allieThreadiesShapes.snowman, color: '#1FA6BC', scale: 1.0 },
    fur: { length: 0.15, density: 0.8, droop: 5, bumpScale: 0.8, rootShade: 0.5 },
    anchor: { y: 0.42, width: 0.68, height: 0.36 },
    preset: 'curious',
  },
  {
    id: 'beanie',
    name: 'Chenille Beanie',
    group: 'Threadies',
    description: 'Moko — rounded cone with folded rib cuff, chunky chenille, pom-pom',
    body: { shape: allieThreadiesShapes.beanie, color: '#F5672B' },
    fur: { length: 0.035, pattern: 'rib', patternRepeat: [7, 4], bumpScale: 3.2, patternShade: 0.5, density: 0.92, droop: 1 },
    accessories: [alliePompom({ color: '#FF6E1F', radius: 0.21, furLength: 0.09 })],
    anchor: { y: -0.22, width: 1.0, height: 0.46 },
    preset: 'determined',
  },
  {
    id: 'scallop-flower',
    name: 'Popcorn Flower',
    group: 'Threadies',
    description: 'Fifi — 8-lobed scalloped flower, popcorn knit, dual-leaf sprout',
    body: { shape: allieThreadiesShapes.scallop, color: '#EE86BB' },
    fur: { length: 0.03, pattern: 'popcorn', patternRepeat: [8, 4], bumpScale: 2.6, patternShade: 0.35, density: 0.9, droop: 1 },
    accessories: [allieSprout({ color: '#EC8FBF', stemColor: '#E07AAE', size: 0.22 })],
    anchor: { y: 0.02, width: 0.9, height: 0.9 },
    preset: 'love',
  },
  {
    id: 'nub-dome',
    name: 'Velvet Dome',
    group: 'Threadies',
    description: 'Chobi — flat-bottom dome, velvet chenille loops, nub hands',
    body: { shape: allieThreadiesShapes.nubdome, color: '#36A862' },
    fur: { length: 0.07, pattern: 'boucle', patternRepeat: [7, 3], bumpScale: 2.6, patternShade: 0.42, density: 0.95, droop: 1 },
    accessories: [allieNubs({ y: 0.32, size: 0.17, length: 1.2 })],
    anchor: { y: -0.3, width: 1.08, height: 0.46 },
    preset: 'happy',
  },
  {
    id: 'horned-fluff',
    name: 'Felt Fluff',
    group: 'Threadies',
    description: 'Poko — soft fluffy dome, two little horns',
    body: { shape: allieThreadiesShapes.puffdome, color: '#5A8EDB' },
    fur: { length: 0.12, density: 0.82, droop: 4, bumpScale: 0.8 },
    accessories: [allieHorns({ color: '#4E82D6', spread: 0.44, length: 0.46, radius: 0.11 })],
    anchor: { y: 0.12, width: 1.15, height: 0.5 },
    preset: 'calm',
  },
  {
    id: 'loop-box',
    name: 'Fluffy Barrel',
    group: 'Threadies',
    description: 'Lilo — soft rounded box, fluffy yarn, pink top-knot loop',
    body: { shape: allieThreadiesShapes.barrel, color: '#B67CDB' },
    fur: { length: 0.12, density: 0.82, droop: 3, bumpScale: 0.8 },
    accessories: [allieLoop({ color: '#EE8FC6', radius: 0.13, tube: 0.04 })],
    anchor: { y: -0.3, width: 1.1, height: 0.46 },
    preset: 'playful',
  },
  {
    id: 'cable-arch',
    name: 'Cable Arch',
    group: 'Threadies',
    description: 'Barnaby — inverted-U arch, plain soft knit',
    body: { shape: 'allie:arch', params: { radius: 0.53, tube: 0.4, leg: 0.8 }, color: '#E9B451' },
    fur: { length: 0.04, bumpScale: 1.2, density: 0.95, droop: 1 },
    anchor: { y: 0.44, width: 1.0, height: 0.44 },
    preset: 'surprised',
  },
  {
    id: 'heart',
    name: 'Plush Heart',
    group: 'Threadies',
    description: 'Hearty — plush heart, two round lobes, soft point, velvety plush',
    body: { shape: allieThreadiesShapes.heart, color: '#E8475F' },
    fur: { length: 0.06, pattern: 'boucle', patternRepeat: [8, 3], bumpScale: 1.6, patternShade: 0.25, density: 0.94, droop: 1.5 },
    anchor: { y: 0.2, width: 1.12, height: 0.46 },
    preset: 'happy',
  },
];


function characterVariant(c: AllieCharacterSpec): AvatarAtomVariant {
  return {
    atom: ALLIE_ATOMS.body,
    id: c.id,
    name: c.name,
    group: c.group,
    swatch: c.body.color,
    description: c.description,
    tags: c.tags,
    apply(d) {
      Object.assign(d.def, {
        family: c.group === 'Threadies' ? ALLIE_THREADIES_FAMILY : ALLIE_FAMILY,
        id: c.id,
        name: c.name,
        body: { ...c.body, colorRef: c.body.color },
        behaviors: kit.behaviors,
        position: c.position ?? [0, -1.7, 0],
        preset: c.preset,
        anchor: { ...c.anchor },
      });
      if (c.fur) d.def.fur = { ...c.fur };
      if (c.accessories) d.def.accessories = c.accessories.map((a) => ({ ...a }));
      meta(d).preset = c.preset;
    },
  };
}

// ---------------------------------------------------------------- eyes

export interface AllieEyesSpec {
  id: string;
  name: string;
  glyph: string;
  description: string;
  eyes: AvatarEyesOptions;
}

export const allieEyesSpecs: AllieEyesSpec[] = [
  { id: 'pill', name: 'Pill', glyph: '▮', description: 'Tall rounded pills (classic Allie eyes)', eyes: { shape: 'pill', size: 0.46, spacing: 0.46 } },
  { id: 'sphere', name: 'Sphere', glyph: '●', description: 'Round domes / beads', eyes: { shape: 'sphere', size: 0.4, spacing: 0.5 } },
  { id: 'star', name: 'Star', glyph: '★', description: 'Soft five-point stars', eyes: { shape: 'star', size: 0.42, spacing: 0.52 } },
  { id: 'heart', name: 'Heart', glyph: '♥', description: 'Plump hearts', eyes: { shape: 'heart', size: 0.4, spacing: 0.52 } },
  { id: 'cube', name: 'Cube', glyph: '■', description: 'Pillowy rounded squares', eyes: { shape: 'cube', size: 0.38, spacing: 0.52 } },
];

function eyesVariant(e: AllieEyesSpec): AvatarAtomVariant {
  return {
    atom: ALLIE_ATOMS.eyes,
    id: e.id,
    name: e.name,
    description: `${e.glyph}  ${e.description}`,
    tags: [e.glyph],
    // traced from the same SDF the 3D eyes render
    icon: () => reliefEyesIcon(e.eyes.shape ?? 'pill', { spacing: e.eyes.spacing, size: e.eyes.size }),
    apply(d) {
      d.def.eyes = { ...e.eyes };
    },
  };
}

// ---------------------------------------------------------------- preset

function presetVariant(preset: string): AvatarAtomVariant {
  return {
    atom: ALLIE_ATOMS.preset,
    id: preset,
    name: preset,
    apply(d) {
      d.def.preset = preset;
    },
  };
}

export const allieCharacterVariants = allieCharacterSpecs.map(characterVariant);
export const allieEyesVariants = allieEyesSpecs.map(eyesVariant);

let registered = false;
/** Register the three Allie atoms (scoped to both Allie families) and all their variants in the catalog (idempotent). */
export function registerAllieAtoms(): void {
  if (registered) return;
  registered = true;
  for (const family of ALLIE_FAMILIES) {
    registerAvatarAtom({ id: ALLIE_ATOMS.body, family, name: 'Body', order: 0, description: 'Character shape, yarn, colour and accessories' });
    registerAvatarAtom({ id: ALLIE_ATOMS.eyes, family, name: 'Eyes', order: 1, description: 'Soft 3D eyes embedded in the body, with a body-shade outline' });
    registerAvatarAtom({ id: ALLIE_ATOMS.preset, family, name: 'Preset', order: 2, description: 'Resting eye shape (works on every eye shape)' });
  }
  for (const v of [...allieCharacterVariants, ...allieEyesVariants, ...listEyePoses().map(presetVariant)]) registerAvatarAtomVariant(v);
  // the shared, generic Mouth atom (core)
  registerMouthAtom();
}
