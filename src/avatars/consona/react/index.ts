/**
 * Consona React surface: the `<Avatar>` renderer (registered eagerly here),
 * the legacy `<ConsonaAvatar>` / `useConsonaAvatar` and the engine provider.
 */
import { registerAvatarReactRenderer } from '../../../react/renderers/registry.ts';
import type { PartialConsonaAvatarConfig } from '../consona.config.ts';
import { CONSONA_FAMILY } from '../atoms/eyes.consona.atom.ts';
import ConsonaRenderer from './ConsonaRenderer.ts';

declare module '../../../react/Avatar.ts' {
  interface AvatarFamilyConfigs {
    consona: PartialConsonaAvatarConfig;
  }
}

registerAvatarReactRenderer(CONSONA_FAMILY, { component: ConsonaRenderer, config: true });

export { ConsonaRenderer };
export * from './ConsonaAvatar.ts';
export * from './useConsonaAvatar.ts';
export * from './ConsonaAvatarProvider.ts';
