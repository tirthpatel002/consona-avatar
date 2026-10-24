---
name: consona-avatar
description: >
  Build, render, control and extend avatars with @consona/avatar — the complete
  agent-facing reference distilled from README.md and docs/USAGE.md. Use when
  creating any avatar (2D face or 3D body), writing behaviors / channels /
  presets / plugins / whole avatar families, controlling an avatar from an app
  (play, channels, gaze, messages, effects, timelines), or integrating the
  React components. Everything needed lives here; do not read the codebase.
---

# Consona Avatar — Agent Reference

## 1. Mental model (read first)

Four layers, strictly one-directional (a guard test enforces it):

```
src/core/       generic engine: state machine, channels, presets, behaviors,
                atoms, gaze, events. Knows NO family, NO plugin.
src/adapters/   renderers: svg (retained-svg / svg-string), canvas2d,
                three (generic 3D rig: fur, eyes, limbs, jelly, stage).
src/plugins/    opt-in domain content (vibe = reference example).
src/avatars/    OPTIONAL, self-contained families. A package without them
                builds and runs. Each family: data-only install.ts + optional
                three/ renderer package (loaded lazily on first render).
src/react/      <Avatar>, useAvatarHandle, AvatarMessageBubble.
```

Rules an agent must never break:
- core/adapters/react never import from `src/plugins` or family code.
- Families never import from `src/plugins` (they *declare* plugin support
  with a string: `plugins: ['wellbeing']` in their catalog entry).
- Families never import other families.

## 2. Install & entry points

```bash
npm i @consona/avatar three   # three only if you render 3D
```

| Import | What it gives |
|---|---|
| `@consona/avatar` | everything for Consona (2D) + React surface |
| `@consona/avatar/core` | engine, state machine, registries, helpers |
| `@consona/avatar/preset` / `./math` / `./color` / `./animation` | subsystems |
| `@consona/avatar/avatars/consona/install` | 2D family (auto via root) |
| `@consona/avatar/avatars/allie/install` | 3D family (data-only, no three import) |
| `@consona/avatar/three` | generic Three renderer registration |
| `@consona/avatar/three/react` | Three `<Avatar>` renderer |
| `@consona/avatar/plugins/vibe` | the commented reference plugin |

Node/browser: `main`/`exports` resolve to built `dist/*.js` with `.d.ts`.
Build with `npm run build`.

## 3. Render an avatar

### React (recommended)

```tsx
import { Avatar, useAvatarHandle } from '@consona/avatar';
import '@consona/avatar/avatars/allie/install';      // 3D family (lazy three)
import '@consona/avatar/three';                      // register renderer

// 3D body avatar by catalog preset
<Avatar preset="allie-classic-sunny" size={320}
        onClick={(h) => h.play('wave')} />

// with a handle: full control
function Stage() {
  const ref = useAvatarHandle((h) => {
    h.play('jump'); h.set('valence', 0.6); h.apply('happy');
  });
  return <Avatar ref={ref} preset="allie-classic-sunny" size={320} />;
}
```

`AvatarProps`: `family?` (renderer pick), `preset?` (implies family),
`composition?` (`{ eyes: 'button' }` atom picks), `definition?` (Three: full
definition or partial overrides), `config?` (Consona config), `size?`
(px or `{width,height}`), `zoom?`, `interactive?`, `background?`.

### Vanilla (no React)

```ts
import { AvatarEngine } from '@consona/avatar';
import '@consona/avatar/avatars/consona/install';
const engine = new AvatarEngine();
engine.registerDescriptor(definition);          // resolved or raw definition
const inst = engine.createInstance('id1', 'consona');
engine.tick(1 / 60);                            // drive manually, or use a Stage
```

Static SVG (server / export): `renderAvatarToSvg(config)` → svg string.
Headless Three: `AvatarStage` (IntersectionObserver + visibility aware,
pixelRatio capped at 2, shaders warmed with `compileAsync`).

## 4. Control an avatar (AvatarHandle)

