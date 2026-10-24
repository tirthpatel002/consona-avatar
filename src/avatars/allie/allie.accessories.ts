import type { ColorLike } from '../../core/types/AvatarDefinition.ts';

/** Accessory descriptors (pure data). Builders live in `./three` (needs `three`). */
export const ALLIE_TUFT = 'allie:tuft';
export const ALLIE_HAND = 'allie:hand';

export const DEFAULT_TUFT_POINTS: [number, number, number][] = [
  [0, 1.6, 0.05],
  [0.02, 1.95, 0.1],
  [0.28, 2.15, 0.05],
  [0.42, 2.0, 0],
  [0.34, 1.9, 0],
];

export type AllieTuftOptions = {
  /** Curve control points relative to the body (default: yellow curl). */
  points?: [number, number, number][];
  radius?: number;
  furLength?: number;
  color?: ColorLike;
};

export type AllieHandOptions = {
  side?: 'left' | 'right';
  /** Vertical stretch of the nub (default 1.2). */
  length?: number;
  position?: [number, number, number];
  size?: number;
  rest?: number;
  furLength?: number;
  color?: ColorLike;
};

export type AllieTuftAccessory = AllieTuftOptions & { type: typeof ALLIE_TUFT };
export type AllieHandAccessory = AllieHandOptions & { type: typeof ALLIE_HAND };

export const allieTuft = (o: AllieTuftOptions = {}): AllieTuftAccessory => ({ ...o, type: ALLIE_TUFT });
export const allieHand = (o: AllieHandOptions = {}): AllieHandAccessory => ({ ...o, type: ALLIE_HAND });

// ---------- Threadies accessories (seated on the body surface by the builders) ----------

export const ALLIE_SPROUT = 'allie:sprout';
export const ALLIE_POMPOM = 'allie:pompom';
export const ALLIE_FLUFF = 'allie:fluff';
export const ALLIE_ANTENNA = 'allie:antenna';
export const ALLIE_LOOP = 'allie:loop';
export const ALLIE_HORNS = 'allie:horns';
export const ALLIE_NUBS = 'allie:nubs';

/** Twin-leaf sprout on a short stem. */
export type AllieSproutOptions = { color?: ColorLike; stemColor?: ColorLike; size?: number; lean?: number; x?: number };
/** Knitted pom-pom. */
export type AllieFluffBallOptions = { color?: ColorLike; radius?: number; furLength?: number; squash?: number; x?: number };
/** Antenna: thin stalk with an optional bobble (Spirou) or a curly strand (Rolly). */
export type AllieAntennaOptions = { color?: ColorLike; height?: number; bobble?: number; curl?: number; thickness?: number; x?: number };
/** Yarn ring / top-knot loop. */
export type AllieLoopOptions = { color?: ColorLike; radius?: number; tube?: number; tilt?: number; x?: number };
/** Pair of soft curved horns. */
export type AllieHornsOptions = { color?: ColorLike; spread?: number; length?: number; radius?: number; furLength?: number };
/** Pair of nub hands on the sides (y in body units above the base). */
export type AllieNubsOptions = { color?: ColorLike; y?: number; size?: number; furLength?: number; /** Elongation (default 1.15). */ length?: number };

export type AllieSproutAccessory = AllieSproutOptions & { type: typeof ALLIE_SPROUT };
export type AlliePompomAccessory = AllieFluffBallOptions & { type: typeof ALLIE_POMPOM };
export type AllieFluffAccessory = AllieFluffBallOptions & { type: typeof ALLIE_FLUFF };
export type AllieAntennaAccessory = AllieAntennaOptions & { type: typeof ALLIE_ANTENNA };
export type AllieLoopAccessory = AllieLoopOptions & { type: typeof ALLIE_LOOP };
export type AllieHornsAccessory = AllieHornsOptions & { type: typeof ALLIE_HORNS };
export type AllieNubsAccessory = AllieNubsOptions & { type: typeof ALLIE_NUBS };

export const allieSprout = (o: AllieSproutOptions = {}): AllieSproutAccessory => ({ ...o, type: ALLIE_SPROUT });
export const alliePompom = (o: AllieFluffBallOptions = {}): AlliePompomAccessory => ({ ...o, type: ALLIE_POMPOM });
export const allieFluff = (o: AllieFluffBallOptions = {}): AllieFluffAccessory => ({ ...o, type: ALLIE_FLUFF });
export const allieAntenna = (o: AllieAntennaOptions = {}): AllieAntennaAccessory => ({ ...o, type: ALLIE_ANTENNA });
export const allieLoop = (o: AllieLoopOptions = {}): AllieLoopAccessory => ({ ...o, type: ALLIE_LOOP });
export const allieHorns = (o: AllieHornsOptions = {}): AllieHornsAccessory => ({ ...o, type: ALLIE_HORNS });
export const allieNubs = (o: AllieNubsOptions = {}): AllieNubsAccessory => ({ ...o, type: ALLIE_NUBS });
