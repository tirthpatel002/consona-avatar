import { useSyncExternalStore } from 'react';
import { getAvatarCatalog, subscribeAvatarCatalog } from '../core/catalog/catalog.ts';
import type { AvatarCatalogSnapshot } from '../core/catalog/catalog.ts';

/** Live avatar catalog (families + presets); re-renders when avatar packages register more. */
export function useAvatarCatalog(): AvatarCatalogSnapshot {
  return useSyncExternalStore(subscribeAvatarCatalog, getAvatarCatalog, getAvatarCatalog);
}