```ts
const h: AvatarHandle;                       // from useAvatarHandle / instance
h.play('wave', { params: { axis: 'x' } });   // one-shot / looping behavior
h.enqueue('jump', 'spin');                   // queue; interrupts allowed
h.resolve('done');                           // hand off a waiting behavior
h.idle(); h.blink();
h.apply('happy');                            // named preset (channel levels)
h.set('valence', 0.8);                       // core channel, eases by settle
h.set('energy', -1, { immediate: true });
h.setGazeTarget({ x: 0.5, y: -0.2 });        // normalized screen point or null
h.pose({ body: [0.1, 0, 0], y: -0.02 });     // absolute pose from live pose
h.attach('pill', 'hand'); h.detach('pill');  // show/hide atoms at anchors
h.emit({ type: 'message', text: 'Hi!', duration: 4 });
h.emit({ kind: 'sparkles', count: 14, anchor: 'head' });  // effect
h.anchorOnScreen('head', out);               // → {x,y} viewport, y down
h.playTimeline(timeline); h.stopTimeline();
h.snapshot?.({ format: 'png' });             // renderer that can capture
h.subscribe((e) => { ... });                 // event stream (below)
h.state; h.behaviors; h.channels; h.presets; h.atoms; h.plugins; h.attached;
```

**Events** (`type`): `start` / `end {interrupted}` / `resolve {outcome}` /
`message {text|null}` / `preset` / `cue {behavior, cue, data}` /
`channel {channel, value}` / `plugin {plugin}`.

**Core channels** (every avatar): `valence` (−1..1, tints colour + glow,
settle 4s) and `energy` (−1..1, arousal, settle 2s). Families/plugins add
more; discover with `h.channels`.

## 5. Channels (continuous states)

A channel = named level/rhythm + a look expression blended by live weight.
Author one with `ChannelSpec`:

```ts
{ id: 'focus', label: 'Focus', settle: 1,        // s to ~99% of a target
  pose: { y: -0.01, body: [0.14, 0, 0], head: [0, 0, -0.03], scale: [1, 1.01, 1] },
  sway: { period: 11, pitch: 0.008, roll: 0.006 },
  eyes: { pose: 'determined', weight: 0.5 },     // relative eye overlay
  mouth: 'smile',                                // when no behavior shows one
  limbs: { calm: 1, slack: 0 },                  // 1 = still / limp
  gaze: 0.25, blinkRate: 0.5,                    // participation multipliers
  atoms: [{ id: 'halo', weight: 1 }],            // shown at channel weight
  params: { 'plush.clumping': 0.6 },             // config params at weight
  tint: { color: '#87a9ff', amount: 0.25, saturation: 1, lift: 0 } }
```

Rhythm channels (heartbeat-style): `kind: 'rhythm'`, `envelope(phase)`
0..1 wave, rate in bpm. Register standalone:
`registerChannel(spec, family?)` from `@consona/avatar/core`.

Built-in eye poses: `neutral look happy joyful content curious calm sleepy
surprised excited sparkle wink playful determined love` (register more with
`registerEyePose(name, {left?, right?})`; fields: upper, lower, sx, sy,
scale, rot, tilt, arc).

## 6. Behaviors (motions)

```ts
import { defineBehavior } from '@consona/avatar/core';

const cheer = defineBehavior({
  name: 'cheer',
  duration: 1.8,               // seconds; Infinity = loop; 'clip' = mixer ends it
  preset: null,                // eye preset while playing (null = keep)
  gaze: 0.2,                   // how much pointer gaze still turns the body
  ownsGaze: false,             // true = suspend pointer-follow entirely
  blendIn: 0.1,                // s to blend in from live pose
  end: 'rest',                 // 'rest' | 'hold'
  mode: 'relative',            // 'relative' = offsets on live pose | 'absolute'
  params: {                    // studio/UI hints
    duration: { kind: 'number', default: 1.8, min: 1, max: 4, step: 0.1 },
    style:   { kind: 'select', default: 'big', options: ['big', 'small'] },
    note:    { kind: 'text', default: '' },
    // kind: 'vector3' also exists
  },
  cues: ({ duration }) => [    // timed events; effect is queued for the renderer
    { at: 0.35, name: 'hop' },
    { at: 0.4, name: 'sparkle', effect: { kind: 'sparkles', count: 12, anchor: 'head' } },
  ],
  channels: { valence: 0.5 },  // channel targets held while running
  outcomes: { done: 'cheer-followup' },   // waiting behavior → resolve('done')
  enter(ctx) {}, update(ctx) { /* every frame */ }, exit(ctx) {},
});
registerBehavior(cheer);       // or ship it through a plugin (§8)
```

