import { ALLIE_FAMILIES } from './allie.family.ts';
import { configureFurShells } from '../../core/plugins/fur.schema.ts';
import type { AvatarFurOptions } from '../../core/plugins/fur.schema.ts';

/** Allie's fur look: chunky knit shells, boosted length + coverage. */
export const ALLIE_FUR: Required<AvatarFurOptions> = {
  length: 0.09,
  shells: 26,
  knit: true,
  bumpScale: 1.2,
  strandRepeat: [36, 22],
  rootShade: 0.55,
  pattern: 'knit',
  patternRepeat: [28, 16],
  patternShade: 0,
  density: 1,
  droop: 2,
  regions: [],
};
export const ALLIE_FUR_LENGTH_BOOST = 1.18;
export const ALLIE_FUR_DENSITY_BOOST = 1.5;

/** Install Allie's fur style into the generic fur-shells part (idempotent). */
export function installAllieFur(): void {
  for (const f of ALLIE_FAMILIES) configureFurShells(f, { defaults: ALLIE_FUR, lengthBoost: ALLIE_FUR_LENGTH_BOOST, densityBoost: ALLIE_FUR_DENSITY_BOOST });
}
installAllieFur();
