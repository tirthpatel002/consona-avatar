/**
 * Install entry of the Consona family, same shape as Allie: publishes
 * the family + studio manifest and registers its `<Avatar>` renderer as a lazy
 * chunk (React is only loaded when a Consona avatar renders). Idempotent.
 * The package root imports this, so Consona is available by default.
 */
import { registerConsonaCatalog } from './consona.catalog.ts';
import { registerAvatarReactRenderer } from '../../react/renderers/registry.ts';
import { CONSONA_FAMILY } from './atoms/eyes.consona.atom.ts';

registerConsonaCatalog();
registerAvatarReactRenderer(CONSONA_FAMILY, { load: () => import('./react/ConsonaRenderer.ts'), config: true });