`ctx` = `{ rig, pose, face, t, dt, params, duration }`. The **pose writer**
(`ctx.pose`, relative offsets, reset each frame — every call overwrites):

| Call | Effect |
|---|---|
| `pose.y(v)` | root height offset (body units) |
| `pose.scale(x, y, z)` | body scale (squash / stretch) |
| `pose.body(x, y, z)` / `pose.head(x, y, z)` | XYZ Euler radians |
| `pose.hand(z)` | hand Z rotation offset |
| `pose.eyePose(name, weight, mirror?)` | relative eye overlay |
| `pose.mouth(shape)` | mouth shape this frame |
| `pose.message(text, weight, anchor?)` | line on the bubble |
| `pose.atom(id, weight).at(anchor).offset(x,y,z).rotate(x,y,z).size(s)` | show atom |
| `pose.reach(anchor, weight, approach).side('left').offset(...)` | hand toward anchor |
| `pose.limb(index, anchor, weight, approach).offset(...)` | multi-limb rigs |
| `pose.limbTone(calm, slack)` | stillness / limpness |

Not writing a channel fades it out. Sequenced behaviors (steps + beats +
cues): `defineSequenceBehavior({ name, steps: [{id, duration, beats, data}],
update(ctx, seq) })` emits `step` / `beat` / `complete` cues.

Register per family: `registerBehavior(def, family?)`.

## 7. Presets

Two kinds:
- **Channel presets** (`{ label, channels: { focus: 1 } }`): named levels,
  applied with `h.apply('focused')`.
- **Avatar presets**: family catalog entries (composition + config). Families
  register with `registerAvatarPreset({ family, composition, tags })`.

Core shared presets: `neutral happy sad curious sleepy surprised love
thinking` (eye poses); Consona adds its own; plugins can add channel presets.

## 8. Plugins (package domain features)

Copy the pattern from `src/plugins/vibe` (the commented reference):

```ts
import { definePlugin } from '@consona/avatar/core';

export const vibe = definePlugin({
  id: 'vibe',                        // badge + family-declaration key
  behaviors: ['cheer'],              // ids guaranteed at use() (verified!)
  channels: ['focus'],
  presets: ['focused'],
  content: () => ({                  // installed per avatar on use()
    channels: [focusChannel],
    presets: { focused: { label: 'Focused', channels: { focus: 1 } } },
    behaviors: [cheerBehavior],
    atoms: [atomDefinition],         // optional (needs a three drawer if 3D)
    composition: ['heartbeat-glow'], // optional composition kind
    lines: { hug: ['line', ...] },   // optional message pools
  }),
  bindings: { muneo: muneoWellbeing },   // optional per-family overrides (win by id)
  studio: { channels: ['focus'], presets: ['focused'], behaviors: ['cheer'],
            marks: { focus: [{ label: 'Locked in', value: 1 }] },
            events: [{ id: 'sparkles', label: 'Sparkles',
                       event: { kind: 'sparkles', count: 14, anchor: 'head' } }] },
  api: (wb) => ({                    // typed helpers on the returned handle
    focus: (on) => wb.set('focus', on ? 1 : 0),
    cheer: (msg) => wb.play('cheer', msg ? { params: { message: msg } } : undefined),
  }),
});
```

```ts
const v = avatar.use(vibe);   // throws if the family didn't declare 'vibe'
v.set('focus', 1); v.play('cheer'); v.apply('focused'); v.focus(true);
```

3D visuals for plugin atoms live in a sibling `three/` package the host
loads next to the renderer (`import '@consona/avatar/plugins/x/three'`).

## 9. Create a whole avatar family

Families are self-contained under `src/avatars/<name>/`. Minimal set:

