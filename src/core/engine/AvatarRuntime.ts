import type { AvatarRig, BehaviorDefinition, PresetName } from '../types/AvatarDefinition.ts';
import { AvatarStateMachine } from '../animation/state-machine/AvatarStateMachine.ts';
import type { AvatarPlayOptions, AvatarListener, AvatarStateSnapshot } from '../animation/state-machine/AvatarStateMachine.ts';
import type { ResolvedAvatarDefinition } from '../define/resolveAvatar.ts';
import type { AvatarDefinitionDiff } from '../define/diffAvatar.ts';
import { GazeController } from '../controllers/gaze.ts';
import { AvatarTimelinePlayer, type AvatarTimeline, type AvatarTimelineTarget } from '../animation/timeline.ts';
import type { AvatarPoseOptions, AvatarPoseTarget } from '../animation/pose.ts';
import type { AvatarGazeOptions, GazeOutput } from '../controllers/gaze.ts';
import { PresetLayer, hashString } from '../preset/PresetLayer.ts';
import type { PresetSlot } from '../preset/PresetLayer.ts';
import { PRESET_BLINK_RATE, isPresetRebuildPath, presetWarn } from '../preset/presets.ts';
import { attachPlugin, type AvatarPlugin, type PluginApi } from '../plugins/plugin.ts';
import { getAvatarFamily } from '../catalog/catalog.ts';
import type { PresetValue } from '../preset/presets.ts';
import type { AvatarMessageView } from '../event/message.ts';
import type { AvatarEventRequest } from '../event/event.ts';
import type { AvatarAnchorName } from '../atom/atom.ts';
import type { ChannelBank } from '../channel/channel.ts';

/**
 * Runtime-only preset params (not definition fields), read by renderers from
 * the preset layer: `pose.bob` / `pose.sway` (body units), `pose.tilt` /
 * `pose.lean` / `pose.turn` (radians), `gaze.x` / `gaze.y` (gaze bias,
 * normalized), `blink.rate` (blink frequency multiplier). Also the
 * defaults of optional definition fields a preset may modulate (`body.scale`).
 */
export const PRESET_RUNTIME_DEFAULTS: Readonly<Record<string, number>> = {
  'pose.bob': 0,
  'pose.sway': 0,
  'pose.tilt': 0,
  'pose.lean': 0,
  'pose.turn': 0,
  'gaze.x': 0,
  'gaze.y': 0,
  [PRESET_BLINK_RATE]: 1,
  'body.scale': 1,
};

function readPath(obj: unknown, segs: readonly string[]): unknown {
  let cur = obj;
  for (let i = 0; i < segs.length; i++) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[segs[i]!];
  }
  return cur;
}

/**
 * Renderer-agnostic per-avatar runtime: state machine (behaviors + presets),
 * blink scheduling, gaze target bookkeeping + body-gaze solve, and the
 * imperative handle. Renderer adapters subclass it and apply the state to
 * their scene (the Three adapter: `adapters/three/rig/applyState.ts`).
 */
export interface AvatarRuntimeOptions {
  /** Pointer gaze follow (default true). */
  followPointer?: boolean;
  /** Random blinking (default true). */
  blink?: boolean;
  /** Blink interval range in seconds (default [2, 5]). */
  blinkInterval?: [number, number];
}

