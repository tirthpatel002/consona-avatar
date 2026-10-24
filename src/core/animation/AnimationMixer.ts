import type { Animation } from './Animation.ts';
import { ANIMATION_CROSSFADE, AnimationInstance, type PlayOptions } from './AnimationInstance.ts';
import { SceneGraph } from '../scenegraph/SceneGraph.ts';
import type { UpdateContext } from '../types/Lifecycle.ts';

/**
 * AnimationMixer: Multi-track animation playback and blending engine.
 */
export class AnimationMixer {
  private animations: Map<string, Animation> = new Map();
  private instances: Map<string, AnimationInstance> = new Map();
  private activeInstances: AnimationInstance[] = [];

  register(animation: Animation): this {
    this.animations.set(animation.name, animation);
    return this;
  }

  get(name: string): Animation | undefined {
    return this.animations.get(name);
  }

  getAnimationNames(): string[] {
    return Array.from(this.animations.keys());
  }

  isPlaying(name: string): boolean {
    const inst = this.instances.get(name);
    return Boolean(inst && inst.enabled && !inst.settling && inst.weight > 0 && this.activeInstances.includes(inst));
  }

  hasActive(): boolean {
    return this.activeInstances.some((inst) => inst.enabled || inst.weight > 0);
  }

  getInstance(animationOrName: Animation | string): AnimationInstance {
    const anim = typeof animationOrName === 'string' ? this.animations.get(animationOrName) : animationOrName;
    if (!anim) {
      throw new Error(`AnimationMixer: Animation "${animationOrName}" not found.`);
    }

    let inst = this.instances.get(anim.name);
    if (!inst) {
      inst = new AnimationInstance(anim);
      this.instances.set(anim.name, inst);
    }
    return inst;
  }

  /**
   * Play `name` on top of whatever is running (deltas are relative). A copy
   * that is still running is not rewound: it fades out (keeping its motion)
   * while the new run fades in.
   */
  play(name: string, options?: PlayOptions): AnimationInstance {
    let inst = this.getInstance(name);
    if (inst.enabled && this.activeInstances.includes(inst)) {
      inst.fadeOut(ANIMATION_CROSSFADE);
      inst = new AnimationInstance(inst.animation);
      this.instances.set(inst.animation.name, inst);
    }
    inst.play(options);
    if (!this.activeInstances.includes(inst)) {
      this.activeInstances.push(inst);
    }
    return inst;
  }

  stop(name?: string): this {
    if (name) {
      // the current run and any copy still fading out
      for (let i = this.activeInstances.length - 1; i >= 0; i--) {
        const inst = this.activeInstances[i]!;
        if (inst.animation.name !== name && this.instances.get(name) !== inst) continue;
        inst.stop();
        this.activeInstances.splice(i, 1);
      }
      this.instances.get(name)?.stop();
    } else {
      for (const inst of this.activeInstances) {
        inst.stop();
      }
      this.activeInstances = [];
    }
    return this;
  }

  stopAll(): this {
    return this.stop();
  }

  crossFade(fromName: string, toName: string, duration: number): void {
    const fromInst = this.instances.get(fromName);
    const toInst = this.getInstance(toName);

    if (fromInst) {
      fromInst.fadeOut(duration);
    }
    toInst.reset().fadeIn(duration);

    if (!this.activeInstances.includes(toInst)) {
      this.activeInstances.push(toInst);
    }
  }

  update(context: UpdateContext, scene: SceneGraph): void {
    const dt = context.deltaTime;
    if (dt <= 0) return;

    if (this.activeInstances.length === 0) return;

    scene.root.traverse((node) => {
      node.channels.resetToRestingState();
    });

    for (let i = this.activeInstances.length - 1; i >= 0; i--) {
      const inst = this.activeInstances[i];
      if (!inst) continue;
      inst.update(dt);
      if (!inst.enabled || inst.weight <= 0) {
        this.activeInstances.splice(i, 1);
      }
    }

    for (let i = 0; i < this.activeInstances.length; i++) {
      const inst = this.activeInstances[i]!;
      if (inst.weight <= 0 || !inst.enabled) continue;

      const anim = inst.animation;
      const weight = inst.weight;
      const time = inst.time;

      if (anim.evaluate) {
        const deltas = anim.evaluate(time, dt);
        if (deltas) {
          const mask = anim.nodeMask ? maskSet(anim.nodeMask) : null;
          for (const nodeId in deltas) {
            if (mask && !mask.has(nodeId)) continue;
            const node = scene.find(nodeId);
            if (node) {
              node.channels.applyDelta(deltas[nodeId]!, weight);
            }
          }
        }
      }

      if (anim.tracks && anim.tracks.length > 0) {
        const mask = anim.nodeMask ? maskSet(anim.nodeMask) : null;
        for (let t = 0; t < anim.tracks.length; t++) {
          const track = anim.tracks[t]!;
          if (mask && !mask.has(track.nodeId)) continue;
          const node = scene.find(track.nodeId);
          if (!node) continue;
          const val = track.evaluate(time);
          if (val !== undefined) {
            node.channels.applyChannelDelta(track.channelName, val, weight);
          }
        }
      }
    }
  }
}

/** `nodeMask` lookups as Sets, cached per mask array (rebuilt if its length changes). */
const maskSets = new WeakMap<readonly string[], { len: number; set: Set<string> }>();
function maskSet(mask: readonly string[]): Set<string> {
  let e = maskSets.get(mask);
  if (!e || e.len !== mask.length) maskSets.set(mask, (e = { len: mask.length, set: new Set(mask) }));
  return e.set;
}
