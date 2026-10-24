import type { UpdateContext } from '../../types/Lifecycle.ts';
import { avatarEasing, listBehaviors } from '../behaviors.ts';
import { writePoseTarget, type AvatarPoseTarget } from '../pose.ts';
import { AtomTracker, createReachState } from '../../atom/atomLayer.ts';
import { AvatarLimbTracker } from '../../atom/limbLayer.ts';
import { ChannelBank, listChannels, type ChannelSpec } from '../../channel/channel.ts';
import type { AvatarAnchorName } from '../../atom/atom.ts';
import { AvatarResolver } from '../../resolve/resolver.ts';
import { getPreset, listPresets, type RegisteredPreset } from '../../preset/presets.ts';
import type { PluginContent } from '../../plugins/plugin.ts';
import { AvatarEffectQueue } from '../../event/effects.ts';
import { AvatarMessageTracker, type AvatarMessageSnapshot } from '../../event/message.ts';
import type { AvatarEventRequest } from '../../event/event.ts';
import type { BehaviorEnd } from '../timeline.ts';
import type { PresetName, BehaviorCue, BehaviorDefinition, AvatarFaceState, AvatarRig } from '../../types/AvatarDefinition.ts';

export interface AvatarPlayOptions {
  /** Behaviors to run afterwards, in order, before returning to idle. */
  then?: string | string[];
  /** Override the behavior's preset for this run. */
  preset?: PresetName;
  /** `false` appends to the queue instead of interrupting the current behavior. Default true. */
  interrupt?: boolean;
  /** Parameters for this run (e.g. spin `{ axis: [1, 1, 0], turns: 2, duration: 1.5, easing: 'back' }`). */
  params?: Record<string, unknown>;
  /** Override the behavior's ending (see `BehaviorDefinition.end`). */
  end?: BehaviorEnd;
  /** Override the blend-in from the live pose (s). */
  blend?: number;
  /** Seconds the run has already played (timelines start behaviors exactly on their beat). */
  offset?: number;
}

/** Built-in absolute behavior: reach a pose from the live pose and hold it (`params`: `AvatarPoseTarget` + `duration`, `ease`). */
export const AVATAR_POSE_BEHAVIOR = 'pose';
/** Return-to-rest blend after a one-shot ends (s). */
export const AVATAR_REST_BLEND = 0.35;
/** Default blend-in from the live pose (s). */
export const AVATAR_BEHAVIOR_BLEND = 0.15;

