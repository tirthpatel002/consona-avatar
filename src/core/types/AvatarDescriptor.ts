import type { RenderCanvasConfig, RenderContext } from './RenderContext.ts';
import type { AvatarEngine } from '../engine/AvatarEngine.ts';
import type { AvatarInstance } from '../engine/AvatarInstance.ts';

/**
 * Forward declarations of core engine interfaces for setup context.
 */
export interface AvatarSetupContext {
  /** Owning engine (null while an instance is built standalone). */
  engine: AvatarEngine | null;
  instance: AvatarInstance;
}

/**
 * AvatarDescriptor: Immutable declaration/template of an avatar.
 * Defines dimensions, default palettes, setup registration hooks,
 * seed generators, and asset generators.
 */
export interface AvatarDescriptor {
  readonly id: string;
  readonly name?: string;
  readonly version?: string;
  readonly canvas: RenderCanvasConfig;
  readonly defaultPaletteId: string;
  readonly defaultSeed?: string;

  /**
   * Called when an instance of this avatar is created or loaded into the engine.
   * Registers all nodes, atoms, projection manifolds, default animation clips,
   * behaviors, and shaders/defs required by this avatar.
   */
  setup(context: AvatarSetupContext): void;

  /**
   * Optional PRNG seed-to-state generator.
   */
  generateFromSeed?(seed: string, options?: Record<string, any>): Record<string, any>;

  /**
   * Optional SVG defs (gradients, filters, markers) generator for SVG renderers.
   */
  generateDefs?(theme: RenderContext['theme'], mode: RenderContext['mode']): string;

  /**
   * Body-avatar definition (`AvatarDefinition`) for 'webgl' body-avatar
   * renderers (e.g. the Three stage): shown when the renderer initialises.
   */
  readonly bodyAvatar?: import('./AvatarDefinition.ts').AvatarDefinition;
}

/**
 * Generic configuration supplied when initializing an AvatarInstance.
 */
export interface AvatarEngineConfig {
  avatarId: string;
  paletteId?: string;
  seed?: string;
  mode?: 'light' | 'dark';
  renderer?: 'retained-svg' | 'svg-string' | 'canvas-2d' | 'webgl';
  interactive?: boolean;
  animated?: boolean;
  autoBlink?: boolean;
  channels?: Record<string, Record<string, any>>;
  flags?: Record<string, any>;
}
