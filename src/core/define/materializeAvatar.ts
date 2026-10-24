import type { AvatarSetupContext } from '../types/AvatarDescriptor.ts';
import { registerPreset } from '../preset/presets.ts';
import type { DefinedAvatar } from './defineAvatar.ts';
import { buildScene } from './sceneBuilder.ts';
import { createControllerContext } from './controllerFactories.ts';

/**
 * Core materialization from a DefinedAvatar declaration:
 * scene graph, animation (behavior clip) registration, presets, controller factories.
 * Product-specific setup runs afterward as an optional post-hook.
 */
export function materializeDefinedAvatar(
  avatar: DefinedAvatar,
  context: AvatarSetupContext
): void {
  const instance = context.instance;
  if (!instance) return;

  const nodePrefix = avatar.nodePrefix ?? avatar.id;

  if (avatar.sceneDecl && avatar.atoms) {
    buildScene(instance.scene, {
      nodePrefix,
      atoms: avatar.atoms,
      scene: avatar.sceneDecl,
    });
  }

  const animations = avatar.animations;
  if (animations) {
    for (let i = 0; i < animations.length; i++) {
      instance.mixer.register(animations[i]!);
    }
  }

  if (avatar.presets) for (const id in avatar.presets) registerPreset(avatar.id, id, avatar.presets[id]!);
  if (avatar.preset) instance.stateMachine.apply(avatar.preset);

  if (avatar.controllerFactories && avatar.controllerFactories.length > 0) {
    const ctx = createControllerContext(avatar.id, nodePrefix, instance);
    for (let i = 0; i < avatar.controllerFactories.length; i++) {
      instance.addController(avatar.controllerFactories[i]!(ctx));
    }
  }
}
