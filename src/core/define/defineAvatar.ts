import type { AvatarDescriptor, AvatarSetupContext } from '../types/AvatarDescriptor.ts';
import type { IAtom } from '../scenegraph/AtomNode.ts';
import type { DefinedAnimation } from './defineAnimation.ts';
import type { DefinedVariant } from './defineVariant.ts';
import type { SceneDecl } from './sceneBuilder.ts';
import type { ControllerFactory } from './controllerFactories.ts';
import { materializeDefinedAvatar } from './materializeAvatar.ts';
import { resolveAvatarDefinition } from './resolveAvatar.ts';
import type { ResolvedAvatarDefinition } from './resolveAvatar.ts';
import type { AvatarDefinition, AvatarRendererId } from '../types/AvatarDefinition.ts';
import type { RenderContext } from '../types/RenderContext.ts';
import type { PresetSpec } from '../preset/presets.ts';


export interface DefineAvatarInput {
  id: string;
  name?: string;
  /** Renderer this avatar targets (scene-graph avatars: 'svg', the default). */
  renderer?: AvatarRendererId;
  version?: string;
  canvas: { width: number; height: number; viewBox?: string };
  /** Prefix for scene node ids (default: avatar id). */
  nodePrefix?: string;
  defaultPaletteId?: string;
  defaultSeed?: string;
  atoms?: Record<string, IAtom>;
  scene?: SceneDecl[];
  animations?: DefinedAnimation[];
  variants?: DefinedVariant[];
  /** Presets of this family (`node.channel` paths), registered on materialization. */
  presets?: Record<string, PresetSpec>;
  /** Default (resting) preset (default 'neutral'). */
  preset?: string;
  controllers?: ControllerFactory[];
  /** Optional post-hook after core materialization (palette, product-only wiring). */
  setup?: (context: AvatarSetupContext) => void;
  generateFromSeed?: (seed: string) => Record<string, any>;
  generateDefs?: (theme: RenderContext['theme'], mode: RenderContext['mode']) => string;
}

export interface DefinedAvatar extends AvatarDescriptor {
  nodePrefix?: string;
  atoms?: Record<string, IAtom>;
  sceneDecl?: SceneDecl[];
  animations?: DefinedAnimation[];
  variants?: DefinedVariant[];
  presets?: Record<string, PresetSpec>;
  preset?: string;
  controllerFactories?: ControllerFactory[];
}

/**
 * Define an avatar — the one entry point for every family:
 *  - a scene-graph avatar (`canvas` + atoms/scene/animations; SVG / Canvas2D renderers, e.g. Consona), or
 *  - a parametric body avatar (`body` + eyes/accessories/behaviors; rendered by a 3D adapter such as
 *    `@consona/avatar/three`, e.g. Allie) — validated and resolved with defaults.
 */
export function defineAvatar(input: DefineAvatarInput): DefinedAvatar;
export function defineAvatar(input: AvatarDefinition | ResolvedAvatarDefinition): ResolvedAvatarDefinition;
export function defineAvatar(input: DefineAvatarInput | AvatarDefinition | ResolvedAvatarDefinition): DefinedAvatar | ResolvedAvatarDefinition {
  if (!('canvas' in input)) return resolveAvatarDefinition(input);
  const defined: DefinedAvatar = {
    id: input.id,
    name: input.name ?? input.id,
    version: input.version ?? '1.0.0',
    canvas: {
      width: input.canvas.width,
      height: input.canvas.height,
      viewBox: input.canvas.viewBox ?? `0 0 ${input.canvas.width} ${input.canvas.height}`,
    },
    defaultPaletteId: input.defaultPaletteId ?? 'default',
    defaultSeed: input.defaultSeed,
    nodePrefix: input.nodePrefix,
    atoms: input.atoms,
    sceneDecl: input.scene,
    animations: input.animations,
    variants: input.variants,
    presets: input.presets,
    preset: input.preset,
    controllerFactories: input.controllers,
    setup(context: AvatarSetupContext): void {
      materializeDefinedAvatar(defined, context);
      input.setup?.(context);
    },
    generateFromSeed: input.generateFromSeed,
    generateDefs: input.generateDefs,
  };
  return defined;
}
