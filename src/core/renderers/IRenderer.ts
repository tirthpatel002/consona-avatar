import { SceneGraph } from '../scenegraph/SceneGraph.ts';
import type { RenderContext } from '../types/RenderContext.ts';
import type { AvatarDescriptor } from '../types/AvatarDescriptor.ts';

export type RendererType = 'retained-svg' | 'svg-string' | 'canvas-2d' | 'webgl';

/**
 * IRenderer: Universal renderer interface (Three.js / PixiJS style).
 */
export interface IRenderer {
  readonly type: RendererType;

  /**
   * Initializes the renderer with a target container (if DOM-based) and descriptor.
   */
  initialize(container: HTMLElement | null, descriptor: AvatarDescriptor): void;

  /**
   * Renders the current frame from the scene graph.
   */
  render(scene: SceneGraph, context: RenderContext): any;

  /**
   * Sets custom SVG defs markup (gradients, filters, etc.).
   */
  setDefs?(defsXml: string): void;

  /** The DOM element it draws into (DOM renderers), e.g. for pointer tracking. */
  getContainer?(): HTMLElement | null;

  /**
   * Cleans up resources, detaches DOM elements, clears caches.
   */
  dispose(): void;
}

/**
 * Body-avatar renderer kind ('webgl'): renders procedural body rigs from an
 * `AvatarDefinition` (see `AvatarDescriptor.bodyAvatar`) instead of the scene
 * graph. `AvatarInstance` drives it like any renderer: `render(scene, ctx)`
 * advances one frame using `ctx.deltaTime` / `ctx.time`.
 */
export interface BodyAvatarRenderer extends IRenderer {
  readonly type: 'webgl';
  readonly rendererKind: 'body-avatar';
}

export type RendererFactory = () => IRenderer;
const rendererFactories = new Map<string, RendererFactory>();

/** Register a renderer for `AvatarEngineConfig.renderer` (adapters register 'retained-svg', 'svg-string', 'canvas-2d', 'webgl', …). */
export function registerRendererFactory(type: RendererType | string, factory: RendererFactory): void {
  rendererFactories.set(type, factory);
}

export function getRendererFactory(type: string): RendererFactory | undefined {
  return rendererFactories.get(type);
}