/** Imperative handle: what `<StageAvatar ref>` / `useAvatarHandle()` expose. */
export interface AvatarRuntimeHandle {
  readonly id: string;
  play(behavior: string, options?: AvatarPlayOptions): boolean;
  enqueue(...behaviors: string[]): boolean;
  /** Resolve the waiting behavior (`BehaviorDefinition.outcomes`); false when nothing waits for `outcome`. */
  resolve(outcome?: string): boolean;
  /** Live message view (null when none). */
  readonly message: AvatarMessageView | null;
  /** Anchor position in the avatar's viewport (normalized, see `AvatarHandle.anchorOnScreen`). */
  anchorOnScreen(anchor: AvatarAnchorName, out: { x: number; y: number }): boolean;
  /** Blend to a pose (see `AvatarStateMachine.pose`). */
  pose(target: AvatarPoseTarget, options?: AvatarPoseOptions): void;
  apply(preset: PresetName): void;
  idle(): void;
  getState(): AvatarStateSnapshot;
  subscribe(listener: AvatarListener): () => void;
  readonly behaviors: string[];
  /** Turn the body to look at a world-space point; `null` returns to pointer follow / idle. */
  lookAt(point: { x: number; y: number; z: number } | null): void;
  /** Look toward a normalized direction (x right, y up, ±1 ≈ ±60°/±45°); `null` clears. */
  setGazeTarget(target: { x: number; y: number } | null): void;
  /** Pointer follow on/off (also `definition.gaze.followPointer`). */
  followPointer: boolean;
  /** Fire a one-shot blink on the next frame (Allie / 3D runtime). */
  triggerBlink(): void;
  /** Play a scripted timeline (replaces a running one); gaze + blink are scripted until it ends or stops. */
  playTimeline(timeline: AvatarTimeline): AvatarTimelinePlayer;
  /** Stop the running timeline (the avatar continues from its current pose). */
  stopTimeline(): void;
  /** The running timeline, if any. */
  readonly timeline: AvatarTimelinePlayer | null;
  /** Set a channel (`valence`, `energy`, or a family / plugin channel); null clears it. False when the avatar has no such channel. */
  set(channel: string, value: number | null, options?: { immediate?: boolean }): boolean;
  /** The avatar's channels (fixed slots). */
  readonly channels: ChannelBank;
  /** Emit an event (effect / message, see `AvatarHandle.emit`). */
  emit(event: AvatarEventRequest): void;
  behaviorSpec(name: string): BehaviorDefinition | undefined;
  /** Presets / atoms this avatar offers (see `AvatarHandle`). */
  readonly presetNames: readonly string[];
  readonly atomIds: readonly string[];
  /** Attached atoms (see `AvatarHandle.attach`). */
  readonly attached: readonly { readonly id: string; readonly anchor: AvatarAnchorName | null }[];
  attach(atom: string, anchor?: AvatarAnchorName): boolean;
  detach(atom: string): void;
  /** Attach a plugin to this avatar (see `AvatarHandle.use`). */
  use<B extends string, C extends string, P extends string, Api>(plugin: AvatarPlugin<B, C, P, Api>): PluginApi<B, C, P, Api>;
  /** Plugins attached to this avatar. */
  readonly plugins: readonly string[];
}

export function runtimeGazeOptions(def: ResolvedAvatarDefinition): AvatarGazeOptions {
  return def.gaze === false ? { enabled: false } : (def.gaze ?? {});
}

export class AvatarRuntime<R extends AvatarRig = AvatarRig> implements AvatarRuntimeHandle {
  id: string;
  /** The definition currently shown. */
  definition: ResolvedAvatarDefinition;
  readonly rig: R;
  readonly machine: AvatarStateMachine<R>;
  readonly gaze: GazeController;
  /** Called when the avatar's id changes in place (hosts re-key their maps). */
  onRekey?: (oldId: string, newId: string) => void;
  protected readonly runtimeOptions: Required<AvatarRuntimeOptions>;
  protected time = 0;
  protected nextBlink: number;
  protected gazeOut: GazeOutput | null = null;
  protected lookPoint: { x: number; y: number; z: number } | null = null;
  protected gazeTarget: { x: number; y: number } | null = null;
  protected pointerFollow: boolean;
  protected player: AvatarTimelinePlayer | null = null;
  /** A timeline drives gaze + blink (pointer follow and random blink pause). */
  protected scripted = false;
  /**
   * Preset evaluator: periodic, seamless modulation of definition params.
   * Overrides land in `live` (the shown definition = `definition` + preset),
   * never in `definition` itself.
   */
  readonly presets: PresetLayer;
  /** The definition as shown this frame: `definition` with the preset's overrides (copy-on-write). */
  protected live: ResolvedAvatarDefinition;
  /** Bumped whenever `live` changes in place (parts compare it to skip work). */
  protected liveRevision = 0;
  private liveSrc: ResolvedAvatarDefinition;
  private liveOwned = new WeakSet<object>();

