import type { IAvatarController } from '../controllers/IAvatarController.ts';
import { GazeController, type LookAtControllerConfig } from '../controllers/gaze.ts';
import { PeriodicTriggerController } from '../controllers/PeriodicTriggerController.ts';
import type { AvatarInstance } from '../engine/AvatarInstance.ts';

export interface ControllerContext {
  avatarId: string;
  nodePrefix: string;
  /** Resolve a local scene id against nodePrefix (pass-through if already qualified). */
  qualify: (localId: string) => string;
  instance: AvatarInstance;
}

export type ControllerFactory = (ctx: ControllerContext) => IAvatarController;

function qualifyId(prefix: string, localId: string): string {
  if (localId.includes(':')) return localId;
  return `${prefix}:${localId}`;
}

export function createControllerContext(
  avatarId: string,
  nodePrefix: string,
  instance: AvatarInstance
): ControllerContext {
  return {
    avatarId,
    nodePrefix,
    instance,
    qualify: (localId) => qualifyId(nodePrefix, localId),
  };
}

/**
 * Pointer → channel look-at. Bindings are opaque node/channel ids supplied by the avatar.
 */
export function lookAt(config: LookAtControllerConfig): ControllerFactory {
  return (ctx) => {
    const b = config.bindings;
    return new GazeController({
      mode: 'eyes',
      ...config,
      bindings: {
        ...b,
        eyeNodeId: ctx.qualify(b.eyeNodeId),
        headGroupNodeId: ctx.qualify(b.headGroupNodeId),
        squashNodeId: b.squashNodeId ? ctx.qualify(b.squashNodeId) : undefined,
      },
    });
  };
}

export interface PeriodicPlayOptions {
  id: string;
  /** Animation name to play on each trigger */
  animation: string;
  minInterval?: number;
  maxInterval?: number;
}

/** Generic interval trigger that plays a named animation — avatar-agnostic. */
export function periodicPlay(options: PeriodicPlayOptions): ControllerFactory {
  return () =>
    new PeriodicTriggerController({
      id: options.id,
      minInterval: options.minInterval,
      maxInterval: options.maxInterval,
      onTrigger: (inst) => {
        inst.mixer.play(options.animation);
      },
    });
}
