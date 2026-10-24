import type { AvatarDescriptor, AvatarEngineConfig } from '../types/AvatarDescriptor.ts';
import type { RenderContext } from '../types/RenderContext.ts';
import type { UpdateContext } from '../types/Lifecycle.ts';
import { SceneGraph } from '../scenegraph/SceneGraph.ts';
import { AnimationMixer } from '../animation/AnimationMixer.ts';
import { AvatarStateMachine } from '../animation/state-machine/AvatarStateMachine.ts';
import { AvatarTimelinePlayer, type AvatarTimeline } from '../animation/timeline.ts';
import type { IRenderer } from '../renderers/IRenderer.ts';
import { getRendererFactory } from '../renderers/IRenderer.ts';
import type { IAvatarController } from '../controllers/IAvatarController.ts';
import { ChannelBuffer } from '../channel/ChannelBuffer.ts';
import { ChannelBufferPool } from '../math/ChannelBufferPool.ts';
import { PresetLayer, hashString } from '../preset/PresetLayer.ts';
import type { PresetSlot } from '../preset/PresetLayer.ts';
import { PRESET_BLINK_RATE, hasPreset, presetWarn } from '../preset/presets.ts';
import type { PresetValue } from '../preset/presets.ts';
import type { AvatarNode as SceneNode } from '../scenegraph/AvatarNode.ts';

/** A preset path bound to a scene node channel (`node.channel`). */
interface PresetChannel {
  node: SceneNode | undefined;
  channel: string;
  blend: string | undefined;
  numeric: boolean;
}

export interface MorphState {
  fromBuffers: Map<string, ChannelBuffer>;
  toChannels: Record<string, Record<string, any>>;
  duration: number;
  elapsed: number;
  pools: Map<string, ChannelBufferPool>;
  scratch: Map<string, ChannelBuffer>;
}

/**
 * AvatarInstance: Live, interactive runtime instance of an avatar.
 */
export class AvatarInstance {
  readonly id: string;
  readonly descriptor: AvatarDescriptor;

  public scene: SceneGraph;
  public mixer: AnimationMixer;
  public stateMachine: AvatarStateMachine;
  public renderer: IRenderer;
  public renderContext: RenderContext;
  public animated: boolean = true;
  public pixelSize: number = 64;

  private controllers: Map<string, IAvatarController> = new Map();
  private activeMorph: MorphState | null = null;
  private isDisposed: boolean = false;
  private player: AvatarTimelinePlayer | null = null;
  private readonly timelineCtx: UpdateContext = { time: 0, deltaTime: 0, frame: 0 };
  /**
   * Preset evaluator (family = descriptor id). Paths are `node.channel`; values
   * are channel deltas applied with each channel's blend mode on top of the
   * config (base) values, which presets never change.
   */
  readonly presets: PresetLayer;
  private readonly presetVariants: { ref: PresetChannel; value: PresetValue }[] = [];
  private presetMiss = '';
  private presetDirty = false;
  /** Whether the last applied preset deltas are still on the nodes (see `applyPreset`). */
  private presetApplied = false;
  private mixerRan = false;
  private readonly resetNode = (node: SceneNode) => node.channels.resetToRestingState();

  constructor(
    id: string,
    descriptor: AvatarDescriptor,
    config?: Partial<AvatarEngineConfig>,
    container?: HTMLElement | null
  ) {
    this.id = id;
    this.descriptor = descriptor;

    this.scene = new SceneGraph(`${id}:root`);
    this.mixer = new AnimationMixer();
    this.stateMachine = new AvatarStateMachine({ useRegistry: false });
    this.presets = new PresetLayer({
      family: descriptor.id,
      seed: hashString(id),
      bind: (path) => this.bindPresetPath(path),
      accepts: (path) => {
        const r = this.bindPresetPath(path);
        return path === PRESET_BLINK_RATE || (!!r.node && r.blend !== undefined);
      },
      base: (_path, slot) => this.presetNeutral(slot),
      onVariant: (path, value) => {
        const ref = this.bindPresetPath(path);
        const i = this.presetVariants.findIndex((v) => v.ref.node === ref.node && v.ref.channel === ref.channel);
        if (i >= 0) this.presetVariants.splice(i, 1);
        if (value !== undefined && ref.node) this.presetVariants.push({ ref, value });
        this.presetDirty = true;
      },
      onBehavior: (a) => void this.stateMachine.play(a),
    });

    // Renderers are adapter-registered (`adapters/svg`, `adapters/canvas2d`, `adapters/three` 'webgl');
    // DOM renderers need a container, else the static string renderer is used.
    const wanted = config?.renderer || (container ? 'retained-svg' : 'svg-string');
    const rendererType = !container && (wanted === 'retained-svg' || wanted === 'canvas-2d') ? 'svg-string' : wanted;
    const factory = getRendererFactory(rendererType) ?? getRendererFactory('svg-string');
    if (!factory) throw new Error(`[avatar] no renderer registered for "${rendererType}" (import '@consona/avatar/adapters/svg')`);
    this.renderer = factory();

    this.renderer.initialize(container ?? null, descriptor);

    // Initial render context
    this.renderContext = {
      canvas: descriptor.canvas,
      theme: {},
      paletteId: config?.paletteId || descriptor.defaultPaletteId,
      mode: config?.mode || 'light',
      time: 0,
      deltaTime: 0,
      flags: config?.flags,
    };

    // Execute descriptor setup to register nodes, atoms, planes, and default clips
    descriptor.setup({ engine: null, instance: this });
    this.presets.reset(this.stateMachine.face.preset);

    // Apply initial channel values if provided
    if (config?.channels) {
      this.setChannels(config.channels);
    }
  }

