import { getAvatarFamily, type AvatarHandle, type AvatarPlugin, type AvatarRendererId } from '@consona/avatar-enhanced/core/index.ts';
import { vibe } from '@consona/avatar-enhanced/plugins/vibe/index.ts';

/** Plugins the studio attaches to every avatar whose family declares them (renderer drawers load with the renderer). */
export interface StudioPlugin {
  plugin: AvatarPlugin<string, string, string, unknown>;
  renderers?: Partial<Record<AvatarRendererId, () => Promise<unknown>>>;
}

/** Always-shipped plugins (no renderer drawers: renderer-agnostic content only). */
const STUDIO_PLUGINS: readonly StudioPlugin[] = [
  // the reference example plugin
  { plugin: vibe },
];

/**
 * Local-only plugins: every `local/*.plugin.ts` is picked up by glob, so the
 * app builds whether or not any exist (nothing under `local/` is published).
 */
const localPluginModules = import.meta.glob<{ default: StudioPlugin }>('./local/*.plugin.ts', { eager: true });
const LOCAL_PLUGINS: readonly StudioPlugin[] = Object.values(localPluginModules).map((m) => m.default);

/** All studio plugins: always-shipped + local-only. */
const ALL_PLUGINS: readonly StudioPlugin[] = [...STUDIO_PLUGINS, ...LOCAL_PLUGINS];

/** Attach the supported studio plugins to `h` (idempotent; called again after the avatar is re-created). */
export async function attachStudioPlugins(h: AvatarHandle, family: string | undefined, renderer: AvatarRendererId): Promise<void> {
  const supported = family ? getAvatarFamily(family)?.plugins ?? [] : [];
  for (const { plugin, renderers } of ALL_PLUGINS) {
    if (!supported.includes(plugin.id) || h.plugins.includes(plugin.id)) continue;
    await renderers?.[renderer]?.();
    if (!h.plugins.includes(plugin.id)) h.use(plugin);
  }
}

export type StudioItemKind = 'behaviors' | 'channels' | 'presets' | 'atoms';

/** What the attached plugins contribute to the studio tabs: badge per item id + their marks / events. */
export interface StudioPluginView {
  badge: (kind: StudioItemKind, id: string) => string | null;
  marks: Readonly<Record<string, readonly { label: string; value: number; plugin: string }[]>>;
  events: readonly { id: string; label: string; plugin: string; event: Parameters<AvatarHandle['emit']>[0] }[];
}

const EMPTY_VIEW: StudioPluginView = { badge: () => null, marks: {}, events: [] };

/** Plugin descriptors of the attached plugins (`attached` = `handle.plugins`), driven only by `plugin.studio`. */
export function studioPluginView(attached: readonly string[], family: string | undefined): StudioPluginView {
  const list = ALL_PLUGINS.filter((p) => attached.includes(p.plugin.id)).map((p) => p.plugin);
  if (!list.length) return EMPTY_VIEW;
  const owner = new Map<string, string>();
  const marks: Record<string, { label: string; value: number; plugin: string }[]> = {};
  const events: StudioPluginView['events'][number][] = [];
  for (const p of list) {
    const s = p.studio;
    const ids: Record<StudioItemKind, readonly string[]> = {
      behaviors: s.behaviors ?? p.behaviors,
      channels: s.channels ?? p.channels,
      presets: s.presets ?? p.presets,
      atoms: s.atoms ?? (p.content(family).atoms ?? []).map((a) => a.id),
    };
    for (const k in ids) for (const id of ids[k as StudioItemKind]) owner.set(`${k}:${id}`, p.id);
    for (const ch in s.marks ?? {}) (marks[ch] ??= []).push(...s.marks![ch]!.map((m) => ({ ...m, plugin: p.id })));
    for (const e of s.events ?? []) events.push({ ...e, plugin: p.id });
  }
  return { badge: (kind, id) => owner.get(`${kind}:${id}`) ?? null, marks, events };
}