  constructor(def: ResolvedAvatarDefinition, rig: R, options: AvatarRuntimeOptions = {}) {
    this.definition = def;
    this.rig = rig;
    this.id = def.id;
    this.runtimeOptions = {
      followPointer: options.followPointer ?? true,
      blink: options.blink ?? true,
      blinkInterval: options.blinkInterval ?? [2, 5],
    };
    this.machine = new AvatarStateMachine<R>({
      rig,
      preset: def.preset,
      family: def.family,
      behaviors: def.behaviors as never,
    });
    this.nextBlink = 1 + Math.random() * 3;
    this.gaze = new GazeController({ mode: 'body', ...runtimeGazeOptions(def) });
    this.pointerFollow = this.runtimeOptions.followPointer !== false;
    this.live = def;
    this.liveSrc = def;
    this.presets = new PresetLayer({
      family: def.family,
      lookup: (id) => this.machine.preset(id),
      seed: hashString(def.id),
      bind: (path) => path.split('.'),
      base: (path, slot) => this.presetBase(path, slot),
      accepts: (path) => this.presetAccepts(path),
      onRelease: (slot) => this.writeLive(slot.ref as string[], readPath(this.definition, slot.ref as string[])),
      onVariant: (path, v) => this.presetVariant(path, v),
      onBehavior: (a) => void this.machine.play(a),
    });
    this.presets.reset(this.machine.face.preset);
  }

  // ----- handle -----
  play(behavior: string, options?: AvatarPlayOptions): boolean {
    const ok = this.machine.play(behavior, options);
    if (!ok) console.warn(`[avatar:${this.id}] unknown behavior in`, behavior, options?.then ?? '');
    return ok;
  }
  enqueue(...behaviors: string[]): boolean {
    return this.machine.enqueue(...behaviors);
  }
  resolve(outcome?: string): boolean {
    return this.machine.resolve(outcome);
  }
  get message(): AvatarMessageView | null {
    return this.machine.message.view;
  }
  /** Renderers project anchors (the headless runtime has no view: false). */
  anchorOnScreen(_anchor: AvatarAnchorName, _out: { x: number; y: number }): boolean {
    return false;
  }
  pose(target: AvatarPoseTarget, options?: AvatarPoseOptions): void {
    this.machine.pose(target, options);
  }

