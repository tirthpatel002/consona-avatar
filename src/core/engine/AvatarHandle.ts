import type { AvatarRendererId, PresetName } from '../types/AvatarDefinition.ts';
import type { AvatarPoseOptions } from '../animation/pose.ts';
import type { AvatarPlayOptions, AvatarEvent, AvatarStateSnapshot } from '../animation/state-machine/AvatarStateMachine.ts';
import type { AvatarPoseTarget } from '../animation/pose.ts';
import type { AvatarTimeline, AvatarTimelinePlayer } from '../animation/timeline.ts';
import type { AvatarRuntimeHandle } from './AvatarRuntime.ts';
import type { AvatarMessageView } from '../event/message.ts';
import type { AvatarEventRequest } from '../event/event.ts';
import type { AvatarAnchorName } from '../atom/atom.ts';
import type { AvatarPlugin, PluginApi } from '../plugins/plugin.ts';
import type { ChannelSpec } from '../channel/channel.ts';
import type { BehaviorDefinition } from '../types/AvatarDefinition.ts';

/**
 * The ONE control surface of a live avatar, whatever renders it (SVG scene
 * graph or Three.js rig). `<Avatar ref>` exposes it; `useAvatarHandle()` wraps
 * it with React state.
 */
/** The ids a handle accepts (families / plugins narrow them; default: any string). */
export interface AvatarIds {
  behavior: string;
  channel: string;
  preset: string;
}

export interface AvatarHandle<I extends AvatarIds = AvatarIds> {
  readonly id: string;
  readonly renderer: AvatarRendererId;
  /** Behaviors to offer (family + attached plugins; hidden follow-ups excluded). */
  readonly behaviors: readonly string[];
  /** Definition of a behavior this avatar plays (family or plugin; e.g. its `params`). */
  behaviorSpec(behavior: string): BehaviorDefinition | undefined;
  /** Channels of this avatar (core + family + attached plugins, slot order); values live in `state.channels`. */
  readonly channels: readonly ChannelSpec[];
  /** Presets `apply()` accepts (family + attached plugins). */
  readonly presets: readonly string[];
  /** Atoms this avatar can show (family + attached plugins). */
  readonly atoms: readonly string[];
  /** Live behavior / preset snapshot. */
  readonly state: AvatarStateSnapshot;
  play(behavior: I['behavior'], options?: AvatarPlayOptions): boolean;
  enqueue(...behaviors: I['behavior'][]): boolean;
  /**
   * Resolve a waiting behavior (e.g. a reminder waiting for the user): starts the
   * follow-up mapped to `outcome` (default: the behavior's first outcome).
   * `state.outcomes` lists what the current behavior waits for.
   */
  resolve(outcome?: string): boolean;
  /** Live message for overlays (text, anchor, `shown` 0..1 — read per frame; null when none). */
  readonly message: AvatarMessageView | null;
  /**
   * Where an anchor is on screen, normalized to the avatar's viewport
   * (x 0 left .. 1 right, y 0 top .. 1 bottom). False when it can't be placed.
   * Overlays (e.g. `<AvatarMessageBubble>`) position DOM from it per frame.
   */
  anchorOnScreen(anchor: AvatarAnchorName, out: { x: number; y: number }): boolean;
  /** Blend to a pose (Three rigs; SVG avatars have no pose layer and ignore it). */
  pose(target: AvatarPoseTarget, options?: AvatarPoseOptions): void;
  apply(preset: I['preset'] & PresetName): void;
  idle(): void;
  /** One-shot blink. */
  blink(): void;
  /** Look toward a normalized direction (x right, y up); `null` clears. */
  setGazeTarget(target: { x: number; y: number } | null): void;
  /** Play a scripted timeline (seamless hand-offs, deterministic seek). */
  playTimeline(timeline: AvatarTimeline): AvatarTimelinePlayer | null;
  stopTimeline(): void;
  subscribe(listener: (event: AvatarEvent) => void): () => void;
  /** Set a channel (`valence` −1..1, `energy` −1..1, or a family / plugin channel); null clears it. False when the avatar has no such channel. */
  set(channel: I['channel'], value: number | null, options?: { immediate?: boolean }): boolean;
  /**
   * Emit an event: `{ type: 'effect', kind: 'sparkles' | 'ripple', anchor }`
   * (renderers without effects ignore it), or `{ type: 'message', text,
   * anchor?, duration? }`, a speech bubble that wins over behavior messages
   * (`text: null` clears it); `state.message` / the `message` event report it.
   */
  emit(event: AvatarEventRequest): void;
  /** Show `atom` at `anchor` (default: its own) until `detach`, on top of behaviors / channels. False for unknown atoms. */
  attach(atom: string, anchor?: AvatarAnchorName): boolean;
  detach(atom: string): void;
  /** Atoms shown by `attach` (anchor null = the atom's own). */
  readonly attached: readonly { readonly id: string; readonly anchor: AvatarAnchorName | null }[];
  /**
   * Attach a plugin to THIS avatar (the family must declare it): installs its
   * channels / presets / atoms / behaviors here only and returns its typed API
   * (`play` / `set` / `apply` over the plugin's ids, plus its own helpers).
   * Idempotent per avatar.
   */
  use<B extends string, C extends string, P extends string, Api>(plugin: AvatarPlugin<B, C, P, Api>): PluginApi<B, C, P, Api>;
  /** Plugins attached to this avatar. */
  readonly plugins: readonly string[];
  /**
   * Capture the frame currently on screen as an image (transparent background,
   * hi-res; see `AvatarStage.snapshot`). Only renderers that can capture
   * (Three stages) provide it.
   */
  snapshot?(options?: AvatarSnapshotRequest): Promise<Blob>;
}

