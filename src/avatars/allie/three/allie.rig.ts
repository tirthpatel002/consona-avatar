import { DEFAULT_COMPOSITION, registerRigProfile } from '../../../adapters/three/rig/assembleRig.ts';
import { ALLIE_FAMILIES } from '../allie.family.ts';

/** Allie's rig profile: the full default part stack, body centre 0.75, no extra pivots. */
export const ALLIE_BODY_CENTER_Y = 0.75;

export function registerAllieRig(): void {
  for (const f of ALLIE_FAMILIES) registerRigProfile(f, { atoms: DEFAULT_COMPOSITION, bodyCenterY: ALLIE_BODY_CENTER_Y, pivots: [] });
}