  /** Switch the default preset (unknown presets are ignored with a dev warning). */
  apply(preset: PresetName): void {
    if (!this.machine.preset(preset)) {
      presetWarn(`unknown preset "${preset}"${this.definition.family ? ` for family "${this.definition.family}"` : ''}; ignored`);
      return;
    }
    this.machine.apply(preset);
  }
  idle(): void {
    this.machine.idle();
  }
  getState(): AvatarStateSnapshot {
    return this.machine.getState();
  }
  subscribe(listener: AvatarListener): () => void {
    return this.machine.subscribe(listener);
  }
  get behaviors(): string[] {
    return this.machine.behaviorNames;
  }
  lookAt(point: { x: number; y: number; z: number } | null): void {
    this.lookPoint = point ? { x: point.x, y: point.y, z: point.z } : null;
    if (point) this.gazeTarget = null;
  }
  setGazeTarget(target: { x: number; y: number } | null): void {
    this.gazeTarget = target ? { x: target.x, y: target.y } : null;
    if (target) this.lookPoint = null;
  }
  get followPointer(): boolean {
    return this.pointerFollow;
  }
  set followPointer(v: boolean) {
    this.pointerFollow = v;
  }
  /** Schedule an immediate blink on the next `stepBlink` frame. */
  triggerBlink(): void {
    this.nextBlink = this.time;
  }
  playTimeline(timeline: AvatarTimeline): AvatarTimelinePlayer {
    this.player?.stop();
    this.player = new AvatarTimelinePlayer(timeline, this.timelineTarget());
    return this.player;
  }
  stopTimeline(): void {
    this.player?.stop();
    this.player = null;
  }
  get timeline(): AvatarTimelinePlayer | null {
    return this.player;
  }
  set(channel: string, value: number | null, options?: { immediate?: boolean }): boolean {
    return this.machine.set(channel, value, options?.immediate);
  }
  get channels(): ChannelBank {
    return this.machine.channels;
  }
  emit(event: AvatarEventRequest): void {
    this.machine.emit(event);
  }
  behaviorSpec(name: string): BehaviorDefinition | undefined {
    return this.machine.behaviorSpec(name);
  }
  get presetNames(): readonly string[] {
    return this.machine.presetNames;
  }
  get atomIds(): readonly string[] {
    return this.machine.atomIds;
  }
  get attached(): readonly { readonly id: string; readonly anchor: AvatarAnchorName | null }[] {
    return this.machine.attached;
  }
  attach(atom: string, anchor?: AvatarAnchorName): boolean {
    return this.machine.attach(atom, anchor);
  }
  detach(atom: string): void {
    this.machine.detach(atom);
  }
  use<B extends string, C extends string, P extends string, Api>(plugin: AvatarPlugin<B, C, P, Api>): PluginApi<B, C, P, Api> {
    const m = this.machine, family = this.definition.family;
    return attachPlugin(
      {
        install: (id, content) => m.install(id, content),
        has: (b) => m.has(b),
        hasChannel: (c) => m.hasChannel(c),
        hasPreset: (p) => m.hasPreset(p),
        play: (b, o) => this.play(b, o),
        set: (c, v, immediate) => m.set(c, v, immediate),
        apply: (p) => this.apply(p),
      },
      family,
      family ? getAvatarFamily(family)?.plugins : undefined,
      plugin,
    );
  }
  get plugins(): readonly string[] {
    return this.machine.plugins;
  }

  /** The runtime as a timeline target (behaviors / poses on the machine, scripted gaze + blink). */
  protected timelineTarget(): AvatarTimelineTarget {
    const m = this.machine;
    return {
      durationOf: (a, p) => m.durationOf(a, p),
      behavior: (name, o) => void m.play(name, { params: o.params, preset: o.preset, end: o.end, blend: o.blend, offset: o.offset }),
      pose: (pose, o) => m.pose(pose, o),
      preset: (preset) => this.apply(preset),
      gaze: (t) => this.setGazeTarget(t),
      reset: () => {
        m.reset(this.definition.preset);
        this.presets.reset(m.face.preset);
        this.gazeTarget = null;
        this.lookPoint = null;
      },
      step: (dt) => {
        m.update({ deltaTime: dt });
        this.stepPreset(dt);
      },
      scripted: (on) => {
        this.scripted = on;
        if (!on) this.gazeTarget = null;
      },
    };
  }

  /** Advance a running timeline (call before `machine.update`); returns the dt the machine should advance. */
  protected stepTimeline(dt: number): number {
    const p = this.player;
    if (!p) return dt;
    if (!p.playing) {
      if (p.finished) {
        this.player = null;
        return dt;
      }
      return 0; // paused: freeze
    }
    const d = p.update(dt);
    this.machine.face.blink = p.blink;
    if (p.finished) this.player = null;
    return d;
  }

  /** Last gaze output (layers, angles, attention) — for tools/tests. */
  get gazeState(): GazeOutput | null {
    return this.gazeOut;
  }

  // ----- shared per-frame / edit steps -----

