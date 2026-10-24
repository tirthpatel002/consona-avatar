# `@consona/avatar`

Deterministic parametric avatar engine with a Consona product plugin, real-time gaze, and modular atoms.

Consuming-app guide (entry points, handle API, plugins, recipes): [docs/USAGE.md](docs/USAGE.md).

## Optional, self-contained avatar families

The engine core, renderers, plugins and React surface are **family-agnostic**. Each avatar
family lives in its own self-contained package under `src/avatars/<family>/`, published
through a data-only `install.ts` entry (`@consona/avatar/avatars/<family>/install`) and,
where it ships one, a Three renderer package (`…/<family>/three`). A consumer app never
hardcodes a family: it imports the `install` entries of whatever family packages it ships.
Families currently in the repo: `consona` (2D face avatar family, SVG scene graph, shipped
by the root entry) and `allie` (3D body-avatar family, Three.js). Removing a family folder
never breaks the package — plugins never import family code (family choreography is declared
via the plugin's `bindings` map and family limb data is data-only), and a family declares the
plugins it supports with `plugins: ['wellbeing']` in its catalog.

## Install / use (current API)

One React component renders every family; the renderer comes from the
registered family (`svg` → Consona scene graph, `three` → WebGL rig). The Three
renderer and each family's Three package load lazily, so SVG-only apps never
bundle or fetch `three`.

```tsx
import { Avatar, useAvatarHandle, ConsonaAvatarProvider } from '@consona/avatar';
import '@consona/avatar/avatars/allie/install'; // data-only: families, presets, behaviors (no three)

function Demo() {
  const allie = useAvatarHandle(); // React state over the unified AvatarHandle
  return (
    <ConsonaAvatarProvider>
      <Avatar family="consona" config={{ seed: 'demo', paletteId: 'light' }} size={96} onClick={(a) => a.play('jump')} />
      <Avatar ref={allie.ref} preset="yellow" composition={{ eyes: 'star' }} size={{ width: 480, height: 360 }} zoom={1.3} />
      <button onClick={() => allie.play('jump', { then: ['spin', 'wave'] })}>Go</button>
      <button onClick={() => allie.apply('sleepy')}>Sleepy</button>
      <span>{allie.state?.behavior}</span>
    </ConsonaAvatarProvider>
  );
}
```

`<Avatar>` props: `family`, `preset`, `composition` (atom picks), `definition`
(Three families; full, or overrides merged onto `preset`), `config` (Consona),
`size` (px or `{ width, height }`; Three fills its parent when omitted), `zoom`,
`interactive`, `background`, `id`, `onEvent`, `onClick(handle)`,
`className` / `style`. The ref is ONE `AvatarHandle` for every renderer:
`play`, `enqueue`, `resolve`, `set` (channels), `apply` (presets), `emit`
(events), `attach` / `detach` (atoms), `use` (plugins), `pose`, `idle`,
`blink`, `setGazeTarget`, `playTimeline` / `stopTimeline`, `state`,
`subscribe`, and the live lists `behaviors`, `channels`, `presets`, `atoms`,
`plugins`. A new
`definition` / `config` morphs the same avatar in place (never a remount); the
3D camera frames once and keeps the user's zoom / orbit; off-screen or
hidden-tab canvases pause.

Engine (no React):

```ts
const instance = consonaEngine.create({ seed: 'demo', paletteId: 'light' });
const handle = createConsonaAvatarHandle(consonaEngine, instance.id);   // same AvatarHandle as <Avatar>'s ref
handle.apply('curious'); handle.play('nod');
const svg = consonaEngine.renderToSvg(createDefaultAvatarConfig('demo', 'light'));
```

## 3D avatars (Three.js)

Optional peer: `three >= 0.160`. Core/Consona entry points never import `three`.

- `@consona/avatar/core` — `defineAvatar`, state machine, registries (`registerAvatarShape`, `registerEyePose`, `registerEyeShape`, `registerBehavior`, `registerPreset`), pose/easing helpers. `@consona/avatar/preset` — the preset layer on its own.
- `@consona/avatar/three` — non-React scenes: `AvatarStage` (several avatars in one scene, `stage.add(def)` → controller), `assembleRig`, fur, relief eyes, `registerAccessory`, GLB + `AnimationMixer` binding. Use it for multi-avatar scenes; `<Avatar>` covers the single-avatar case.
- `@consona/avatar/avatars/allie/install` (data, registers families + presets; `install: () => import('./three')` loads the Three surfaces on first render), `@consona/avatar/avatars/allie` (data helpers: `defineAllieAvatar`, shapes, behaviors), `@consona/avatar/avatars/allie/three` (eager Three package for `AvatarStage` users). Every Three family ships the same three entries under `@consona/avatar/avatars/<family>/`.

```tsx
const robo = defineAllieAvatar({ id: 'robo', body: { shape: allieShapes.dome, color: '#8fdc1e' }, preset: 'sparkle', accessories: [allieHand({ side: 'right' })] });
<Avatar definition={robo} size={320} onClick={(a) => a.play('jump', { then: 'happy' })} />
```

Allie behaviors: `idle wave jump spin think sleep happy`; eye poses: `neutral happy look wink
sparkle sleepy surprised`. **Catalog + controls (studio discovery):**
`registerAvatarFamily`, `registerAvatarPreset`, `useAvatarCatalog()`; `getAvatarControls(def)` / `applyAvatarOverrides(base, overrides)` derive a generic control schema from a definition, `registerAvatarControl` adds new fields (guard with `when`); `listAvatarBehaviors/Presets(def)` merge registries + definition. **Studio:** `registerAvatarStudio(manifest)` declares what a family's studio shows (sections, atoms, control groups, presets, panels, stage size, `previews: 'live' | 'none'`); the app renders every manifest with one `AvatarStudio`.

New characters: create `src/avatars/<name>/` (pure data) with an `install.ts` that registers its family (with `renderer` and a lazy `install` loader), presets, behaviors and studio manifest, plus `src/avatars/<name>/three/index.ts` for the renderer side (surfaces, rig, accessories). The studio auto-imports every `src/avatars/*/install.ts` and renders each stage with `<Avatar>`, so new families appear with no studio changes — and the package builds and runs without any of them.

### Atoms & variants (compose an avatar)

An avatar can be composed from **atoms**, each with registered **variants**
(`registerAvatarAtom`, `registerAvatarAtomVariant`, `composeAvatar` in `@consona/avatar/core`).
Variants are applied in atom order onto a draft definition, then `overrides` are applied.

An avatar is `{ body, eyes, preset }`. Colour lives on the body; the eyes and
their outline derive from it. There is no face panel. Allie ships three atoms
(`src/avatars/allie/allie.atoms.ts`):

- **body** — silhouette, colour, yarn surface (`fur.pattern`: knit / rib / cable /
  boucle / popcorn), accessories, and an `anchor` (`{ y, width, height }`) saying
  where the eyes sit. 5 Classics + 10 Threadies (capsule-sprout, boucle-cube,
  ring-donut, snowman, beanie, scallop-flower, nub-dome, horned-fluff, loop-box,
  cable-arch, heart).
- **eyes** — one 3D eye system, shapes `pill | sphere | star | heart | cube`
  (`eyes: { shape, size, spacing, height, depth, lid, color, outline, outlineWidth, tint }`).
  Each eye is the outward half of a soft rounded shape (2D SDF + rounded bevel),
  a raised relief whose base follows the body's curvature, with a thick outline
  rim (`outline: 'auto'` = a darker shade of the body colour). The fur is
  cleared under the exact eye footprint with a tight soft margin, and the relief
  never sits lower than the fur, so the eyes are never hidden.
- **preset** — neutral, look, happy, joyful, content, curious, calm, sleepy,
  surprised, excited, sparkle, wink, playful, determined, sad, angry, love.
  Presets only re-shape the eye (squash, rotation, lid squash, arc bend) and
  every preset works on every shape. Blink squashes the eye shut.

The eyes are fixed to the body: they ride its jelly wobble and shape morphs,
and gaze turns, tilts and leans the whole body (`gaze: { bodyYaw, bodyPitch,
bodyRoll, lead, ... }`). It never moves the eyes.

```ts
composeAvatar({ id: 'mine', atoms: { body: 'heart', eyes: 'sphere', preset: 'love' }, overrides: { 'body.color': '#7c3aed' } });
```

Adding a variant: push a spec to `allieCharacterSpecs` / `allieEyesSpecs` (or
call `registerAvatarAtomVariant` from any package). Register new eye shapes
with `registerEyeShape(name, { sdf, bevel })` and new presets with
`registerEyePose`. Register new body geometries and surface patterns with
`registerBodyGeometry` and `registerSurfacePattern` in the Three adapter. The
studio composer (Body / Eyes / Preset) and the parameter controls pick them up
automatically.

### Presets: periodic config modulation

A preset is a periodic, seamless modulation of any config param path (avatar or
atom params), never a mutation of the saved config:

```ts
registerPreset('consona', 'nervous', {
  targets: { 'eyes.pose': 'look', 'blink.rate': 1.6 },     // held values; blink is a param
  cycles: {
    'pose.sway': { wave: 'sine', period: 0.8, amp: 0.04 },   // sine | triangle | noise | keyframes
    'gaze.x': { wave: 'noise', period: 2, amp: 0.3, variation: 0.4 }, // seeded per avatar
  },
  behaviors: [{ behavior: 'wink', every: [4, 9] }],             // periodic behaviors (seeded)
  enter: { duration: 0.3 },
});
handle.apply('nervous');                                      // same call on every family
```

Shared ids (`SHARED_PRESET_IDS`: neutral happy sad curious sleepy thinking
surprised love …) exist on every family; families add extras (Consona: calm,
breathing, listening, playful, excited, scanning, dizzy, nervous, napping …).
An unknown id is ignored (dev warning). Three params that would need a
rebuild are refused; per-frame updates allocate nothing. Timeline `{ preset }`
steps work on all families. `listPresets(family)` / `getPreset` / `hasPreset`.

### Animation: seamless behaviors + timelines

Behaviors never snap back to rest. Each behavior writes to `ctx.pose`
(`y`, `scale`, `body`/`bodyQuaternion`, `head`, `hand`); `mode: 'relative'`
(default) layers it on the live pose, `mode: 'absolute'` reaches a pose from
it. On start the live pose (incl. mid-behavior motion + velocity) is captured
and relaxes along a critically damped spring while the new behavior blends in
(0.15 s). Endings: `end: 'rest'` (default, eases back over 0.35 s) or
`'hold'` (keeps the final pose until the next behavior); queued behaviors and
timeline steps hand off directly. `machine.pose(target, { duration })` is the
built-in absolute pose. Consona clips crossfade the same way (restart = no
rewind; clip end eases out). Define behaviors with `defineBehavior` and register
them with `registerBehavior(behavior, family?)`.

```ts
handle.playTimeline(defineTimeline([
  { behavior: 'jump' }, { preset: 'love' }, { behavior: 'spin', params: { turns: 2 } },
  { pose: { body: [0, 0.3, 0.1] }, duration: 0.5 }, { gaze: { x: 0.6, y: 0.2 } }, { wait: 0.8 },
  { behavior: 'wave' },
], { blink: { seed: 7 } }));          // deterministic; player.seek(t) replays exactly
// same call on an SVG (Consona) avatar's handle
```

### Atoms, reach and waiting behaviors

Atoms (a cup, a hat, a book…) are definitions (`defineAtom` /
`registerAtom(def, family?)`, or per avatar from a plugin) attached to abstract
anchors (`hand`, `head`, `mouth`, `chest`, `base`). Behaviors show them through
the pose layer, channels at their weight, the app with `handle.attach(id,
anchor?)` / `detach(id)`; never by editing the config. `reach` asks the rig to
bring the hand toward an anchor:

```ts
defineBehavior({
  name: 'offer', duration: Infinity, outcomes: { confirm: 'offer.yes', dismiss: 'offer.no' },
  update({ pose, t }) {
    pose.atom('cup', Math.min(1, t / 0.3)).at('hand');    // .offset() .rotate() .size()
    pose.reach('mouth', Math.min(1, t));                 // weight, approach (0 hold point .. 1 at it)
    // pose.reach('head', w, 1).side('left').offset(-0.8, -0.2, 0.4)  → that side's hand, shifted (e.g. a wave)
  },
});
handle.play('offer');              // raises the cup and waits (state.outcomes = ['confirm', 'dismiss'])
handle.resolve('confirm');         // → 'offer.yes' from the live pose (queue kept); default = first outcome
```

An atom nobody writes fades out over its `transition`; hand-offs between
behaviors that write the same atom are seamless. **Waiting behaviors** declare
`outcomes` (outcome → follow-up behavior, usually `hidden: true` so pickers skip
it) and run until `resolve(outcome)` (handle / machine; emits a `resolve`
event) or any other behavior interrupts them. The studio shows "Resolve: …"
buttons for whatever the current behavior waits for. Timelines need finite
behaviors: script the follow-ups directly there.

Three: one drawer per atom kind (`registerAtomDrawer({ kind, build?, draw? })`;
the rig's composition, `RigProfile.atoms`, lists the structural kinds). The
`atoms` drawer builds an anchored atom's visual once on first use, hidden atoms cost nothing, visible
ones follow their anchor with one matrix compose per frame. Families map
anchors with `registerAnchors(family, provider)` (generic fallback:
body-surface points, hand pivot, first limb tip); limb-bearing families answer
`reach` with a target pull on the family's `reach.limb` (or the limb of the
requested side, `reach.sides`); the weight blends the limb from its rest pose
to the reach arc, then back to physics. The limb data itself lives in the
family package — core and the Three adapter never reference a specific family.

With a layout `collision: { margin }` the limb chains also stay outside
the live body surface (+ margin + tube radius; sampled once per body change
from the rig's `surfaceRadial`, follows scale / squash), sliding over it;
reach arcs bulge away from the body (furry families size the margin from their
fur length).

An atom with `surface: 'avatar'` wears the avatar's own surface: the visual
names the mesh (`AtomDrawing.surface`) and the part dresses it with the same
shell fur as the body (`createShellFur(geo, def, { pile, maxShells, fade })`:
short pile, few shells, body colour / plush look, dithered fade so it stays
opaque and depth-sorted).

### Messages (speech bubble)

Any avatar can "say" something: a speech bubble pointing at an anchor
(`head` by default). Core holds the state; renderers only draw it.

```ts
handle.emit({ type: 'message', text: 'Hi! How are you feeling today?' });            // until cleared
handle.emit({ type: 'message', text: 'Saved', duration: 2, anchor: 'mouth' });   // auto-dismiss
handle.emit({ type: 'message', text: null });
// inside a behavior (per frame, like atoms): gone when the behavior stops writing it
update({ pose, t }) { pose.message('Time for a break', Math.min(1, t / 0.3)); }
```

An emitted message wins over behavior messages. A message fades in / out (0.2 s; a new
text fades the old one out first). `state.message` (`{ text, anchor }` or
null) and the `message` event report the text on screen; `handle.message`
is the live view (`shown` 0..1) and `handle.anchorOnScreen(anchor, out)`
the anchor in the avatar's viewport (normalized), for overlays.

`<AvatarMessageBubble handle={…} />` (`./react`) is the DOM overlay: crisp,
accessible (`role="status"`) text, tail toward the avatar, follows it and
stays inside its box, React renders only on text changes (position / fade
are written per animation frame while a message exists). Three avatars
(`<Avatar>` with a `three` family) include it; for SVG (Consona) put it next
to the avatar in a positioned box. Theme with CSS variables
`--avatar-bubble-bg`, `-fg`, `-font`, `-radius`, `-padding`, `-shadow`,
`-max-width`. Behaviors pick lines from a `LinePool` (one per run, rotating
between runs; `params.message` overrides, `false` hides).

### Channels, presets, events

- **Channels** (`core/channel`): persistent eased values in fixed slots. `valence` / `energy` (−1..1) on
  every avatar, plus family / plugin channels. `level` (eased value) or `rhythm` (measured rate, integrated
  phase, envelope). A channel may carry an expression at its weight (relative pose, sway, eye / mouth when
  the behavior shows none, limb tone, gaze / blink scale, atoms). Layers: preset < `set()` < the running
  behavior's `channels`. Three: valence tints the body (OKLab, lightness kept) + rim glow.
- **Presets** (`core/preset`): `apply(id)` = channel values + periodic param modulation (above).
- **Events** (`core/event`): `emit({ type: 'effect', kind: 'sparkles' | 'ripple', anchor })` (bounded queue,
  Three `effects` drawer: one instanced mesh, pooled ripple ring, idle when none) and
  `emit({ type: 'message', … })`. Behaviors also emit `cue` events (`BehaviorDefinition.cues`, timed, optional
  effect); `subscribe` gets `start` / `end` / `cue` / `resolve` / `message` / `plugin`.
- **Limbs**: `pose.limb(index, anchor, weight, approach).offset(…)` + `pose.limbTone(calm, slack)`; a
  family's limb drawer pulls any number of chains (preallocated arcs) and applies tone.

### Plugins (per avatar)

Domain content ships as plugins, attached per avatar; core, adapters and
families know none of it (`tests/guard.test.ts`). A family declares the
plugins it supports (`registerAvatarFamily({ plugins: ['wellbeing'] })`);
`use(plugin)` installs the plugin's channels, presets, atoms, behaviors and
composition kinds on THAT avatar only and returns a typed API.

```ts
import { wellbeing } from '@consona/avatar/plugins/wellbeing';
import '@consona/avatar/plugins/wellbeing/three';          // its Three drawers

const care = avatar.use(wellbeing);   // throws when the family doesn't declare it
care.play('hug', { params: { mode: 'wrap' } });   // typed ids: play('hug') on the bare handle is a type error
care.set('heartbeat', 72);           // plugin channel (rhythm, bpm)
care.apply('tired');
care.checkIn('low');                 // the plugin's own helpers (valence)
avatar.subscribe((e) => e.type === 'cue' && e.behavior === 'grounding' && show(e.data?.label));
```

`definePlugin({ id, behaviors, channels, presets, content, bindings, studio, api })`:
`content()` is generic, `bindings[familyId]()` adds family choreography (binding wins by
id); the promised ids are verified at `use()`. `src/plugins/wellbeing` holds all wellbeing
content: check-in, heartbeat, listening / tired / unwell / blanket / thermometer channels,
breathing presets, hug / celebrate / nudge / grounding, reminders (pill, water, bedtime)
and routines, their atoms and lines, per-family bindings (family-specific choreography,
e.g. how a held atom is carried) and `three/` (atom drawers, the `heartbeat-glow`
composition kind).

Studio: every family shows four tabs. **Characters / Atoms** (character, composition, atoms at
anchors), **Parameters** (channels, presets, tunable params), **Behaviors** (play with params) and
**Events** (messages, effects, cues, state log). Plugin items appear in them with a plugin badge,
driven by `plugin.studio` descriptors.

**Writing your own plugin:** start from `src/plugins/vibe` — the commented reference plugin
(one channel `focus`, one preset `focused`, one behavior `cheer` with cues + an effect, a
`studio` section and a typed `api`). Allie declares it with `plugins: ['vibe']`, and
`tests/plugins/vibe.test.ts` shows how to test one without a renderer. For the full-scale
version (rhythm channels, sequenced behaviors, atoms + Three drawers, per-family bindings)
see `src/plugins/wellbeing`.

## Architecture

Primitives: **Atom** (structure) + **Channel** / **Behavior** / **Event** (dynamics); one resolver runs
each frame in a fixed order, allocation-free (`tests/resolver.alloc.test.ts`).

- `src/core/` — renderer / family / domain agnostic: atom, composition, channel, preset, behavior, event
  (`LinePool`), resolver, family (catalog) and plugin contracts
- `src/adapters/` — renderers; Three: one drawer per atom kind
- `src/plugins/wellbeing/` — the wellbeing plugin (+ per-family `bindings/`, `three/`)
- `src/avatars/consona/` — Consona family package (SVG, atoms, layout mapping, palettes, SDK), shipped by the root entry
- `src/core/preset/` — preset layer; `src/adapters/three/` — generic 3D avatar engine; `src/avatars/<family>/` — optional, self-contained family packages (data-only `install.ts` + optional `three/` renderer package, e.g. `src/avatars/allie/`)

### Families, install entries and renderers

Every family has a data-only `install.ts` (catalog, presets, studio manifest) that also registers how it renders:

- `@consona/avatar/avatars/consona/install`: Consona (SVG scene graph). Its `<Avatar>` renderer is registered lazily. The package root (`@consona/avatar`) imports this entry and the eager Consona React surface (`avatars/consona/react`: `ConsonaAvatar`, `useConsonaAvatar`, `ConsonaAvatarProvider`), so Consona works out of the box.
- `@consona/avatar/avatars/allie/install`: its Three.js package loads lazily on first render through the generic `'three'` renderer. Other Three family packages follow the same pattern — a consumer opts in by importing the family's `install` entry.

`<Avatar>` contains no family-specific code. It looks up `registerAvatarReactRenderer(familyOrRendererKind, { component | load, config? })` (from `@consona/avatar/react`). A config-driven family types its `config` prop by augmenting `AvatarFamilyConfigs`.

Scene-graph renderers live in `src/adapters/svg` (`retained-svg`, `svg-string`) and `src/adapters/canvas2d` (`canvas-2d`). Importing an adapter registers its factory; core only holds `IRenderer` and the registry.

## Tests

```bash
npm test
npm run type-check
```

Lossless baseline: `tests/goldens/` (set `UPDATE_GOLDENS=1` only when deliberately refreshing fixtures).
