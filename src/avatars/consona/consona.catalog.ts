import { registerAvatarFamily } from '../../core/catalog/catalog.ts';
import { CONSONA_FAMILY } from './atoms/eyes.consona.atom.ts';

import { registerConsonaStudio } from './consona.studio.ts';

let registered = false;

/** Publish Consona in the shared avatar catalog (scene-graph family, SVG renderer) + its studio manifest. Idempotent. */
export function registerConsonaCatalog(): void {
  if (registered) return;
  registered = true;
  registerAvatarFamily({ id: CONSONA_FAMILY, name: 'Consona', description: 'Parametric SVG avatar (scene graph)', renderer: 'svg' });
  registerConsonaStudio();
}
