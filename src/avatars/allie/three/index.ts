/**
 * Three.js entry of the Allie avatars — the "install" entry. Importing it:
 *  - registers the Allie accessory builders (tuft, nub hand) with the adapter,
 *  - registers Allie shapes / behaviors in the engine registries,
 *  - publishes the Allie family + presets to the avatar catalog.
 * Tools (e.g. the studio) auto-discover `src/avatars/<name>/three/index.ts`.
 */
import { registerAllieAccessories } from './allie.accessories.ts';
import { registerAllieSurfaces } from './allie.surfaces.ts';
import { registerAllieRig } from './allie.rig.ts';
import { registerAllieKit } from '../allie.kit.ts';
import { registerAllieCatalog } from '../allie.catalog.ts';

registerAllieAccessories();
registerAllieSurfaces();
registerAllieRig();
registerAllieKit();
registerAllieCatalog();

export * from './allie.accessories.ts';
export * from './allie.surfaces.ts';
export * from './allie.rig.ts';
export * from '../index.ts';