export type AvatarEvent =
  | { type: 'start'; behavior: string }
  | { type: 'end'; behavior: string; interrupted: boolean }
  /** A waiting behavior was resolved (`resolve(outcome)`); its follow-up starts next. */
  | { type: 'resolve'; behavior: string; outcome: string }
  /** The message on screen changed (appeared, swapped, cleared = null). */
  | { type: 'message'; text: string | null }
  | { type: 'preset'; preset: PresetName }
  /** A timed cue of the running behavior (`BehaviorDefinition.cues`), e.g. a sequence `step` with its text. */
  | { type: 'cue'; behavior: string; cue: string; data?: Readonly<Record<string, unknown>> }
  /** A channel's target changed (`set`). */
  | { type: 'channel'; channel: string; value: number }
  /** A plugin was attached (`handle.use`). */
  | { type: 'plugin'; plugin: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AvatarListener = (event: AvatarEvent, machine: AvatarStateMachine<any>) => void;

export interface AvatarStateSnapshot {
  behavior: string;
  preset: PresetName;
  defaultPreset: PresetName;
  queue: readonly string[];
  elapsed: number;
  /** Outcomes the current behavior waits for (`resolve(outcome)`); empty when it isn't waiting. */
  outcomes: readonly string[];
  /** Message on screen (an emitted message / a behavior's `pose.message`), null when none. */
  message: AvatarMessageSnapshot | null;
  /** Channel targets by id (level value; rhythm rate, NaN = hidden). */
  channels: Readonly<Record<string, number>>;
}

export interface AvatarStateMachineOptions<R extends AvatarRig = AvatarRig> {
  /** Rig to animate. Optional so the machine can be driven headless (tests / clip-only). */
  rig?: R;
  /** Behaviors to register in addition to (or overriding) registry behaviors. */
  behaviors?: BehaviorDefinition<R>[];
  /** Include behaviors from the global registry (`registerBehavior`). Default true. */
  useRegistry?: boolean;
  /** Avatar family whose scoped registry behaviors are visible (default: shared behaviors only). */
  family?: string;
  /** Resting behavior name (default 'idle'). */
  idle?: string;
  preset?: PresetName;
}

/**
 * THE avatar state machine (every family): behaviors (`do` / `enqueue`) —
 * one-shot or looping procedural behaviors against a rig, with a queue and an
 * `idle` rest behavior — plus the preset selection (`apply`; an behavior may set
 * a preset while it runs, the default preset returns after). What a preset does is
 * evaluated by the core `PresetLayer` (see `core/preset`).
 *
 *   machine.play('jump', { then: ['happy'] }); // jump, then happy, then idle
 *   machine.apply('sparkle');
 *
 * Time is advanced by `update(ctx)` with the shared `UpdateContext`
 * (same shape the core `EngineTicker` produces).
 */
export class AvatarStateMachine<R extends AvatarRig = AvatarRig> {
  readonly face: AvatarFaceState;
  /** Live atoms shown by behaviors (`ctx.pose.atom`), faded in / out; renderers draw the visible ones. */
  readonly atoms: AtomTracker;
  /** Live reach request (`ctx.pose.reach`); families map it onto their rig (e.g. a tentacle pull). */
  readonly reach = createReachState();
  /** Speech bubble state (emitted messages / `ctx.pose.message`); renderers draw `message.view`. */
  readonly message = new AvatarMessageTracker();
  /** Persistent channels (valence, energy + family / plugin ones), fixed slots. */
  readonly channels: ChannelBank;
  /** Fixed-order composition of presets, channels and the running behavior. */
  readonly resolver: AvatarResolver;
  /** Live multi-limb gestures + limb tone (`ctx.pose.limb` / `limbTone`, postures); families map them onto their rig. */
  readonly limbs = new AvatarLimbTracker();
  /** One-shot effects (cue `effect`s, emitted effects) waiting for the renderer. */
  readonly effects = new AvatarEffectQueue();
  private readonly behaviors = new Map<string, BehaviorDefinition<R>>();
  private readonly listeners = new Set<AvatarListener>();
  private readonly idleName: string;
  /** Channel slots the running behavior holds (`BehaviorDefinition.channels`). */
  private held: number[] = [];
  private cues: readonly BehaviorCue[] = NO_CUES;
  private cueIdx = 0;
  private end: BehaviorEnd = 'rest';
  private blend = AVATAR_BEHAVIOR_BLEND;
  private blendEase: (k: number) => number = avatarEasing('smooth');
  private rig: R | undefined;
  private current!: BehaviorDefinition<R>;
  private elapsed = 0;
  private params: Record<string, unknown> = {};
  private duration: number | 'clip' = Infinity;
  private queue: string[] = [];
  private defaultPreset: PresetName;
  readonly family: string | undefined;
  /** Plugins attached to this avatar (ids, in attach order). */
  readonly plugins: string[] = [];
  /** Structural atom kinds plugins added to this avatar's composition; `compositionRevision` bumps on change. */
  readonly composition: string[] = [];
  compositionRevision = 0;
  private readonly localPresets = new Map<string, RegisteredPreset>();

  constructor(options: AvatarStateMachineOptions<R> = {}) {
    this.rig = options.rig;
    this.idleName = options.idle ?? 'idle';
    this.defaultPreset = options.preset ?? 'neutral';
    this.face = { blink: 0, preset: this.defaultPreset, eyeOverlay: null, mouth: null };
    this.atoms = new AtomTracker(options.family);
    this.family = options.family;
    this.channels = new ChannelBank(listChannels(options.family));
    this.resolver = new AvatarResolver(this.channels, this);
    this.channels.applyPreset(this.preset(this.defaultPreset)?.channels);
    if (options.useRegistry !== false) for (const a of listBehaviors(options.family)) this.register(a as unknown as BehaviorDefinition<R>);
    for (const a of options.behaviors ?? []) this.register(a);
    if (!this.behaviors.has(this.idleName)) {
      this.register({ name: this.idleName, duration: Infinity, preset: null });
    }
    this.begin(this.idleName, [], undefined, {}, {});
  }

  // ---------- registry ----------
  register(behavior: BehaviorDefinition<R>): this {
    this.behaviors.set(behavior.name, behavior);
    return this;
  }

  has(name: string): boolean {
    return this.behaviors.has(name);
  }

  /** Behaviors to offer (registered + plugin ones; hidden follow-ups excluded). */
  get behaviorNames(): string[] {
    const out: string[] = [];
    for (const b of this.behaviors.values()) if (!b.hidden) out.push(b.name);
    return out;
  }

  getBehavior(name: string): BehaviorDefinition<R> | undefined {
    return this.behaviors.get(name);
  }

  attachRig(rig: R | undefined): void {
    this.rig = rig;
  }

  // ---------- commands ----------
  /** Start `name` now (or enqueue when `interrupt: false`). Returns false for unknown behaviors. */
  play(name: string, options: AvatarPlayOptions = {}): boolean {
    const then = options.then === undefined ? [] : Array.isArray(options.then) ? options.then : [options.then];
    const all = [name, ...then];
    const unknown = all.find((n) => !this.lookup(n));
    if (unknown !== undefined) return false;
    if (options.interrupt === false && this.current.name !== this.idleName) {
      this.queue.push(...all);
      return true;
    }
    this.finishCurrent(true);
    this.begin(name, then, options.preset, options.params, options);
    return true;
  }

  /** Append behaviors to the queue; starts immediately if idle. */
  enqueue(...names: string[]): boolean {
    if (names.length === 0) return true;
    const [first, ...rest] = names;
    return this.play(first!, { then: rest, interrupt: false });
  }

  /** Abort everything and return to idle. */
  idle(): void {
    this.queue = [];
    if (this.current.name === this.idleName) return;
    this.finishCurrent(true);
    this.begin(this.idleName, [], undefined, {}, { blend: AVATAR_REST_BLEND });
  }

  /** Reach an absolute pose from the live pose over `duration` s, then hold it (until the next behavior). */
  pose(target: AvatarPoseTarget, o: { duration?: number; ease?: string; end?: BehaviorEnd; offset?: number; preset?: PresetName } = {}): void {
    this.play(AVATAR_POSE_BEHAVIOR, { params: { ...target, duration: o.duration ?? 0.4, ease: o.ease }, end: o.end, offset: o.offset, preset: o.preset });
  }

  private lookup(name: string): BehaviorDefinition<R> | undefined {
    return this.behaviors.get(name) ?? (name === AVATAR_POSE_BEHAVIOR ? (poseBehavior as unknown as BehaviorDefinition<R>) : undefined);
  }

  /** Back to the initial state: idle at rest, default preset, nothing queued or held (timeline seek). */
  reset(preset?: PresetName): void {
    this.queue = [];
    if (preset !== undefined) this.defaultPreset = preset;
    this.face.preset = this.defaultPreset;
    this.channels.applyPreset(this.preset(this.defaultPreset)?.channels);
    this.face.blink = 0;
    this.face.eyeOverlay = null;
    this.face.mouth = null;
    this.atoms.reset();
    this.limbs.reset();
    this.effects.clear();
    Object.assign(this.reach, createReachState());
    if (this.message.text) {
      this.message.reset();
      this.notify({ type: 'message', text: null });
    } else this.message.reset();
    this.resolver.reset();
    this.begin(this.idleName, [], undefined, {}, { blend: 0 });
  }

  /** Seconds an behavior runs with `params` (`undefined` = unknown; `Infinity` / NaN for loops and clips). */
  durationOf(name: string, params: Record<string, unknown> = {}): number | undefined {
    const a = this.lookup(name);
    if (!a) return undefined;
    const pd = params.duration;
    if (typeof a.duration !== 'number') return NaN;
    return typeof pd === 'number' && pd > 0 && Number.isFinite(a.duration) ? pd : a.duration;
  }

  /** Set the resting expression (and the current one). */
  apply(preset: PresetName): void {
    this.defaultPreset = preset;
    this.showPreset(preset);
  }

  hasChannel(channel: string): boolean {
    return this.channels.index(channel) >= 0;
  }

  hasPreset(preset: string): boolean {
    return !!this.preset(preset);
  }

  /** Preset `id` as this avatar sees it (plugin presets first, then the family / shared registry). */
  preset(id: string): RegisteredPreset | undefined {
    return this.localPresets.get(id) ?? getPreset(id, this.family);
  }

  /**
   * Install plugin content into THIS avatar only (channels into free slots,
   * presets / atoms / behaviors into its own tables, composition atoms for
   * the renderer). False when `pluginId` is already attached.
   */
  install(pluginId: string, content: PluginContent): boolean {
    if (this.plugins.includes(pluginId)) return false;
    this.plugins.push(pluginId);
    for (const c of content.channels ?? []) this.channels.install(c);
    for (const id in content.presets ?? {}) this.localPresets.set(id, { ...content.presets![id]!, id, family: this.family });
    for (const a of content.atoms ?? []) this.atoms.define(a);
    for (const b of content.behaviors ?? []) this.register(b as BehaviorDefinition<R>);
    let grew = false;
    for (const k of content.composition ?? []) if (!this.composition.includes(k)) (this.composition.push(k), (grew = true));
    if (grew) this.compositionRevision++;
    this.notify({ type: 'plugin', plugin: pluginId });
    return true;
  }

  private showPreset(preset: PresetName): void {
    if (preset === this.face.preset) return;
    this.face.preset = preset;
    this.channels.applyPreset(this.preset(preset)?.channels);
    this.notify({ type: 'preset', preset });
  }

  /**
   * Resolve the waiting behavior (see `BehaviorDefinition.outcomes`): hands
   * off to the follow-up of `outcome` (default: the first one), keeping the
   * queue. Returns false when the current behavior doesn't wait for it.
   */
  resolve(outcome?: string): boolean {
    const a = this.current;
    const map = a.outcomes;
    if (!map) return false;
    const key = outcome ?? Object.keys(map)[0];
    const next = key !== undefined ? map[key] : undefined;
    if (next === undefined || !this.lookup(next)) return false;
    this.finishCurrent(false);
    this.notify({ type: 'resolve', behavior: a.name, outcome: key! });
    this.begin(next, this.queue);
    return true;
  }

  /**
   * Set a channel (see `core/channel`): it eases to `value` on top of whatever
   * runs, never interrupting it; null clears the setting. False for channels
   * this avatar doesn't have.
   */
  /** Definition of behavior `name` on this avatar (family or plugin). */
  behaviorSpec(name: string): BehaviorDefinition | undefined {
    return this.behaviors.get(name);
  }
  /** Channels of this avatar (core + family + plugin, slot order). */
  get channelSpecs(): ChannelSpec[] {
    return this.channels.slots.map((s) => s.spec);
  }
  /** Presets this avatar can apply (registry + plugin ones). */
  get presetNames(): string[] {
    const out = listPresets(this.family);
    for (const id of this.localPresets.keys()) if (!out.includes(id)) out.push(id);
    return out;
  }
  /** Atoms this avatar can show (registry + plugin ones). */
  get atomIds(): string[] {
    return this.atoms.ids();
  }
  /** Show `atom` until `detach` (at `anchor`, default its own). False for atoms this avatar doesn't know. */
  attach(atom: string, anchor?: AvatarAnchorName): boolean {
    if (!this.atoms.lookup(atom)) return false;
    const held = this.resolver.held, h = held.find((a) => a.id === atom);
    if (h) h.anchor = anchor ?? null;
    else held.push({ id: atom, anchor: anchor ?? null });
    return true;
  }
  detach(atom: string): void {
    const held = this.resolver.held, i = held.findIndex((a) => a.id === atom);
    if (i >= 0) held.splice(i, 1);
  }
  /** Attached atoms (id → anchor, null = the atom's own). */
  get attached(): readonly { readonly id: string; readonly anchor: AvatarAnchorName | null }[] {
    return this.resolver.held;
  }

  set(channel: string, value: number | null, immediate = false): boolean {
    const i = this.channels.index(channel);
    if (i < 0) return false;
    const before = this.channels.target(i);
    this.channels.set(i, value, immediate);
    const after = this.channels.target(i);
    if (!Object.is(before, after)) this.notify({ type: 'channel', channel, value: after });
    return true;
  }

  /** Emit an event: a one-shot effect, or a message (wins over behavior messages; `text: null` clears it, fading out). */
  emit(event: AvatarEventRequest): void {
    if (event.type === 'effect') this.effects.emit(event);
    else if (event.text === null) this.message.clear();
    else this.message.say(event.text, event);
  }

  /** Outcomes the current behavior waits for (empty when none). */
  get outcomes(): readonly string[] {
    return this.current.outcomes ? Object.keys(this.current.outcomes) : [];
  }

  /** Finish a `'clip'`-duration (or any) behavior now and advance the queue. */
  complete(): void {
    if (this.current.name === this.idleName) return;
    this.advance(false);
  }

  // ---------- query ----------
  get behavior(): string {
    return this.current.name;
  }

  /** True when the active behavior wants to drive the gaze itself. */
  get ownsGaze(): boolean {
    return !!this.current.ownsGaze;
  }

  /** Gaze participation of the current behavior (0..1). */
  get gazeWeight(): number {
    const g = this.current.gaze;
    const w = typeof g === 'number' ? g : this.current.name === this.idleName ? 1 : 0.8;
    return this.resolver.active ? w * this.resolver.gaze : w;
  }

  /** Parameters of the current run. */
  get behaviorParams(): Readonly<Record<string, unknown>> {
    return this.params;
  }

  /** Snapshot of the behavior / preset state. */
  getState(): AvatarStateSnapshot {
    return {
      behavior: this.current.name,
      preset: this.face.preset,
      defaultPreset: this.defaultPreset,
      queue: [...this.queue],
      elapsed: this.elapsed,
      outcomes: this.outcomes,
      message: this.message.snapshot,
      channels: this.channels.snapshot(),
    };
  }

  subscribe(listener: AvatarListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- tick ----------
  update(ctx: Pick<UpdateContext, 'deltaTime'> | UpdateContext): void {
    const dt = ctx.deltaTime;
    this.elapsed += dt;
    const a = this.current;
    const dur = this.duration;
    const t = Math.max(0, typeof dur === 'number' ? Math.min(this.elapsed, dur) : this.elapsed);
    const w = this.blend > 0 ? this.blendEase(Math.min(1, t / this.blend)) : 1;
    this.frameT = t;
    this.frameDt = dt;
    if (this.resolver.frame(dt, this.rig, a.update ? this.behave : null, a.mode ?? 'relative', w)) this.notify({ type: 'message', text: this.message.text || null });
    if (this.cueIdx < this.cues.length) this.fireCues(a, t);
    if (typeof dur === 'number' && this.elapsed >= dur) this.advance(false);
  }

  // ---------- internals ----------
  /** Emit every cue of `a` up to `t` (stops if a listener switches the behavior). */
  private fireCues(a: BehaviorDefinition<R>, t: number): void {
    while (this.current === a && this.cueIdx < this.cues.length) {
      const c = this.cues[this.cueIdx]!;
      if (c.at > t) break;
      this.cueIdx++;
      if (c.effect) this.effects.emit(c.effect);
      this.notify({ type: 'cue', behavior: a.name, cue: c.name, data: c.data });
    }
  }

  /** The behavior context, one object reused every frame. */
  private readonly context = { rig: undefined as unknown as R, pose: undefined as unknown as AvatarResolver['writer'], face: undefined as unknown as AvatarFaceState, t: 0, dt: 0, params: {} as Record<string, unknown>, duration: 0 };
  private frameT = 0;
  private frameDt = 0;
  private readonly behave = (): void => {
    this.current.update!(this.ctx(this.frameT, this.frameDt));
  };

  private ctx(t: number, dt: number) {
    const c = this.context, d = this.duration;
    c.rig = this.rig!;
    c.pose = this.resolver.writer;
    c.face = this.face;
    c.t = t;
    c.dt = dt;
    c.params = this.params;
    c.duration = typeof d === 'number' ? d : this.elapsed;
    return c;
  }

  /**
   * Start an behavior from the live pose: the current output (incl. a held
   * pose, mid-behavior motion and its velocity) is captured and relaxes to rest
   * while the new behavior blends in — no snap back to rest.
   */
  private begin(name: string, queue: string[], preset?: PresetName, params: Record<string, unknown> = {}, o: Pick<AvatarPlayOptions, 'end' | 'blend' | 'offset'> & { keepHold?: boolean } = {}): void {
    const next = this.lookup(name)!;
    this.params = params;
    const pd = params.duration;
    this.duration = typeof pd === 'number' && pd > 0 && typeof next.duration === 'number' && Number.isFinite(next.duration) ? pd : next.duration;
    const idle = name === this.idleName;
    this.blend = o.blend ?? next.blendIn ?? (next.mode === 'absolute' && typeof this.duration === 'number' && Number.isFinite(this.duration) ? this.duration : idle ? AVATAR_REST_BLEND : AVATAR_BEHAVIOR_BLEND);
    this.blendEase = avatarEasing(params.ease);
    this.end = o.end ?? next.end ?? 'rest';
    if (!o.keepHold) this.resolver.layers.capture(this.blend);
    this.current = next;
    this.elapsed = o.offset ?? 0;
    // cues of this run (evaluated once; those before the start offset are skipped)
    const cues = next.cues;
    this.cues = !cues ? NO_CUES : [...(typeof cues === 'function' ? cues({ duration: typeof this.duration === 'number' ? this.duration : Infinity, params }) : cues)].sort((x, y) => x.at - y.at);
    let ci = 0;
    if (this.elapsed > 0) while (ci < this.cues.length && this.cues[ci]!.at < this.elapsed) ci++;
    this.cueIdx = ci;
    this.queue = queue;
    this.holdChannels(next);
    this.showPreset(preset ?? next.preset ?? this.defaultPreset);
    if (this.rig && next.enter) next.enter(this.ctx(0, 0));
    this.notify({ type: 'start', behavior: name });
  }

  /** Release the previous behavior's channel holds, hold the new one's (start / end only, never per frame). */
  private holdChannels(a: BehaviorDefinition<R>): void {
    for (const i of this.held) this.channels.hold(i, NaN);
    this.held = [];
    const c = a.channels;
    if (!c) return;
    for (const id in c) {
      const i = this.channels.index(id);
      if (i < 0) continue;
      this.channels.hold(i, c[id]!);
      this.held.push(i);
    }
  }

  private finishCurrent(interrupted: boolean): void {
    const a = this.current;
    if (!a) return;
    if (this.rig && a.exit) a.exit(this.ctx(this.elapsed, 0));
    this.notify({ type: 'end', behavior: a.name, interrupted });
  }

  private advance(interrupted: boolean): void {
    this.finishCurrent(interrupted);
    const [next, ...rest] = this.queue;
    // queued: hand off from the live pose (no return to rest in between)
    if (next !== undefined) this.begin(next, rest);
    else if (!interrupted && this.end === 'hold') {
      this.resolver.layers.holdCurrent();
      this.begin(this.idleName, [], undefined, {}, { keepHold: true });
    } else this.begin(this.idleName, [], undefined, {}, { blend: AVATAR_REST_BLEND });
  }

  private notify(event: AvatarEvent): void {
    for (const l of this.listeners) l(event, this);
  }
}

const NO_CUES: readonly BehaviorCue[] = [];

/** `pose` behavior: absolute, reaches `params` (an `AvatarPoseTarget`) over `params.duration` (default 0.4 s), then holds. */
const poseBehavior: BehaviorDefinition = {
  name: AVATAR_POSE_BEHAVIOR,
  duration: 0.4,
  preset: null,
  mode: 'absolute',
  end: 'hold',
  params: {
    duration: { kind: 'number', label: 'Duration', default: 0.4, min: 0.05, max: 5, step: 0.05 },
  },
  update({ pose, params }) {
    writePoseTarget(pose, params as AvatarPoseTarget);
  },
};
