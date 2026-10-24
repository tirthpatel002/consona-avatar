import type { ChannelSpec, CoreChannelId } from '../channel/channel.ts';
import type { PresetSpec } from '../preset/presets.ts';
import type { AtomDefinition } from '../atom/atom.ts';
import type { BehaviorDefinition } from '../types/AvatarDefinition.ts';
import type { AvatarEventRequest } from '../event/event.ts';
import type { AvatarPlayOptions } from '../animation/state-machine/AvatarStateMachine.ts';

/**
 * Plugins: optional content attached to ONE avatar at a time
 * (`handle.use(plugin)`). A plugin brings channels, presets, atoms,
 * behaviors, composition atoms and lines, generic plus a per-family binding
 * (family-specific tuning that overrides by id); nothing is registered
 * globally, so two avatars of the same family stay isolated. The family
 * declares which plugins it supports (`AvatarFamily.plugins`).
 */

/** What a plugin adds to one avatar. */
export interface PluginContent {
  channels?: readonly ChannelSpec[];
  presets?: Readonly<Record<string, PresetSpec>>;
  atoms?: readonly AtomDefinition[];
  behaviors?: readonly BehaviorDefinition<any>[];
  /** Structural atom kinds added to the avatar's composition (each renderer builds them with its drawer for that kind). */
  composition?: readonly string[];
  /** Named line pools its behaviors speak from (studio / hosts read them). */
  lines?: Readonly<Record<string, readonly string[]>>;
}

/** A ready-made event the studio offers (e.g. a sparkle burst, a line). */
export interface PluginStudioEvent {
  id: string;
  label: string;
  event: AvatarEventRequest;
}

/** Studio descriptors (data only; a studio renders them generically, badged with the plugin id). */
export interface PluginStudio {
  /** Ids to show, in order (default: everything the plugin installs). */
  channels?: readonly string[];
  presets?: readonly string[];
  behaviors?: readonly string[];
  atoms?: readonly string[];
  events?: readonly PluginStudioEvent[];
  /** Named values per channel (quick picks next to its slider, e.g. named levels on valence). */
  marks?: Readonly<Record<string, readonly { label: string; value: number }[]>>;
}

/** Typed controls over the plugin's own ids on one avatar. */
export interface PluginControls<B extends string, C extends string, P extends string> {
  readonly id: string;
  play(behavior: B, options?: AvatarPlayOptions): boolean;
  set(channel: C | CoreChannelId, value: number | null, options?: { immediate?: boolean }): boolean;
  apply(preset: P): void;
}

export type PluginApi<B extends string, C extends string, P extends string, Api> = PluginControls<B, C, P> & Api;

export interface AvatarPlugin<B extends string = string, C extends string = string, P extends string = string, Api = unknown> {
  readonly id: string;
  /** Ids it guarantees on every avatar it attaches to (checked at `use()`). */
  readonly behaviors: readonly B[];
  readonly channels: readonly C[];
  readonly presets: readonly P[];
  readonly studio: PluginStudio;
  /** Generic content merged with the family's binding (binding wins by id). */
  content(family: string | undefined): PluginContent;
  api(controls: PluginControls<B, C, P>): Api;
}

export interface PluginSpec<B extends string, C extends string, P extends string, Api> {
  id: string;
  behaviors?: readonly B[];
  channels?: readonly C[];
  presets?: readonly P[];
  content: () => PluginContent;
  /** Per-family content, registered by the family itself (e.g. `{ <family>: () => ({ behaviors: [hug] }) }`). */
  bindings?: Readonly<Record<string, () => PluginContent>>;
  studio?: PluginStudio;
  /** Extra typed API on top of the controls (e.g. domain helpers mapping onto channels). */
  api?: (controls: PluginControls<B, C, P>) => Api;
}

const byId = <T>(a: readonly T[] | undefined, b: readonly T[] | undefined, key: (t: T) => string): T[] => {
  const m = new Map<string, T>();
  for (const t of a ?? []) m.set(key(t), t);
  for (const t of b ?? []) m.set(key(t), t);
  return [...m.values()];
};

/** Merge generic plugin content with a binding (the binding wins by id). */
export function mergePluginContent(base: PluginContent, binding: PluginContent | undefined): PluginContent {
  if (!binding) return base;
  return {
    channels: byId(base.channels, binding.channels, (c) => c.id),
    presets: { ...base.presets, ...binding.presets },
    atoms: byId(base.atoms, binding.atoms, (a) => a.id),
    behaviors: byId(base.behaviors, binding.behaviors, (b) => b.name),
    composition: [...new Set([...(base.composition ?? []), ...(binding.composition ?? [])])],
    lines: { ...base.lines, ...binding.lines },
  };
}

export function definePlugin<const B extends string = never, const C extends string = never, const P extends string = never, Api = unknown>(
  spec: PluginSpec<B, C, P, Api>,
): AvatarPlugin<B, C, P, Api> {
  return {
    id: spec.id,
    behaviors: spec.behaviors ?? [],
    channels: spec.channels ?? [],
    presets: spec.presets ?? [],
    studio: spec.studio ?? {},
    content: (family) => mergePluginContent(spec.content(), family ? spec.bindings?.[family]?.() : undefined),
    api: (controls) => (spec.api ? spec.api(controls) : ({} as Api)),
  };
}

/** What a plugin installs into (the avatar's state machine). */
export interface PluginHost {
  install(pluginId: string, content: PluginContent): boolean;
  has(behavior: string): boolean;
  hasChannel(channel: string): boolean;
  hasPreset(preset: string): boolean;
  play(behavior: string, options?: AvatarPlayOptions): boolean;
  set(channel: string, value: number | null, immediate?: boolean): boolean;
  apply(preset: string): void;
}

/**
 * Attach `plugin` to one avatar: checks the family supports it, installs the
 * merged content (idempotent per avatar), verifies the promised ids and
 * returns the typed API.
 */
export function attachPlugin<B extends string, C extends string, P extends string, Api>(
  host: PluginHost,
  family: string | undefined,
  supported: readonly string[] | undefined,
  plugin: AvatarPlugin<B, C, P, Api>,
): PluginApi<B, C, P, Api> {
  if (!supported?.includes(plugin.id)) throw new Error(`[plugin] family '${family ?? '*'}' does not support plugin '${plugin.id}'`);
  host.install(plugin.id, plugin.content(family));
  const missing = [
    ...plugin.behaviors.filter((b) => !host.has(b)),
    ...plugin.channels.filter((c) => !host.hasChannel(c)),
    ...plugin.presets.filter((p) => !host.hasPreset(p)),
  ];
  if (missing.length) throw new Error(`[plugin] '${plugin.id}' on '${family ?? '*'}' is missing: ${missing.join(', ')}`);
  const controls: PluginControls<B, C, P> = {
    id: plugin.id,
    play: (b, o) => host.play(b, o),
    set: (c, v, o) => host.set(c, v, o?.immediate),
    apply: (p) => host.apply(p),
  };
  return Object.assign(plugin.api(controls) ?? {}, controls) as PluginApi<B, C, P, Api>;
}