  /** Advance time and the random blink; returns the face channel. */
  protected stepBlink(dt: number) {
    this.time += dt;
    const face = this.machine.face;
    if (this.runtimeOptions.blink && !this.scripted && this.time > this.nextBlink) {
      face.blink = Math.min(1, (this.time - this.nextBlink) / 0.06);
      if (this.time > this.nextBlink + 0.14) {
        face.blink = 0;
        const [lo, hi] = this.runtimeOptions.blinkInterval;
        // preset blink profile: rate 2 = twice as often, 0 = never
        const rate = (this.presets.get(PRESET_BLINK_RATE) ?? 1) * this.machine.resolver.blinkRate;
        this.nextBlink = rate > 0.01 ? this.time + (lo + Math.random() * (hi - lo)) / rate : Infinity;
      }
    }
    return face;
  }

  // ----- presets -----

  /**
   * Follow the machine's effective preset (default preset, or an behavior's preset
   * while it runs) and advance the preset layer; writes its overrides into
   * `live`. Allocation-free per frame (copies happen on the first write of a
   * path after an edit).
   */
  protected stepPreset(dt: number): void {
    if (this.liveSrc !== this.definition) this.resyncLive();
    const want = this.machine.face.preset;
    const layer = this.presets;
    if (want !== layer.preset && want !== this.presetMiss) {
      // unknown preset (e.g. an behavior's): rest at neutral, warn once
      if (layer.set(want)) this.presetMiss = '';
      else {
        this.presetMiss = want;
        layer.set('neutral');
      }
    }
    const n = layer.slots.length;
    layer.step(dt);
    let changed = false;
    for (let i = 0; i < layer.slots.length; i++) {
      const s = layer.slots[i]!;
      if (this.writeLive(s.ref as string[], s.value)) changed = true;
    }
    // only bump when a slot value or the slot set actually moved, so downstream
    // (definition identity, revision) dirty checks stay quiet at steady state
    if (changed || layer.slots.length !== n) this.liveRevision++;
    this.stepChannelParams();
  }

