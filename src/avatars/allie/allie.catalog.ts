import { registerAvatarFamily, registerAvatarPreset } from '../../core/catalog/catalog.ts';
import { registerAllieAtoms } from './allie.atoms.ts';
import { registerAllieStudio } from './allie.studio.ts';
import { allieClassicCompositions, allieThreadiesCompositions } from './allie.presets.ts';

import { ALLIE_FAMILY, ALLIE_THREADIES_FAMILY } from './allie.family.ts';
export { ALLIE_FAMILY, ALLIE_THREADIES_FAMILY };

/** Shared loader of the Allie Three.js package (one load for both Allie families). */
const installAllieThree = () => import('./three/index.ts');

let done = false;
/** Publish the Allie atoms, families + presets to the avatar catalog (idempotent). */
export function registerAllieCatalog(): void {
  if (done) return;
  done = true;
  registerAllieAtoms();
  registerAllieStudio();
  registerAvatarFamily({ id: ALLIE_FAMILY, name: 'Allie', renderer: 'three', plugins: ['vibe'], install: installAllieThree, description: 'Fuzzy knitted avatars with soft embedded 3D eyes' });
  registerAvatarFamily({ id: ALLIE_THREADIES_FAMILY, name: 'Allie · Threadies', renderer: 'three', plugins: ['vibe'], install: installAllieThree, description: 'Yarn-crafted Allie characters (body + eyes + preset atoms)' });
  for (const composition of allieClassicCompositions) registerAvatarPreset({ family: ALLIE_FAMILY, composition, tags: ['fur', 'procedural', 'classic'] });
  for (const composition of allieThreadiesCompositions) registerAvatarPreset({ family: ALLIE_THREADIES_FAMILY, composition, tags: ['fur', 'procedural', 'threadies'] });
}
