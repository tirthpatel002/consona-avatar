/**
 * React entry: `<Avatar>` renders every family (SVG or lazily-loaded Three)
 * through the family-registered React renderer, behind one `AvatarHandle`; `useAvatarHandle()` adds React state to it.
 */
export * from './Avatar.ts';
export * from './useAvatarHandle.ts';
export * from './AvatarMessageBubble.ts';
export * from './renderers/registry.ts';
export * from './useAvatarCatalog.ts';
export * from './AvatarInspector.ts';
// Descriptor-level escape hatch (custom scene-graph descriptors outside any family).
export * from './AvatarView.ts';
export * from './useAvatarInstance.ts';
