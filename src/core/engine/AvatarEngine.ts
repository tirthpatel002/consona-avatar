import type { AvatarDescriptor, AvatarEngineConfig } from '../types/AvatarDescriptor.ts';
import { AvatarInstance } from './AvatarInstance.ts';
import { EngineTicker } from './EngineTicker.ts';
import type { UpdateContext } from '../types/Lifecycle.ts';
import type { PlayOptions } from '../animation/AnimationInstance.ts';

/**
 * AvatarEngine: Multi-avatar runtime orchestrator and registry.
 */
export type ScopeOverrides = Record<string, Record<string, any>>;

export class AvatarEngine {
  private descriptors: Map<string, AvatarDescriptor> = new Map();
  private instances: Map<string, AvatarInstance> = new Map();
  private ticker: EngineTicker;
  /** A8: named scopes applied to all instances after create/tick. */
  private scopes: Map<string, ScopeOverrides> = new Map();

  constructor() {
    this.ticker = EngineTicker.getShared();

    // Bind shared frame tick
    this.ticker.add(this.onFrameTick);
  }

  /**
   * Set or merge overrides for a named scope. Keys are short or qualified node ids → channel map.
   * Example: engine.scope('global', { 'my:node': { opacity: 0.5 } })
   */
  scope(name: string, overrides?: ScopeOverrides): ScopeOverrides | this {
    if (overrides === undefined) {
      return this.scopes.get(name) ?? {};
    }
    const prev = this.scopes.get(name) ?? {};
    const merged: ScopeOverrides = { ...prev };
    for (const nodeId of Object.keys(overrides)) {
      merged[nodeId] = { ...(prev[nodeId] ?? {}), ...overrides[nodeId] };
    }
    this.scopes.set(name, merged);
    this.applyScope(name);
    return this;
  }

  private applyScope(name: string): void {
    for (const instance of this.instances.values()) {
      this.applyScopeToInstance(instance, name);
    }
  }

  registerAvatar(descriptor: AvatarDescriptor): this {
    this.descriptors.set(descriptor.id, descriptor);
    return this;
  }

  registerDescriptor(descriptor: AvatarDescriptor): this {
    return this.registerAvatar(descriptor);
  }

  getAvatar(avatarId: string): AvatarDescriptor | undefined {
    return this.descriptors.get(avatarId);
  }

  getDescriptor(avatarId: string): AvatarDescriptor | undefined {
    return this.getAvatar(avatarId);
  }

  createInstance(
    id: string,
    avatarId: string,
    config?: Partial<AvatarEngineConfig>,
    container?: HTMLElement | null
  ): AvatarInstance {
    const descriptor = this.descriptors.get(avatarId);
    if (!descriptor) {
      throw new Error(`AvatarEngine: Avatar descriptor "${avatarId}" not registered.`);
    }

    if (this.instances.has(id)) {
      this.destroyInstance(id);
    }

    const instance = new AvatarInstance(id, descriptor, config, container);
    this.instances.set(id, instance);
    // Apply any active scopes to the new instance (avatar-agnostic)
    for (const scopeName of this.scopes.keys()) {
      this.applyScopeToInstance(instance, scopeName);
    }
    return instance;
  }

  private applyScopeToInstance(instance: AvatarInstance, name: string): void {
    const overrides = this.scopes.get(name);
    if (!overrides) return;
    for (const nodeId of Object.keys(overrides)) {
      const channels = overrides[nodeId]!;
      for (const channelName of Object.keys(channels)) {
        instance.channels.set(nodeId, channelName, channels[channelName]);
      }
    }
  }

  getInstance(id: string): AvatarInstance | undefined {
    return this.instances.get(id);
  }

  getAllInstances(): AvatarInstance[] {
    return Array.from(this.instances.values());
  }

  destroyInstance(id: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.dispose();
      this.instances.delete(id);
    }
  }

  tick(deltaTimeSeconds: number = 0.016): void {
    const context: UpdateContext = {
      time: performance.now() / 1000,
      deltaTime: deltaTimeSeconds,
      frame: 0,
    };
    this.onFrameTick(context);
  }

  /** Generic play — resolves when the one-shot finishes (or immediately if looping). */
  play(instanceId: string, animationName: string, options?: PlayOptions): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return Promise.reject(new Error(`AvatarEngine: instance "${instanceId}" not found`));
    }
    const behavior = instance.mixer.play(animationName, options);
    const looping = options?.loop ?? behavior.loop;
    if (looping) return Promise.resolve();
    return behavior.toPromise();
  }

  stop(instanceId: string, animationName?: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    instance.mixer.stop(animationName);
  }

  private onFrameTick = (context: UpdateContext): void => {

    for (const instance of this.instances.values()) {
      instance.update(context);
      instance.render();
    }

  };

  dispose(): void {
    this.ticker.remove(this.onFrameTick);
    for (const instance of this.instances.values()) {
      instance.dispose();
    }
    this.instances.clear();
  }

  destroy(): void {
    this.dispose();
  }
}

/**
 * Default shared AvatarEngine singleton.
 */
export const avatarEngine = new AvatarEngine();

