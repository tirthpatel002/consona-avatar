import type { AvatarAnchorName } from '../atom/atom.ts';
import type { ColorLike } from '../types/AvatarDefinition.ts';

/**
 * One-shot visual effects (renderer-agnostic): a short burst of sparkles for
 * a celebration, a soft ripple where a nudge taps the screen… Behaviors emit
 * them from cues (`BehaviorCue.effect`), hosts with `handle.emit({ type: 'effect', … })`;
 * the state machine queues the requests and the renderer drains them
 * (Three: the `effects` rig part, one instanced mesh per kind). Nothing is
 * simulated or drawn while no effect is alive.
 */
export type AvatarEffectKind = 'sparkles' | 'ripple' | (string & {});

export interface AvatarEffectRequest {
  kind: AvatarEffectKind;
  /** Particles (sparkles, default 18) / rings (ripple, default 1). */
  count?: number;
  /** Where it starts (default: 'head' for sparkles, 'hand' for ripple). */
  anchor?: AvatarAnchorName;
  /** Offset from the anchor (body units, body axes). */
  offset?: readonly [number, number, number];
  /** Spread / size scale (default 1). */
  scale?: number;
  /** Palette (default: soft gold / white / blush). */
  colors?: readonly ColorLike[];
  /** Seed of the burst (default: a running counter; deterministic per avatar). */
  seed?: number;
}

/** Pending effects kept for a renderer at most (older ones drop: nobody is drawing them). */
export const AVATAR_EFFECT_QUEUE_MAX = 8;

/** FIFO of effect requests between the state machine and the renderer (bounded, no per-frame work when empty). */
export class AvatarEffectQueue {
  private readonly items: AvatarEffectRequest[] = [];
  /** Bumped on every emit (renderers / tests can detect new requests numerically). */
  revision = 0;

  emit(request: AvatarEffectRequest): void {
    if (this.items.length >= AVATAR_EFFECT_QUEUE_MAX) this.items.shift();
    this.items.push(request);
    this.revision++;
  }

  get size(): number {
    return this.items.length;
  }

  /** Hand every pending request to `fn` (in order) and clear the queue. */
  drain(fn: (request: AvatarEffectRequest) => void): void {
    if (this.items.length === 0) return;
    for (let i = 0; i < this.items.length; i++) fn(this.items[i]!);
    this.items.length = 0;
  }

  clear(): void {
    this.items.length = 0;
  }
}