/** Renderer-agnostic snapshot options (Three: `AvatarSnapshotOptions`). */
export interface AvatarSnapshotRequest {
  /** Multiplier over on-screen device pixels (default 2). */
  scale?: number;
  /** Longest-side cap in px (default 4096; GPU limits also apply). */
  maxSize?: number;
  /** MIME type (default 'image/png'). */
  type?: string;
  quality?: number;
}

/** Extra capabilities a renderer layers onto the runtime handle. */
export interface AvatarHandleExtras {
  snapshot?: AvatarHandle['snapshot'];
}

/** Unified handle over a state-machine runtime (Three rigs, headless runtimes). */
export function avatarHandleFromRuntime<I extends AvatarIds = AvatarIds>(rt: AvatarRuntimeHandle, renderer: AvatarRendererId = 'three', extras: AvatarHandleExtras = {}): AvatarHandle<I> {
  return {
    ...(extras.snapshot ? { snapshot: extras.snapshot } : null),
    get id() {
      return rt.id;
    },
    renderer,
    get behaviors() {
      return rt.behaviors;
    },
    get channels() {
      return rt.channels.slots.map((s) => s.spec);
    },
    behaviorSpec: (b) => rt.behaviorSpec(b),
    get presets() {
      return rt.presetNames;
    },
    get atoms() {
      return rt.atomIds;
    },
    get attached() {
      return rt.attached;
    },
    get state() {
      return rt.getState();
    },
    play: (a, o) => rt.play(a, o),
    enqueue: (...a) => rt.enqueue(...a),
    resolve: (o) => rt.resolve(o),
    get message() {
      return rt.message;
    },
    anchorOnScreen: (a, out) => rt.anchorOnScreen(a, out),
    pose: (t, o) => rt.pose(t, o),
    apply: (m) => rt.apply(m),
    idle: () => rt.idle(),
    blink: () => rt.triggerBlink(),
    setGazeTarget: (t) => rt.setGazeTarget(t),
    playTimeline: (tl) => rt.playTimeline(tl),
    stopTimeline: () => rt.stopTimeline(),
    subscribe: (l) => rt.subscribe((e) => l(e)),
    set: (c, v, o) => rt.set(c, v, o),
    emit: (e) => rt.emit(e),
    attach: (a, at) => rt.attach(a, at),
    detach: (a) => rt.detach(a),
    use: (p) => rt.use(p),
    get plugins() {
      return rt.plugins;
    },
  };
}