  /**
   * Channel `params` (see `ChannelExpression.params`), written into `live` only when a channel's weight
   * moved. Channels sharing a path add up: `base + Σ (to − base) · weight` (e.g. a low valence and
   * another channel both flatten the pile), so none overwrites another.
   */
  private stepChannelParams(): void {
    const slots = this.machine.channels.slots, res = this.machine.resolver, applied = this.paramWeights;
    if (this.paramSlotCount !== slots.length) this.buildChannelParams();
    let moved = false;
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]!.spec.params) continue;
      const w = res.weight(i);
      if (w === (applied[i] ?? 0)) continue;
      while (applied.length <= i) applied.push(0);
      applied[i] = w;
      moved = true;
    }
    if (!moved) return;
    const paths = this.paramPaths;
    for (let j = 0; j < paths.length; j++) {
      const e = paths[j]!, base = readPath(this.definition, e.segs);
      if (typeof base !== 'number') continue;
      let v = base;
      for (let k = 0; k < e.slots.length; k++) v += (e.to[k]! - base) * (applied[e.slots[k]!] ?? 0);
      this.writeLive(e.segs, v);
    }
    this.liveRevision++;
  }
  /** Group the installed channels' `params` by path (once per channel install, not per frame). */
  private buildChannelParams(): void {
    const slots = this.machine.channels.slots, byPath = new Map<string, { segs: string[]; slots: number[]; to: number[] }>();
    for (let i = 0; i < slots.length; i++) {
      const params = slots[i]!.spec.params;
      if (!params) continue;
      for (const p in params) {
        if (isPresetRebuildPath(p, this.definition.family) || !this.presetAccepts(p)) continue;
        let e = byPath.get(p);
        if (!e) byPath.set(p, (e = { segs: p.split('.'), slots: [], to: [] }));
        e.slots.push(i);
        e.to.push(params[p]!);
      }
    }
    this.paramPaths = [...byPath.values()];
    this.paramSlotCount = slots.length;
  }
  /** Channel weight each slot's `params` were last written for. */
  private readonly paramWeights: number[] = [];
  /** Channel `params` grouped by path (rebuilt when channels are installed). */
  private paramPaths: { segs: string[]; slots: number[]; to: number[] }[] = [];
  private paramSlotCount = -1;
  private presetMiss = '';

  /** Preset value of a runtime-only param (`pose.*`, `gaze.*`, `blink.rate`), else its default. */
  protected presetParam(path: string): number {
    return this.presets.get(path) ?? PRESET_RUNTIME_DEFAULTS[path] ?? 0;
  }

  /** Config value a preset modulates around (definition value, runtime default, else 0). */
  protected presetBase(path: string, slot: PresetSlot): number {
    const v = readPath(this.definition, slot.ref as string[]);
    return typeof v === 'number' ? v : (PRESET_RUNTIME_DEFAULTS[path] ?? 0);
  }

  /** Renderer hook: can `path` be modulated in place (default: anything not flagged as rebuild-causing). */
  protected presetAccepts(_path: string): boolean {
    return true;
  }

  /** Renderer hook: a variant switch (`undefined` = back to the definition value). Default: written into `live`. */
  protected presetVariant(path: string, value: PresetValue | undefined): void {
    const segs = path.split('.');
    this.writeLive(segs, value === undefined ? readPath(this.definition, segs) : value);
    this.liveRevision++;
  }

  /** The definition changed: re-base `live` on it (keeps the preset's current overrides). */
  private resyncLive(): void {
    this.liveSrc = this.definition;
    this.live = this.definition;
    this.liveOwned = new WeakSet();
    for (const [path, v] of this.presets.variants) this.writeLive(path.split('.'), v);
    for (const s of this.presets.slots) this.writeLive(s.ref as string[], s.value);
    // channel params re-apply on the new definition
    this.paramWeights.fill(0);
    this.paramSlotCount = -1;
    this.liveRevision++;
  }

  /** Write a value into `live` (copy-on-write per object; paths whose parent object is absent are runtime-only). Returns whether `live` changed. */
  private writeLive(segs: readonly string[], value: unknown): boolean {
    if (segs.length === 0) return false;
    let parent = this.live as unknown as Record<string, unknown>;
    if (!this.liveOwned.has(parent)) {
      if (value === readPath(parent, segs)) return false;
      parent = { ...parent };
      this.live = parent as unknown as ResolvedAvatarDefinition;
      this.liveOwned.add(parent);
    }
    for (let i = 0; i < segs.length - 1; i++) {
      const child = parent[segs[i]!];
      if (child === null || typeof child !== 'object') return false;
      let own = child as Record<string, unknown>;
      if (!this.liveOwned.has(own)) {
        own = Array.isArray(child) ? ([...child] as unknown as Record<string, unknown>) : { ...own };
        parent[segs[i]!] = own;
        this.liveOwned.add(own);
      }
      parent = own;
    }
    const key = segs[segs.length - 1]!;
    if (value === undefined) {
      if (!(key in parent)) return false;
      delete parent[key];
    } else {
      if (parent[key] === value) return false;
      parent[key] = value;
    }
    return true;
  }

  /** Whole-body gaze solve for a normalized target (null = none). */
  protected solveGaze(dt: number, target: { x: number; y: number } | null, moved: boolean): GazeOutput {
    const weight = this.machine.ownsGaze ? 0 : this.machine.gazeWeight;
    const g = this.gaze.solve({ dt, target: this.definition.gaze === false ? null : target, moved, weight });
    this.gazeOut = g;
    return g;
  }

  /** Apply the renderer-independent parts of a definition diff (gaze, preset, id, behaviors). */
  protected applyRuntimeDiff(d: AvatarDefinitionDiff, next: ResolvedAvatarDefinition): void {
    if (d.gaze) this.gaze.setOptions(runtimeGazeOptions(next));
    if (d.preset) this.machine.apply(d.preset);
    if (d.id) {
      const old = this.id;
      this.id = next.id;
      this.rekeyed(old, next.id);
    }
    if (d.behaviors) for (const a of next.behaviors ?? []) this.machine.register(a as never);
  }

  /** Hook: id changed in place (default notifies `onRekey`). */
  protected rekeyed(oldId: string, newId: string): void {
    this.onRekey?.(oldId, newId);
  }
}
