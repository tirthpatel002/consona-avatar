/**
 * @consona/avatar-enhanced — curated root entry.
 *
 * The everyday surface: `<Avatar>` + `AvatarHandle`, defining avatars / presets /
 * behaviors / timelines, the catalog, and the Consona family (installed by
 * default). Everything else lives on sub-paths:
 *   ./core  ./preset  ./math  ./color  ./animation  ./renderers  ./react
 *   ./adapters/svg  ./adapters/canvas2d  ./three
 *   ./avatars/{consona,allie}[/install|/react|/three]  (+ any local families)
 */

// SVG / canvas renderer factories register on import (no heavy deps).
import './adapters/svg/index.ts';
import './adapters/canvas2d/index.ts';
// Consona is available by default from the root entry.
import './avatars/consona/install.ts';

// Engine + handle
export { AvatarEngine, avatarEngine } from './core/engine/AvatarEngine.ts';
export { avatarHandleFromRuntime } from './core/engine/AvatarHandle.ts';
export type { AvatarHandle } from './core/engine/AvatarHandle.ts';
export type { AvatarInstance } from './core/engine/AvatarInstance.ts';

// Define: avatars, presets, behaviors, timelines
export { defineAvatar } from './core/define/defineAvatar.ts';
export type { DefineAvatarInput, DefinedAvatar } from './core/define/defineAvatar.ts';
export {
  registerPreset,
  getPreset,
  hasPreset,
  listPresets,
  SHARED_PRESET_IDS,
  PRESET_BLINK_RATE,
} from './core/preset/index.ts';
export type { PresetSpec, PresetCycle, PresetWave, PresetValue, PresetVariation, SharedPresetId } from './core/preset/index.ts';
export { defineBehavior, registerBehavior, listBehaviors, getBehavior } from './core/animation/behaviors.ts';
export { defineAtom, registerAtom, getAtom, listAtoms, AVATAR_ANCHORS } from './core/atom/index.ts';
export type { AtomDefinition, AvatarAnchorName } from './core/atom/index.ts';
export type { AvatarMessageOptions, AvatarMessageView, AvatarMessageSnapshot } from './core/event/index.ts';
export type { BehaviorDefinition } from './core/types/AvatarDefinition.ts';
export { defineTimeline, AvatarTimelinePlayer } from './core/animation/timeline.ts';
export type { AvatarTimeline, AvatarTimelineStep, AvatarTimelineOptions } from './core/animation/timeline.ts';

// Channels (persistent dynamics), events, plugins
export { ChannelBank, registerChannel, listChannels, CORE_CHANNELS, VALENCE_CHANNEL, ENERGY_CHANNEL, CHANNEL_VALENCE, CHANNEL_ENERGY } from './core/channel/channel.ts';
export type { ChannelSpec, ChannelKind, ChannelExpression } from './core/channel/channel.ts';
export { tintForValence, glowForValence, configureValencePalette, valencePaletteOf, DEFAULT_VALENCE_PALETTE } from './core/color/valence.ts';
export type { ValencePalette } from './core/color/valence.ts';
export type { CoreChannelId } from './core/channel/channel.ts';
export { defineSequenceBehavior } from './core/animation/sequence.ts';
export type { AvatarSequenceStep, AvatarSequenceInfo } from './core/animation/sequence.ts';
export { LinePool, LINE_MESSAGE_PARAM } from './core/event/lines.ts';
export type { AvatarEventRequest } from './core/event/event.ts';
export { definePlugin, mergePluginContent } from './core/plugins/plugin.ts';
export type { AvatarPlugin, PluginContent, PluginControls, PluginApi, PluginStudio, PluginStudioEvent } from './core/plugins/plugin.ts';
export type { AvatarIds } from './core/engine/AvatarHandle.ts';
export type { AvatarEffectRequest, AvatarEffectKind } from './core/event/index.ts';
export type { BehaviorCue } from './core/types/AvatarDefinition.ts';

// Catalog
export {
  registerAvatarFamily,
  registerAvatarPreset,
  listAvatarFamilies,
  listAvatarPresets,
  getAvatarFamily,
  getAvatarPreset,
  installAvatarFamily,
  isAvatarFamilyInstalled,
  composeAvatar,
  getAvatarCatalog,
  subscribeAvatarCatalog,
} from './core/catalog/index.ts';

// React
export { Avatar } from './react/Avatar.ts';
export { useAvatarHandle } from './react/useAvatarHandle.ts';
export { AvatarMessageBubble } from './react/AvatarMessageBubble.ts';
export type { AvatarMessageBubbleProps } from './react/AvatarMessageBubble.ts';
export { useAvatarCatalog } from './react/useAvatarCatalog.ts';

// Consona family
export * from './avatars/consona/consona.config.ts';
export * from './avatars/consona/consona.apply.ts';
export * from './avatars/consona/palettes/consona.palettes.ts';
export * from './avatars/consona/layout/consona.layout.ts';
export * from './avatars/consona/sdk/index.ts';
export * from './avatars/consona/react/index.ts';
export { HEAD_SHAPE_IDS } from './avatars/consona/variants/head.variants.ts';
export { CONSONA_PRESETS, registerConsonaPresets } from './avatars/consona/presets/consona.presets.ts';

import { consonaEngine } from './avatars/consona/sdk/ConsonaEngine.ts';
export default consonaEngine;