  setPalette(paletteId: string, theme: Record<string, any>, mode?: 'light' | 'dark'): void {
    this.renderContext.paletteId = paletteId;
    this.renderContext.theme = theme;
    if (mode) this.renderContext.mode = mode;
  }

  setChannel(nodeId: string, channelName: string, value: any): void {
    const node = this.scene.find(nodeId);
    if (node) {
      node.channels.set(channelName, value);
    }
  }

  getChannel<T = any>(nodeId: string, channelName: string): T | undefined {
    const node = this.scene.find(nodeId);
    return node ? node.channels.get<T>(channelName) : undefined;
  }

  setChannels(channelsMap: Record<string, Record<string, any>>): void {
    for (const [nodeId, overrides] of Object.entries(channelsMap)) {
      const node = this.scene.find(nodeId);
      if (node) {
        node.channels.setValues(overrides);
      }
    }
  }

  getChannelsSnapshot(): Record<string, Record<string, any>> {
    const snapshot: Record<string, Record<string, any>> = {};
    const renderList = this.scene.getRenderList();
    for (const node of renderList) {
      snapshot[node.id] = node.channels.toObject();
    }
    return snapshot;
  }

  /**
   * Smoothly morphs current node channels to target channel states over a given duration.
   */
  morph(targetChannels: Record<string, Record<string, any>>, durationSeconds: number = 0.3): void {
    if (durationSeconds <= 0) {
      this.setChannels(targetChannels);
      this.activeMorph = null;
      return;
    }

    const fromBuffers = new Map<string, ChannelBuffer>();
    const pools = new Map<string, ChannelBufferPool>();
    const scratch = new Map<string, ChannelBuffer>();
    const nodeIds = Object.keys(targetChannels);
    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i]!;
      const node = this.scene.find(nodeId);
      if (node) {
        const pool = new ChannelBufferPool(node.channels.schema);
        pools.set(nodeId, pool);
        const from = pool.acquire(node.channels);
        fromBuffers.set(nodeId, from);
        scratch.set(nodeId, pool.acquire());
      }
    }

    this.activeMorph = {
      fromBuffers,
      toChannels: targetChannels,
      duration: durationSeconds,
      elapsed: 0,
      pools,
      scratch,
    };
  }

  /**
   * Resolve a short or fully-qualified node id without anatomy hard-coding.
   * Tries exact id, then any node whose id ends with `:${shortId}` or equals shortId.
   */
  resolveNodeId(nodeId: string): string {
    if (this.scene.find(nodeId)) return nodeId;
    let resolved: string | null = null;
    this.scene.root.traverse((node) => {
      if (resolved) return;
      if (node.id === nodeId || node.id.endsWith(`:${nodeId}`)) {
        resolved = node.id;
      }
    });
    return resolved ?? nodeId;
  }

  public readonly channels = {
    setValue: (channelPath: string, value: any): void => {
      const lastColon = channelPath.lastIndexOf(':');
      const nodeId = lastColon !== -1 ? channelPath.slice(0, lastColon) : '';
      const channelName = lastColon !== -1 ? channelPath.slice(lastColon + 1) : channelPath;
      this.setChannel(this.resolveNodeId(nodeId), channelName, value);
    },
    getValue: <T = any>(channelPath: string): T | undefined => {
      const lastColon = channelPath.lastIndexOf(':');
      const nodeId = lastColon !== -1 ? channelPath.slice(0, lastColon) : '';
      const channelName = lastColon !== -1 ? channelPath.slice(lastColon + 1) : channelPath;
      return this.getChannel<T>(this.resolveNodeId(nodeId), channelName);
    },
    set: (nodeId: string, channelName: string, value: any): void => {
      this.setChannel(this.resolveNodeId(nodeId), channelName, value);
    },
    get: <T = any>(nodeId: string, channelName: string): T | undefined => {
      return this.getChannel<T>(this.resolveNodeId(nodeId), channelName);
    },
  };

  addController(controller: IAvatarController): this {
    this.controllers.set(controller.id, controller);
    controller.attach(this);
    return this;
  }

  removeController(controllerId: string): this {
    const ctrl = this.controllers.get(controllerId);
    if (ctrl) {
      ctrl.detach();
      this.controllers.delete(controllerId);
    }
    return this;
  }

  getController<T extends IAvatarController>(controllerId: string): T | undefined {
    return this.controllers.get(controllerId) as T | undefined;
  }

  update(contextOrTime: UpdateContext | number): void {
    if (this.isDisposed) return;

    const context: UpdateContext =
      typeof contextOrTime === 'number'
        ? { time: contextOrTime, deltaTime: 0.016, frame: 0 }
        : contextOrTime;

    this.renderContext.time = context.time;
    this.renderContext.deltaTime = context.deltaTime;

    // 1. Update Controllers (Input, Gaze, Physics)
    for (const ctrl of this.controllers.values()) {
      ctrl.update(context);
    }

    // 2. Behaviors + preset selection (procedural motion pauses when animated is false)
    const isAnimated = this.animated !== false && this.renderContext.flags?.animated !== false;
    if (isAnimated) {
      this.stateMachine.update(context);
      this.stepPreset(context.deltaTime);
    }

    // 3. Timeline (dispatches due steps; pause / rate scale the mixer's time), then the mixer
    let mixerCtx = context;
    if (this.player) {
      const p = this.player;
      const d = p.playing ? p.update(context.deltaTime) : 0;
      if (!p.playing && p.finished) this.player = null;
      Object.assign(this.timelineCtx, context);
      this.timelineCtx.deltaTime = p.playing || p.finished ? d || context.deltaTime : 0;
      mixerCtx = this.timelineCtx;
    }
    const mixerRan = this.mixer.hasActive() && mixerCtx.deltaTime > 0;
    if (mixerRan) this.mixer.update(mixerCtx, this.scene);
    this.applyPreset(isAnimated, mixerRan);

    // 4. Update Active Morphing (A7: pooled scratch buffers, no per-frame clone)
    if (this.activeMorph) {
      this.activeMorph.elapsed += context.deltaTime;
      const t = Math.min(1.0, this.activeMorph.elapsed / this.activeMorph.duration);
      const nodeIds = Object.keys(this.activeMorph.toChannels);

      for (let i = 0; i < nodeIds.length; i++) {
        const nodeId = nodeIds[i]!;
        const targetValues = this.activeMorph.toChannels[nodeId]!;
        const node = this.scene.find(nodeId);
        const fromBuf = this.activeMorph.fromBuffers.get(nodeId);
        const tempBuf = this.activeMorph.scratch.get(nodeId);
        if (node && fromBuf && tempBuf) {
          tempBuf.copyFrom(fromBuf);
          tempBuf.setValues(targetValues);
          fromBuf.interpolate(tempBuf, t, node.channels);
        }
      }

      if (t >= 1.0) {
        for (const [, pool] of this.activeMorph.pools) {
          pool.clear();
        }
        this.activeMorph = null;
      }
    }

    // 5. Update Scene Graph hierarchy & transforms
    this.scene.update(context);
  }

  /** Switch the default preset (unknown presets are ignored with a dev warning). */
  apply(preset: string): void {
    if (!hasPreset(preset, this.descriptor.id)) {
      presetWarn(`unknown preset "${preset}" for family "${this.descriptor.id}"; ignored`);
      return;
    }
    this.stateMachine.apply(preset);
  }

  /** Follow the machine's effective preset and advance the preset layer. */
  private stepPreset(dt: number): void {
    const want = this.stateMachine.face.preset;
    if (want !== this.presets.preset && want !== this.presetMiss) {
      if (this.presets.set(want)) this.presetMiss = '';
      else {
        this.presetMiss = want;
        this.presets.set('neutral');
      }
    }
    this.presets.step(dt);
    // blink profile → the auto-blink controller
    const blink = this.controllers.get('auto-blink') as { rate?: number } | undefined;
    if (blink) blink.rate = this.presets.get(PRESET_BLINK_RATE) ?? 1;
  }

  /**
   * Preset deltas on top of the resting (config) values, after the mixer's
   * behavior clips (same blending as clips: additive offsets, multiplicative
   * scales). No allocation per frame; the config's base values never change.
   */
  private applyPreset(animated: boolean, mixerRan: boolean): void {
    const slots = this.presets.slots;
    const active = animated && (slots.length > 0 || this.presetVariants.length > 0);
    const presetMoved = this.presets.dirty;
    this.presets.dirty = false;
    // channels are re-derived from rest each frame (the mixer does it while it runs);
    // with no mixer, the reset + re-apply pair can be skipped together while the
    // preset's resolved values are unchanged (deltas accumulate onto current values)
    if (!mixerRan && (active || this.presetDirty || this.mixerRan) && (presetMoved || !this.presetApplied)) this.scene.root.traverse(this.resetNode);
    this.mixerRan = mixerRan;
    this.presetDirty = active;
    if (!active) {
      this.presetApplied = false;
      return;
    }
    if (!mixerRan && !presetMoved && this.presetApplied) return;
    this.presetApplied = true;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      const r = s.ref as PresetChannel;
      if (r.node && r.numeric) r.node.channels.applyChannelDelta(r.channel, s.value, 1);
    }
    for (let i = 0; i < this.presetVariants.length; i++) {
      const v = this.presetVariants[i]!;
      v.ref.node!.channels.applyChannelDelta(v.ref.channel, v.value, 1);
    }
  }

  private bindPresetPath(path: string): PresetChannel {
    const dot = path.lastIndexOf('.');
    const channel = path.slice(dot + 1);
    const node = dot > 0 ? this.scene.find(this.resolveNodeId(path.slice(0, dot))) ?? undefined : undefined;
    const def = node?.channels.schema[channel];
    return { node, channel, blend: def?.blendMode, numeric: def?.type === 'float' };
  }

  /** Neutral delta of a channel: 0 additive, 1 multiply, else its resting value. */
  private presetNeutral(slot: PresetSlot): number {
    const r = slot.ref as PresetChannel;
    if (!r.node) return slot.path === PRESET_BLINK_RATE ? 1 : 0;
    if (r.blend === 'multiply') return 1;
    if (r.blend === 'additive') return 0;
    const b = r.node.channels.getBase<number>(r.channel);
    return typeof b === 'number' ? b : 0;
  }

  render(): any {
    if (this.isDisposed) return null;
    const output = this.renderer.render(this.scene, this.renderContext);
    this.scene.root.clearDirty();
    return output;
  }

  /**
   * Play a scripted timeline of mixer clips (steps hand off from the live
   * channels; `seek` replays deterministically). Clip params: `speed`, `weight`.
   */
  playTimeline(timeline: AvatarTimeline): AvatarTimelinePlayer {
    this.player?.stop();
    const mixer = this.mixer;
    const restPreset = this.stateMachine.getState().defaultPreset;
    const speedOf = (name: string, p?: Record<string, unknown>) => (typeof p?.speed === 'number' && p.speed > 0 ? p.speed : (mixer.get(name)?.speed ?? 1));
    this.player = new AvatarTimelinePlayer(timeline, {
      durationOf: (name, p) => {
        const anim = mixer.get(name);
        return anim ? anim.duration / speedOf(name, p) : undefined;
      },
      behavior: (name, o) => {
        const speed = speedOf(name, o.params);
        mixer.play(name, { timeScale: speed, weight: typeof o.params?.weight === 'number' ? o.params.weight : undefined, end: o.end, offset: Math.max(0, o.offset) * speed, loop: false });
      },
      blinkPulse: () => {
        if (mixer.get('blink')) mixer.play('blink', { loop: false });
      },
      preset: (m) => this.apply(m),
      reset: () => {
        mixer.stopAll();
        this.stateMachine.reset(restPreset);
        this.presets.reset(this.stateMachine.face.preset);
      },
      step: (dt) => {
        this.timelineCtx.deltaTime = dt;
        this.stepPreset(dt);
        const ran = mixer.hasActive();
        if (ran) mixer.update(this.timelineCtx, this.scene);
        this.applyPreset(true, ran);
      },
    });
    return this.player;
  }

  stopTimeline(): void {
    this.player?.stop();
    this.player = null;
  }

  get timeline(): AvatarTimelinePlayer | null {
    return this.player;
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    for (const ctrl of this.controllers.values()) {
      ctrl.detach();
    }
    this.controllers.clear();

    this.renderer.dispose();
  }
}
