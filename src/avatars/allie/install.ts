/**
 * Data-only install entry of the Allie families: publishes families, presets,
 * atoms, shapes, behaviors and the studio manifest (no `three`). The Three.js
 * package (`./three/index.ts`) loads lazily when the first Allie avatar renders.
 */
import { registerAllieCatalog } from './allie.catalog.ts';
import { registerAllieKit } from './allie.kit.ts';

registerAllieKit();
registerAllieCatalog();