| File | Purpose |
|---|---|
| `family.ts` | `export const X_FAMILY = 'x'` (+ variants array) |
| `<name>.atoms.ts` | atom definitions + `registerAvatarAtom({id, family, ...})` |
| `<name>.defaults.ts` | eyes/jelly/mouth tuning via `registerAvatarFamilyDefaults`, `registerMouthDefaults`, … |
| `<name>.channels.ts` | family valence palette: `configureValencePalette(family, {...})` |
| `<name>.behaviors.ts` | behavior overrides, `registerBehavior(a, family)` |
| `<name>.randomizer.ts` | `registerAvatarRandomizer(family, spec)` (studio randomize rules) |
| `<name>.studio.ts` | studio manifest (sections, tabs) |
| `<name>.catalog.ts` | `registerAvatarFamily({ id, name, renderer: 'three', plugins: ['wellbeing'], install: () => import('./three/index.ts'), description })` + presets |
| `install.ts` | data-only: calls the catalog register (idempotent) |
| `index.ts` | re-exports |
| `three/index.ts` | lazily loaded renderer package: rig profile (`registerRigProfile(family, { atoms: composition, bodyCenterY, pivots })`), anchors (`registerAnchorResolver`), SDF body (`registerSdfBody(shapeId, fn)`), fur config (`configureFurShells`, `configurePlushDefaults`), tentacle config (`configureTentacles`) |

Family ids used here: anchors `hand hand.left hand.right head mouth chest
base` (extensible); atoms render through generic parts (`shellFur`,
`tentacles`, `reliefEyes`, `reliefMouth`, `reliefHairband`, `sdfBody`,
`effects`, `jelly`, `atoms`) — family tuning is injected, never hardcoded.

Publishing an app: ship only the families you import. The studio
auto-installs every `src/avatars/*/install.ts`; consumers import the
`install` entries explicitly.

## 10. React integration

- `<Avatar>` — one component, renderer from the registered family; see §3.
- `useAvatarHandle(cb?)` — stable handle for control (§4).
- `<AvatarMessageBubble handle={h} gap={10} />` — animated speech bubble;
  theme via CSS vars `--avatar-bubble-bg/-fg/-font/-radius/-padding/-shadow/-max-width`.
- `ConsonaAvatar` / `useConsonaAvatar` / `ConsonaAvatarProvider` — the 2D
  family's eager React SDK (`config={{ seed, paletteId }}`).
- Custom family UI types: augment `AvatarFamilyConfigs`.

## 11. Gaze & interaction

- Pointer gaze follows by default (Three: orbit + whole-body turn; SVG: eye
  tracking via `GazeController`).
- `h.setGazeTarget({x, y})` — normalized −1..1; `null` releases.
- `lookAt` (3D world point), `pointerFollow`, `gazeWeight` are definition/
  controller options. Idle blinking is automatic (`blinkInterval`).
- Waiting behaviors + `resolve(outcome)` give conversational hand-offs
  (e.g. hold a prop out → resolve when the user takes it).

## 12. Effects, atoms & accessories

- Effects: `h.emit({ kind: 'sparkles' | 'ripple' | ..., count, anchor,
  offset, scale, colors, seed })` — extensible string kind; renderers queue
  and draw (defaults: gold/white/blush palette).
- Atoms: shared registry + family-scoped registry (shadowing by id). Show
  via `h.attach(id, anchor)` / behavior `pose.atom(...)` / channel `atoms`.
- Accessories (3D): definition `accessories: [{ id, followBody?, ... }]`,
  tinted from the body colour automatically.

## 13. Testing & verification (do this before shipping)

```bash
npm run type-check   # tsc strict
npm test             # 171+ tests, node --test (tsx)
npm run build        # emits dist/ — then smoke:
node -e "import('./dist/index.js').then(m => console.log(Object.keys(m).length))"
```

- Tests run without a renderer: install plugin content into a bare
  `AvatarStateMachine` (`m.install('vibe', vibe.content('allie'))`), step
  with fixed dt, assert `m.channels.value(...)`, cue events, rig offsets —
  see `tests/plugins/vibe.test.ts` as the template.
- `tests/guard.test.ts` enforces the layering rules in §1 — run it after
  adding imports.

## 14. Publishing

`npm publish` packs `dist/` only (`files: ["dist"]`, public access,
version 0.1.0). Build first; the GitHub repo mirrors `main` (single-commit
history policy: squash to one commit before pushing).

## 15. Where to look in the repo (only if a detail is missing)

- Reference plugin (fully commented): `src/plugins/vibe/`
- Full-scale plugin: `src/plugins/wellbeing/`
- 3D family anatomy: `src/avatars/allie/`
- 2D family anatomy: `src/avatars/consona/`
- App integration guide: `docs/USAGE.md` · Architecture: `README.md`
