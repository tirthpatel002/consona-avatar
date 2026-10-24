import { installAvatarFamily, listAvatarFamilies } from '@consona/avatar-enhanced/core/index.ts';

/**
 * Auto-install every avatar package: any `src/avatars/<name>/install.ts`
 * registers its family, presets, atoms, behaviors and studio manifest on import
 * (data only, no `three`). A family's renderer package (e.g. Three.js) loads
 * lazily on first render. Adding a new avatar folder needs no studio changes.
 */
const modules = import.meta.glob('../../../src/avatars/*/install.ts', { eager: true });

export const installedAvatarPackages = Object.keys(modules).map((p) => p.split('/avatars/')[1]?.split('/')[0] ?? p);

// Warm renderer packages in idle time so opening a 3D studio is instant (still a separate, lazily-fetched chunk).
const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
idle(() => {
  for (const f of listAvatarFamilies()) void installAvatarFamily(f.id);
});
