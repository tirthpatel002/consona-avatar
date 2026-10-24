import { registerAllieShapes } from './allie.shapes.ts';
import { registerAllieBehaviors } from './allie.behaviors.ts';

/**
 * Register Allie shapes and behaviors in the engine's global registries, so
 * custom definitions can reference them by name (`shape: 'blob'`,
 * `do('wave')`). Presets are engine-level eye poses. The presets don't need it.
 */
export function registerAllieKit(): void {
  registerAllieShapes();
  registerAllieBehaviors();
}
