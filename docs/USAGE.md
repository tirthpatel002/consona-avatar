# Using `@consona/avatar` in an app

A task-first guide for app developers. Background: [README.md](../README.md) (architecture, atoms,
presets, animation internals).
Every `ts` / `tsx` snippet is type-checked against the real exports (see the
[appendix](#appendix-how-snippets-are-checked)).

**About families.** Avatar families are OPTIONAL, self-contained packages under
`src/avatars/<family>/`, each published through its own data-only `install` entry
(`@consona/avatar/avatars/<family>/install`). Your app registers/installs whichever family
packages it ships and never hardcodes one: core, adapters, plugins and React are
family-agnostic. The repo ships `consona` (a 2D face avatar family, SVG scene graph,
installed by the package root) and `allie` (a 3D body-avatar family, Three.js); other
family packages follow the same shape. Where a snippet below needs a Three family, it uses
Allie.

1. [Quick start](#1-quick-start)
2. [Multiple avatars: one handle each](#2-multiple-avatars-one-handle-each)
3. [Core concepts](#3-core-concepts)
4. [Controlling an avatar](#4-controlling-an-avatar)
5. [Plugins](#5-plugins)
6. [Family notes](#6-family-notes)
7. [React patterns](#7-react-patterns)
8. [Recipes](#8-recipes)
9. [Performance](#9-performance)
10. [Troubleshooting](#10-troubleshooting)
11. [Reference](#11-reference)

---

## 1. Quick start

`three` (>= 0.160) is an optional peer dependency, needed only for the Three families (Allie
and any other 3D body-avatar family you install). Consona (SVG) works without it.

Mount one Allie avatar and make it wave:

```tsx
import { Avatar, useAvatarHandle } from '@consona/avatar';
import '@consona/avatar/avatars/allie/install';   // registers the Allie families (data only; Three code loads on first render)

export function Companion() {
  const allie = useAvatarHandle();                  // this avatar's handle
  return (
    <div style={{ width: 360, height: 360 }}>
      <Avatar ref={allie.ref} preset="yellow" />
      <button onClick={() => allie.play('wave')}>Wave</button>
      <p>Now: {allie.state?.behavior ?? 'loading'}</p>
    </div>
  );
}
```

- `preset` is a catalog preset id (`listAvatarPresets()`); it implies the family. `family`
  picks the family explicitly.
- The `install` entry is data only; the family's Three package is `import()`ed when the first
  avatar renders, so pages without avatars don't pay for Three.
- `allie.state` is `null` until the avatar has mounted.

## 2. Multiple avatars: one handle each

**Every rendered avatar has its own `AvatarHandle`.** Calls on it (`play`, `set`, `apply`, `emit`,
`attach`, `pose`, …) change that instance only, and its `state`, events and lists describe only
that instance. **Plugins are per instance too**: `use(plugin)` installs on that avatar only. There
is no global "current avatar"; if you have two avatars, you hold two handles.

| Mounting style | How you get each avatar's handle |
|---|---|
| `<Avatar>` (React, any family) | Its `ref` *is* the `AvatarHandle`. Use one `useAvatarHandle()` per avatar and pass `.ref` (`.handle()` returns the handle), or a plain `useRef<AvatarHandle>(null)`. `onClick(handle)` receives the clicked avatar's handle. There is no `onReady`: the ref is filled on mount. |
| `<StageAvatar>` inside `<ThreeCanvas>` (several Three avatars, one WebGL scene) | Its `ref` is the runtime; `avatarHandleFromRuntime(ref.current)` returns the handle. One ref per `<StageAvatar>`. |
| `createAvatarStage()` (plain Three, no React) | `stage.add(definition)` returns one controller per avatar; `avatarHandleFromRuntime(controller)` returns its handle. |
| Consona engine (no React) | `consonaEngine.create(config)` returns an instance; `createConsonaAvatarHandle(consonaEngine, instance.id)` returns its handle. |

Two avatars side by side, only one with the wellbeing plugin, controlled independently:

```tsx
import { useEffect } from 'react';
import { Avatar, useAvatarHandle, type AvatarHandle } from '@consona/avatar';
import { wellbeing } from '@consona/avatar/plugins/wellbeing';
import '@consona/avatar/avatars/allie/install';

export function TwoCompanions() {
  const coach = useAvatarHandle();   // gets wellbeing
  const buddy = useAvatarHandle();   // stays a plain avatar
  const coachMounted = coach.state !== null;

  useEffect(() => {
    const h = coach.handle() as AvatarHandle | null;
    if (!h) return;
    void import('@consona/avatar/plugins/wellbeing/three')     // the plugin's Three drawers
      .then(() => h.use(wellbeing)?.checkIn('low'));
  }, [coachMounted, coach]);

  return (
    <>
      <Avatar ref={coach.ref} preset="yellow" size={280} />
      <Avatar ref={buddy.ref} preset="blue" size={280} />
      <button onClick={() => coach.play('jump')}>Jump (coach)</button>
      <button onClick={() => buddy.play('wave')}>Wave (buddy)</button>
      {/* plugin ids only exist on avatars that installed the plugin */}
    </>
  );
}
```

Each `<Avatar>` with a Three family runs its own canvas. For many Three avatars in one scene
(shared camera, lights, one WebGL context), use a stage:

```tsx
import { useRef } from 'react';
import { ThreeCanvas, StageAvatar } from '@consona/avatar/three/react';
import { avatarHandleFromRuntime, defineAvatar, listAvatarPresets } from '@consona/avatar';
import type { AvatarDefinition } from '@consona/avatar/core';
import '@consona/avatar/avatars/allie/install';
import '@consona/avatar/avatars/allie/three';   // StageAvatar needs the Three package loaded eagerly

const allieDef = defineAvatar(listAvatarPresets('allie')[0]!.definition as AvatarDefinition);

export function Duo() {
  const left = useRef<React.ElementRef<typeof StageAvatar>>(null);
  const right = useRef<React.ElementRef<typeof StageAvatar>>(null);
  const handle = (r: typeof left) => (r.current ? avatarHandleFromRuntime(r.current) : null);
  return (
    <ThreeCanvas style={{ width: 640, height: 360 }}>
      <StageAvatar ref={left} definition={allieDef} position={[-1.2, 0, 0]} />
      <StageAvatar ref={right} definition={allieDef} position={[1.2, 0, 0]} preset="happy" />
      <button onClick={() => handle(left)?.play('jump')}>Left jumps</button>
      <button onClick={() => handle(right)?.set('energy', -0.6)}>Right calms down</button>
    </ThreeCanvas>
  );
}
```

Without React:

```ts
import { createAvatarStage } from '@consona/avatar/three';
import { avatarHandleFromRuntime, consonaEngine, createConsonaAvatarHandle, defineAvatar, listAvatarPresets } from '@consona/avatar';
import type { AvatarDefinition } from '@consona/avatar/core';
import '@consona/avatar/avatars/allie/install';
import '@consona/avatar/avatars/allie/three';

// Three: one controller (and handle) per stage.add
const base = listAvatarPresets('allie')[0]!.definition as AvatarDefinition;
const stage = createAvatarStage({ canvas: document.querySelector('canvas')! });
const left = avatarHandleFromRuntime(stage.add(defineAvatar({ ...base, position: [-1, 0, 0] })));
const right = avatarHandleFromRuntime(stage.add(defineAvatar({ ...base, position: [1, 0, 0] })));
left.play('wave');            // right is unaffected
right.apply('sleepy');
// teardown: stage.dispose()

// Consona (SVG): one handle per engine instance id
const ana = createConsonaAvatarHandle(consonaEngine, consonaEngine.create({ seed: 'ana' }).id);
const ben = createConsonaAvatarHandle(consonaEngine, consonaEngine.create({ seed: 'ben' }).id);
ana.play('nod');
ben.apply('happy');
```

## 3. Core concepts

Five primitives; each has one verb on the handle.

| Primitive | What it is | Verb |
|---|---|---|
| **Atom** | Something drawn at an anchor (`hand`, `head`, `mouth`, `chest`, `base`): a cup, a blanket, a halo, or a structural rig part (fur, limbs). | `attach` / `detach` |
| **Channel** | A persistent, eased value. Every avatar has `valence` and `energy` (−1..1); families / plugins add more. `level` = a value, `rhythm` = a rate per minute (e.g. heartbeat bpm). A channel can carry an *expression*: posture, sway, eyes / mouth, limb tone, gaze / blink rate, atoms, numeric look params, a colour tint. | `set` |
| **Preset** | A named state: channel values + periodic modulation of the look. | `apply` |
| **Behavior** | A timed run (seconds, endless, or a clip) that animates the pose, can hold channels, emits `cue`s, and can wait for an outcome. | `play` / `enqueue` / `resolve` |
| **Event** | A one-shot: a visual effect (`sparkles`, `ripple`) or a speech-bubble message. | `emit` |

**Who wins.** Channel values layer as *preset < your `set()` < the running behavior's held
channels*, so a behavior can temporarily override your value and your value comes back when it
ends. Exception: for a rhythm, a measured rate you `set` beats a behavior's fallback rate.

**Layers of the package**: `core` (primitives, resolver, family + plugin contracts) → `adapters`
(Three / SVG / canvas renderers) → `families` (optional, self-contained packages under
`src/avatars/<family>/`) → `plugins` (domain content such as wellbeing, attached per avatar) →
your app. Core, adapters and families contain no domain content; anything domain-specific comes
from a plugin. Removing a family folder never breaks the package.

## 4. Controlling an avatar

All snippets here use a plain-Three handle so they run standalone; in React the same calls exist on
`useAvatarHandle()` (or on `.handle()`).

```ts
import { createAvatarStage } from '@consona/avatar/three';
import { avatarHandleFromRuntime, defineAvatar, defineTimeline, listAvatarPresets } from '@consona/avatar';
import type { AvatarDefinition, AvatarEvent } from '@consona/avatar/core';
import '@consona/avatar/avatars/allie/install';
import '@consona/avatar/avatars/allie/three';

const stage = createAvatarStage({ canvas: document.querySelector('canvas')! });
const avatar = avatarHandleFromRuntime(stage.add(defineAvatar(listAvatarPresets('allie')[0]!.definition as AvatarDefinition)));

// Make it do something: behaviors
avatar.play('jump', { then: ['spin', 'wave'] });  // false if unknown on this avatar
avatar.play('spin', { params: { turns: 2 } });    // params schema: avatar.behaviorSpec('spin')?.params
avatar.enqueue('nod');                            // after the current run
avatar.idle();                                    // stop whatever runs (looping behaviors need this or a new play)

// Change how it feels: channels and presets
avatar.set('valence', 0.6);                       // eases there; { immediate: true } jumps; null = release
avatar.set('energy', -0.3);
avatar.apply('sleepy');                           // a named state

// One-shots: effects and messages
avatar.emit({ type: 'effect', kind: 'sparkles', count: 14, anchor: 'head' });
avatar.emit({ type: 'message', text: 'Saved', duration: 2 });
avatar.emit({ type: 'message', text: null });     // clear

// Hold an object
avatar.attach('cup', 'hand');                     // false if the atom is unknown on this avatar
avatar.detach('cup');

// Body, face, gaze
avatar.pose({ body: [0, 0.3, 0.1] }, { duration: 0.5, end: 'hold' });
avatar.blink();
avatar.setGazeTarget({ x: 0.5, y: 0.2 });         // normalized (x right, y up); null = follow pointer

// Choreography: deterministic timelines (seek replays exactly)
const player = avatar.playTimeline(defineTimeline([
  { behavior: 'jump' }, { preset: 'happy' }, { wait: 0.5 }, { gaze: { x: 0.6, y: 0.2 } }, { behavior: 'wave' },
], { blink: { seed: 7 } }));
player?.seek(1.2);
avatar.stopTimeline();

// React to it: events
const off = avatar.subscribe((e: AvatarEvent) => {
  if (e.type === 'cue') console.log(e.behavior, e.cue, e.data);      // timed moments inside a behavior
  if (e.type === 'end') console.log(e.behavior, e.interrupted ? 'replaced' : 'finished');
});
off();

// Inspect it: state and live lists (include attached plugins)
console.log(avatar.state.behavior, avatar.state.channels.valence, avatar.state.queue);
console.log(avatar.behaviors, avatar.channels.map((c) => c.id), avatar.presets, avatar.atoms, avatar.attached, avatar.plugins);
```

**Waiting behaviors.** Some behaviors (reminders, routines) run until your UI answers:
`avatar.resolve('confirm')` ends the run with that outcome (default: its first) and emits a
`resolve` event. Read `avatar.state.outcomes` to render the buttons.

**Snapshot** (Three only): a transparent, high-res PNG of the current frame.

```tsx
import { Avatar, useAvatarHandle } from '@consona/avatar';
import '@consona/avatar/avatars/allie/install';

export function SaveFrame() {
  const avatar = useAvatarHandle();
  const save = async () => {
    if (!avatar.canSnapshot()) return;                      // SVG avatars cannot snapshot
    const blob = await avatar.snapshot({ scale: 2, maxSize: 2048 });
    window.open(URL.createObjectURL(blob));
  };
  return <><Avatar ref={avatar.ref} preset="yellow" /><button onClick={save}>Save PNG</button></>;
}
```

**Typed ids.** `AvatarHandle<Ids>` narrows ids at compile time; a family package may export a
typed alias for its ids. Plugin ids become typed through `use()`. Hooks return untyped handles,
so narrow once: `avatar.handle() as AvatarHandle<Ids> | null`.

## 5. Plugins

### Using wellbeing

A family declares which plugins it supports in its catalog
(`registerAvatarFamily({ plugins: ['wellbeing'] })`); `use()` throws on any other family. Import
the plugin's Three drawers first (lazily), then `use` it on the avatar that should have it —
for a Three avatar of a family that declares `wellbeing`:

```tsx
import { useEffect } from 'react';
import { Avatar, useAvatarHandle, type AvatarHandle } from '@consona/avatar';
import { wellbeing } from '@consona/avatar/plugins/wellbeing';
import '@consona/avatar/avatars/<family>/install';   // any family package whose catalog declares plugins: ['wellbeing']

export function CareCompanion() {
  const avatar = useAvatarHandle();
  const mounted = avatar.state !== null;

  useEffect(() => {
    const h = avatar.handle() as AvatarHandle | null;
    if (!h) return;                                        // use() needs a mounted avatar
    void import('@consona/avatar/plugins/wellbeing/three').then(() => {
      const care = h.use(wellbeing);                       // idempotent; typed API
      care.checkIn('okay');                                // 'great' | 'good' | 'okay' | 'low' | 'struggling' | −1..1 | null
      care.heartRate(72);                                  // wearable bpm → chest glow pulse; null = off
      care.set('unwell', 1);                               // sick look (family channels style it in the family's own look)
      care.play('hug', { params: { mode: 'wrap', message: 'I am here with you' } });
    });
  }, [mounted, avatar]);

  return <Avatar ref={avatar.ref} preset="yellow" />;
}
```

What wellbeing adds to that avatar:

| Kind | Ids | Notes |
|---|---|---|
| Level channels (0..1) | `listening`, `tired`, `unwell`, `blanket`, `thermometer` | `blanket` / `thermometer` show atoms |
| Rhythm channel | `heartbeat` (bpm) | `heartRate()` sets it; a measured rate beats behaviors' calm 60 |
| Presets | `tired`, `unwell`, `breathe-box`, `breathe-478` | `unwell` = unwell 1, energy −0.4, valence −0.3 |
| Support behaviors | `hug` (`mode: 'wrap' \| 'reach'`, `duration`, `message`), `celebrate`, `nudge` (`side`; cue `tap`), `grounding` | |
| Breathing | `breathe-box`, `breathe-478` | endless; `resolve('done')` ends; hold heartbeat at 60 |
| Reminders | `pill`, `water` | wait for `resolve('confirm' \| 'dismiss')` |
| Routines | `journal`, `meal`, `exercise`, `steps`, `screen-break` (wait for `resolve('done')`), `bedtime`, `morning` | |

**Lines.** `hug`, `exercise`, `steps`, `morning` and the reminders say a short line (one per run,
rotating). `params.message` replaces it; `message: false` hides it.

**Grounding UI from cues.** `grounding` (5-4-3-2-1) emits `step` (`label`, `index`, `count`,
`beats`), `beat` (`beat`) and `complete`. Drive your UI from these instead of timers, so the UI and
the animation can't drift:

```ts
import { createAvatarStage } from '@consona/avatar/three';
import { avatarHandleFromRuntime, defineAvatar, listAvatarPresets } from '@consona/avatar';
import type { AvatarDefinition, AvatarHandle } from '@consona/avatar/core';
import { wellbeing } from '@consona/avatar/plugins/wellbeing';
import '@consona/avatar/avatars/<family>/install';   // a family that declares plugins: ['wellbeing']
import '@consona/avatar/avatars/<family>/three';
import '@consona/avatar/plugins/wellbeing/three';

const stage = createAvatarStage({ canvas: document.querySelector('canvas')! });
const avatar = avatarHandleFromRuntime(stage.add(defineAvatar(listAvatarPresets('<family>')[0]!.definition as AvatarDefinition))) as AvatarHandle;
const care = avatar.use(wellbeing);

const label = document.querySelector('#step')!;
avatar.subscribe((e) => {
  if (e.type !== 'cue' || e.behavior !== 'grounding') return;
  if (e.cue === 'step') label.textContent = `${Number(e.data?.index) + 1}/${String(e.data?.count)}: ${String(e.data?.label)}`;
  if (e.cue === 'complete') label.textContent = 'Well done';
});
care.play('grounding');
```

### Writing a plugin

A plugin is data plus an optional API. The ids you list in `behaviors` / `channels` / `presets` are
a promise: `use()` checks them against the installed content (and they type the returned API).

```ts
import { definePlugin, defineBehavior, defineAtom } from '@consona/avatar';
import type { ChannelSpec, PluginContent } from '@consona/avatar/core';

const focus: ChannelSpec = {
  id: 'focus', label: 'Focus', settle: 1.2,
  pose: { body: [0.05, 0, 0] }, gaze: 0.6, blinkRate: 0.8,     // lean in, steadier gaze, fewer blinks
  atoms: [{ id: 'headphones', anchor: 'head' }],               // shown while focus > 0
};

const deepWork = defineBehavior({
  name: 'deep-work', duration: Infinity, outcomes: { done: 'idle' },
  channels: { focus: 1 },                                      // held while running
  cues: [{ at: 0.2, name: 'begin', effect: { kind: 'ripple', anchor: 'head' } }],
  update({ pose, t }) { pose.y(Math.sin(t * 2) * 0.01); },
});

// Per-family binding, keyed by family id: wins over generic content with the same id
const familyBinding = (): PluginContent => ({
  channels: [{ ...focus, params: { 'fur.pattern': 'rib' }, tint: { color: '#a8b8ff', amount: 0.15 } }],
});

export const focusPlugin = definePlugin({
  id: 'focus',
  behaviors: ['deep-work'], channels: ['focus'], presets: ['focused'],
  content: () => ({
    channels: [focus],
    presets: { focused: { label: 'Focused', channels: { focus: 1, energy: 0.2 } } },
    atoms: [defineAtom({ id: 'headphones', kind: 'headphones', anchor: 'head' })],
    behaviors: [deepWork],
  }),
  bindings: { myFamily: familyBinding },
  studio: { events: [{ id: 'ping', label: 'Ping', event: { type: 'effect', kind: 'ripple', anchor: 'head' } }] },
  api: (p) => ({ start: () => p.play('deep-work'), level: (v: number | null) => p.set('focus', v) }),
});
```

Then draw the new atom kind in your plugin's Three entry (loaded lazily, like
`plugins/wellbeing/three`):

```ts
import * as THREE from 'three';
import { registerAtomDrawer } from '@consona/avatar/three';

registerAtomDrawer({
  kind: 'headphones',
  draw: () => ({
    object: new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: '#333' })),
  }),   // built once per rig on first show, then only transformed
});
```

Authoring notes:

- **`api(controls)`** gets `play` / `set` / `apply` scoped to the plugin's own ids (plus `valence` / `energy`); its
  result is merged into what `use()` returns. Outcomes are the app's call: `handle.resolve()`.
- **Family support is explicit.** A family lists plugin ids in `registerAvatarFamily({ plugins })`;
  `use()` on any other family throws. This keeps families from silently half-supporting a plugin.
- **Plugins never import family code.** Family choreography goes through the `bindings` map
  (keyed by family id); core only sees plugin content. That is what makes family folders safe to
  remove.
- **Channel `params`**: numeric look paths at full weight (e.g. `'fur.pattern'`); written only
  while the weight moves; paths that need a rebuild are skipped; channels sharing a path add up.
  **`tint`**: `{ color, amount?, saturation?, lift? }`, mixed in OKLab after the valence tint.
- **Signed channels** (`min < 0`, e.g. `valence`): the expression's pose / sway / `params` / gaze /
  blink are mirrored below 0 (−1 = the opposite side of the default); eyes, mouth, atoms, limb tone
  and `tint` apply above 0 only. A family gives a core channel an expression by re-registering it
  (`registerChannel({ ...VALENCE_CHANNEL, pose, params }, family)`) and its colour with
  `configureValencePalette(family, palette)`.
- **Behaviors**: `duration` (seconds, `Infinity`, `'clip'`), `params` (schema for UIs),
  `outcomes`, `hidden` follow-ups, `cues` (array or per-run function), held `channels`, and
  `enter` / `update` / `exit` writing `ctx.pose` (`pose.atom(id, w).at(anchor)`,
  `pose.reach(anchor, w)`, `pose.message(text, w)`, `pose.limb(...)`).
- **Lines**: put pools in `content().lines`; `LinePool` + `LINE_MESSAGE_PARAM` give
  "one line per run, overridable by `params.message`".
- **Structural atoms** (rig parts): `registerAtomDrawer({ kind, build(ctx) })` and list the kind in
  `content().composition`.
- **Studio**: `studio` picks which `channels` / `presets` / `behaviors` / `atoms` to show (default:
  all), adds `events` buttons and channel `marks`.

## 6. Family notes

Avatar families are optional packages under `src/avatars/<family>/`, each with a data-only
`install.ts` (family catalog, presets, atoms, behaviors, studio manifest) and — for 3D
families — a `three/` renderer package that loads lazily on first render. The studio
auto-imports every `src/avatars/*/install.ts`; a consumer app imports only the `install`
entries of the families it ships. There are two capability tiers:

| Family | Tier / entry | Notes |
|---|---|---|
| **Consona** | 2D face avatar family (SVG scene graph), installed by the root entry | Config-driven (`config={{ seed, paletteId }}`, palettes, `HEAD_SHAPE_IDS`), clip-backed behaviors (`spin` with `params.axis`, looping `rotate`, …), presets incl. `double-pulse`. No Three rig: `pose()` and rig-only channel expressions (posture, limbs, `params`, `tint`) have no effect. Render `<AvatarMessageBubble>` yourself for messages. `consonaEngine.renderToSvg(config)` gives a static SVG string. |
| **Allie** | 3D body-avatar family, Three, `avatars/allie/install` (classic + threadies families) | Knit / yarn bodies, 3D eyes (`pill`, `sphere`, `star`, `heart`, `cube`), accessories, `defineAllieAvatar`. Default behaviors only; no plugins declared. |
| *(other 3D body-avatar families)* | Three, `avatars/<family>/install` + `/three` | Same shape as Allie: data-only install, lazy Three package, family-defined fur / limbs / reach anchors, their own studio manifest. A family opts into plugins by declaring `plugins: ['wellbeing']` (etc.) in its catalog. |

Default behaviors on the Three families: `idle wave jump spin think sleep happy wink bounce shake
rock squash nod breathe wiggle tilt wobble`. Consona has its own clips, one name per motion:
`blink bounce jump lookaway nod pulse shake spin spinX spinZ spinXY spinXYZ surprise wave wink`
and the loops `rotate rotateX rotateZ rotateXYZ` (`spin` / `rotate` turn around y; `params.axis`
picks another axis on `spin`). Shared presets: `neutral happy sad curious sleepy surprised
love thinking`.

## 7. React patterns

- **One `useAvatarHandle()` per avatar.** Its methods are stable (safe in effect deps); `state`
  updates on that avatar's events only, never per frame, so it is cheap to render from.
- **Attach plugins after mount.** `use()` returns `null` before mount; key the effect on
  `state !== null` (see [5](#5-plugins)).
- **Change looks by props.** A new `definition` / `config` / `composition` morphs the same avatar;
  it doesn't remount, so the handle, plugins and running behavior survive.
- **`onEvent`** on `<Avatar>` / `<StageAvatar>` = `subscribe` without the cleanup bookkeeping.
- **`<AvatarMessageBubble handle={…}>`** renders the live message as accessible DOM (theme with
  `--avatar-bubble-bg`, `--avatar-bubble-fg`, `--avatar-bubble-font`).
- **`useAvatarCatalog()`** lists families and presets for pickers — build family pickers from it
  instead of hardcoding family ids.

```tsx
import { Avatar, AvatarMessageBubble, useAvatarHandle } from '@consona/avatar';
import type { AvatarEvent } from '@consona/avatar/core';

export function Greeter({ onDone }: { onDone: () => void }) {
  const avatar = useAvatarHandle();
  const onEvent = (e: AvatarEvent) => { if (e.type === 'end' && e.behavior === 'wave') onDone(); };
  return (
    <div style={{ position: 'relative' }}>
      <Avatar ref={avatar.ref} family="consona" config={{ seed: 'greeter' }} size={120} onEvent={onEvent} />
      {avatar.handle() && <AvatarMessageBubble handle={avatar.handle()!} />}
      <button onClick={() => { avatar.play('wave'); avatar.emit({ type: 'message', text: 'Hi!', duration: 2 }); }}>Greet</button>
    </div>
  );
}
```

## 8. Recipes

Each recipe takes the wellbeing API of one avatar (`care`, from `avatar.use(wellbeing)` in
[5](#5-plugins)) plus that avatar's handle for `resolve` / `emit`, and is wired once in an effect:

```tsx
import { useEffect } from 'react';
import { Avatar, useAvatarHandle, type AvatarHandle } from '@consona/avatar';
import { wellbeing, type CheckInLevel } from '@consona/avatar/plugins/wellbeing';
import '@consona/avatar/avatars/<family>/install';   // a family that declares plugins: ['wellbeing']

function recipes(avatar: AvatarHandle) {
  const care = avatar.use(wellbeing);
  let typing: ReturnType<typeof setTimeout> | undefined;
  return {
    // Mirror the user's mood: colour, glow and posture drift toward it
    mood: (level: CheckInLevel) => care.checkIn(level),
    // Breathing exercise at a calm 60 bpm: clear the measured rate (it would win), then end on your schedule
    breathe: () => { care.heartRate(null); care.play('breathe-box'); setTimeout(() => avatar.resolve('done'), 4 * 16_000); },
    // Wearable heart rate: once per sample, not per frame
    pulse: (bpm: number | null) => care.heartRate(bpm),
    // Listening while the user types: lean in, release 1.5 s after the last key
    keystroke: () => { care.set('listening', 1); clearTimeout(typing); typing = setTimeout(() => care.set('listening', 0), 1500); },
    // Celebrate a streak
    streak: (days: number) => { care.play('celebrate'); avatar.emit({ type: 'message', text: `${days} days in a row!`, duration: 3 }); },
    // Reminder nudge: raise the glass, wait for the answer
    water: () => care.play('water', { params: { message: 'Water break?' } }),
    answer: (taken: boolean) => avatar.resolve(taken ? 'confirm' : 'dismiss'),
  };
}

export function Coach({ streakDays }: { streakDays: number }) {
  const avatar = useAvatarHandle();
  const mounted = avatar.state !== null;
  useEffect(() => {
    const h = avatar.handle() as AvatarHandle | null;
    if (!h) return;
    void import('@consona/avatar/plugins/wellbeing/three').then(() => recipes(h).streak(streakDays));
  }, [mounted, avatar, streakDays]);
  return <Avatar ref={avatar.ref} preset="yellow" />;
}
```

## 9. Performance

- **Never drive the avatar per frame.** The engine animates and eases itself (allocation-free per
  frame); call `play` / `set` / `emit` from user events, data updates or timers, not from
  `requestAnimationFrame` or render bodies.
- **`set` is cheap and idempotent.** Re-setting the same value is a no-op, and there's no need to
  tween values yourself.
- **Behavior `params` are bound per run.** Pass a fresh object per `play`; don't mutate it after the
  call expecting the run to change. Hoist constant params when calling often.
- **Reuse handles.** One hook per avatar; call `avatarHandleFromRuntime` once per controller.
  Morph via props instead of remounting.
- **Load renderer code lazily.** Family `install` entries already defer Three; import plugin
  renderer entries (`plugins/wellbeing/three`) with `import()` right before `use()`.
- **Cap the pixel ratio.** Stages default to `min(devicePixelRatio, 2)`; pass a lower `pixelRatio`
  to `<ThreeCanvas>` / `createAvatarStage` for small or numerous avatars. Many Three avatars:
  prefer one `<ThreeCanvas>` (one WebGL context) over many `<Avatar>`s. Off-screen and hidden-tab
  canvases pause automatically.
- **Prefer channel `params` / `tint` over editing `definition`** for continuous look changes: they
  write uniforms only while moving; a `definition` change may rebuild.

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| The wrong avatar reacts | Each avatar has its own handle; check which `ref` / controller you called. |
| A looping behavior (Consona `rotate`, breathing) never stops | Loops run until replaced: `play` another behavior, `idle()`, or `resolve()` a waiting one. Consona loops cross-fade out. |
| `use()` throws `does not support plugin` | The family doesn't list the plugin id in `plugins`. |
| `use()` throws `… is missing: …` | The plugin's content for that family lacks an id it promised. |
| `use()` returns `null` (React) | Called before mount; wait for `state !== null`. |
| Plugin atoms / glow don't show on Three | Import the plugin's Three entry before `use()`. |
| The family isn't there | Import its `install` entry (`@consona/avatar/avatars/<family>/install`) — families are opt-in; only the root entry's default family is pre-installed. |
| `play()` / `set()` / `attach()` returns `false` | Unknown id on *this* avatar (plugin ids exist only after `use` there). Check `handle.behaviors` / `channels` / `atoms`. |
| `apply('x')` logs `[preset] …` | Unknown preset; the avatar rests at `neutral`. |
| My `set()` value is ignored for a while | A running behavior holds that channel; your value returns when it ends. |
| A channel / preset param does nothing | It needs a rebuild (shape, eye type, …); change `definition` instead. |
| `snapshot` unavailable | Only Three avatars capture (`canSnapshot()`); for SVG use `consonaEngine.renderToSvg`. |
| Animation stopped | The canvas is off-screen or the tab is hidden (paused by design). |

## 11. Reference

### Entry points (`package.json` exports)

| Import | Contents / when |
|---|---|
| `@consona/avatar` | App entry: `<Avatar>`, hooks, `AvatarMessageBubble`, define / register helpers, catalog, `avatarHandleFromRuntime`, Consona (installed on import). Default export `consonaEngine`. |
| `@consona/avatar/core` | Renderer-free core: types (`AvatarHandle`, `AvatarEvent`, `ChannelSpec`, `PluginContent`, …), state machine, resolver, catalog, plugin contract. For libraries / non-React code. |
| `@consona/avatar/preset`, `/math`, `/color`, `/animation`, `/renderers` | Low-level pieces (preset layer, springs / easing, OKLab colour, behaviors / timelines, renderer registry). |
| `@consona/avatar/adapters/svg`, `/adapters/canvas2d` | SVG / canvas renderers (registered by the root entry). |
| `@consona/avatar/react` | React surface without Consona side effects (`Avatar`, `useAvatarHandle`, `AvatarInspector`, `registerAvatarReactRenderer`, …). |
| `@consona/avatar/three` | `createAvatarStage`, `AvatarStage`, `ThreeAvatarController`, `registerAtomDrawer`, rig / fur / lighting. |
| `@consona/avatar/three/react` | `<ThreeCanvas>` (`onReady(stage)`), `<StageAvatar>`. |
| `@consona/avatar/avatars/consona`, `/install`, `/react` | Consona SDK (`consonaEngine`, `createConsonaAvatarHandle`, config / palettes); data install; `ConsonaAvatar`, `useConsonaAvatar`, `ConsonaAvatarProvider`. |
| `@consona/avatar/avatars/allie`, `/install`, `/three` | Allie data + helpers (`defineAllieAvatar`, shapes, accessories); data-only install (lazy Three); eager Three package (for stages). |
| `@consona/avatar/avatars/<family>`, `/install`, `/three` | The same three-entry split every family package follows: data helpers, data-only install, optional eager Three package. |
| `@consona/avatar/plugins/wellbeing` | `wellbeing`, check-in levels, breathing patterns, lines. Renderer-free. |
| `@consona/avatar/plugins/wellbeing/three` | The plugin's Three drawers; import before `use()` on a Three avatar. |

### Handle methods (`AvatarHandle`)

| Task | Members |
|---|---|
| Behaviors | `play(name, { then, params, preset, interrupt, end, blend, offset })`, `enqueue(...names)`, `resolve(outcome?)`, `idle()`, `behaviorSpec(name)` |
| Channels / presets | `set(channel, value \| null, { immediate })`, `apply(preset)` |
| Events | `emit({ type: 'effect', kind, count?, anchor?, offset?, scale?, colors?, seed? })`, `emit({ type: 'message', text \| null, anchor?, duration? })` |
| Atoms | `attach(atom, anchor?)`, `detach(atom)` |
| Plugins | `use(plugin)` → typed API, `plugins` |
| Body | `pose(target, { duration, ease, end })`, `blink()`, `setGazeTarget(target \| null)` |
| Timelines | `playTimeline(timeline)` → player (`seek`, `stop`, `finished`), `stopTimeline()` |
| Observe | `subscribe(listener)` → unsubscribe, `state`, `message`, `anchorOnScreen(anchor, out)` |
| Lists | `behaviors`, `channels`, `presets`, `atoms`, `attached`, `id`, `renderer` |
| Export | `snapshot?(options)` (Three) |

`useAvatarHandle()` adds `ref`, `state` (React state), `handle()`, `canSnapshot()`; `use()` and
`snapshot()` work after mount.

### Events (`AvatarEvent`)

| `type` | Fields | When |
|---|---|---|
| `start` | `behavior` | a behavior begins |
| `end` | `behavior`, `interrupted` | it finished or was replaced |
| `resolve` | `behavior`, `outcome` | a waiting behavior got its outcome |
| `cue` | `behavior`, `cue`, `data?` | a timed moment inside a behavior |
| `message` | `text` | the speech message changed |
| `preset` | `preset` | `apply` changed the preset |
| `channel` | `channel`, `value` | `set` changed a channel target |
| `plugin` | `plugin` | `use` attached a plugin |

## Appendix: how snippets are checked

Each `ts` / `tsx` block is extracted to its own module and compiled with `tsc` against the package
sources, with paths mapped from the `package.json` exports; the scratch files are then deleted.
Snippets that contain a `<family>` placeholder illustrate the opt-in pattern for optional family
packages; substitute the family your app ships.
