/**
 * ══════════════════════════════════════════════════════════════════════════
 *  The `vibe` plugin — the reference example for writing avatar plugins.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A plugin bundles domain content (channels, presets, behaviors, atoms,
 * lines) that any avatar family can opt into. It is pure `core` code: no
 * renderer imports, no family imports — families and hosts attach it, never
 * the other way round.
 *
 * The building blocks (see the sibling files for each):
 *
 *   channels.ts   `ChannelSpec`    a named, blendable input ('focus') whose
 *                                  expression describes the look at full weight
 *   behaviors.ts  BehaviorDefinition one-shot / looping motions played with
 *                                  `handle.play('cheer')`, with timed cues
 *   this file     `definePlugin`   the manifest: which ids it guarantees, a
 *                                  `content()` factory (what gets installed),
 *                                  an optional `studio` section (controls the
 *                                  studio renders, badged with the plugin id)
 *                                  and an `api` (typed helpers on the handle)
 *
 * Lifecycle: a family *declares* support with `plugins: ['vibe']` in its
 * catalog entry (a plain string — no import), and the host attaches the
 * plugin per avatar:
 *
 *   import { vibe } from '@consona/avatar/plugins/vibe';
 *   const v = avatar.use(vibe);      // installs the content below, or throws
 *                                    // if the family didn't declare it
 *   v.set('focus', 1);               // channel: eases into the focus look
 *   v.play('cheer', { params: { message: 'Ship it!' } });
 *   v.apply('focused');              // preset: named channel levels
 *   v.focus(true);                   // the plugin's own api helper
 *
 * Renderer-side extras (custom atom drawings, particle effects) live in a
 * sibling `three/` package the *host* imports next to the renderer — the
 * plugin itself stays renderer-agnostic (add a sibling `three/` package with
 * drawers for worked examples of renderer-side atoms).
 */
import { definePlugin } from '../../core/plugins/plugin.ts';
import { focusChannel } from './channels.ts';
import { cheerBehavior } from './behaviors.ts';

/** Named channel levels, quick-pickable in the studio. */
export const FOCUS_MARKS = [
  { label: 'Off', value: 0 },
  { label: 'In the zone', value: 0.6 },
  { label: 'Locked in', value: 1 },
] as const;

/** The plugin instance (id is the badge and the family-declaration key). */
export const vibe = definePlugin({
  id: 'vibe',
  // ids guaranteed on every avatar the plugin attaches to (checked at use())
  behaviors: ['cheer'],
  channels: ['focus'],
  presets: ['focused'],
  // what `use()` installs into the avatar's state machine (per family, via
  // the optional `bindings` map — this plugin keeps it generic)
  content: () => ({
    channels: [focusChannel],
    // channel presets: named levels for the plugin's own channels
    presets: {
      focused: { label: 'Focused', channels: { focus: 1 } },
    },
    behaviors: [cheerBehavior],
  }),
  studio: {
    channels: ['focus'],
    presets: ['focused'],
    behaviors: ['cheer'],
    marks: { focus: FOCUS_MARKS },
  },
  api: (wb) => ({
    /** Ease the focus look in / out (`true` = 1, `false` = 0; null clears). */
    focus: (on: boolean | number | null) => wb.set('focus', on === null ? null : typeof on === 'number' ? Math.max(0, Math.min(1, on)) : on ? 1 : 0),
    /** Play the celebratory hop, with an optional line. */
    cheer: (message?: string) => wb.play('cheer', message ? { params: { message } } : undefined),
  }),
});

export type VibePlugin = typeof vibe;
