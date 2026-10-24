import type { IRenderer, RendererType } from '../../core/renderers/IRenderer.ts';
import { SceneGraph } from '../../core/scenegraph/SceneGraph.ts';
import type { RenderContext } from '../../core/types/RenderContext.ts';
import type { AvatarDescriptor } from '../../core/types/AvatarDescriptor.ts';

/**
 * Canvas2DRenderer: Fallback / high-density canvas 2D renderer.
 */
export class Canvas2DRenderer implements IRenderer {
  readonly type: RendererType = 'canvas-2d';

  private container: HTMLElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private descriptor?: AvatarDescriptor;

  initialize(container: HTMLElement | null, descriptor: AvatarDescriptor): void {
    this.container = container;
    this.descriptor = descriptor;

    if (!container || typeof document === 'undefined') return;

    this.canvasElement = document.createElement('canvas');
    const canvasConfig = descriptor.canvas;
    this.canvasElement.width = canvasConfig.width * (window.devicePixelRatio || 1);
    this.canvasElement.height = canvasConfig.height * (window.devicePixelRatio || 1);
    this.canvasElement.style.width = '100%';
    this.canvasElement.style.height = '100%';

    this.ctx = this.canvasElement.getContext('2d');

    container.innerHTML = '';
    container.appendChild(this.canvasElement);
  }

  render(scene: SceneGraph, context: RenderContext): void {
    if (!this.ctx || !this.canvasElement) return;

    const ctx = this.ctx;
    const w = this.canvasElement.width;
    const h = this.canvasElement.height;

    ctx.clearRect(0, 0, w, h);

    const renderList = scene.getRenderList();
    for (let i = 0; i < renderList.length; i++) {
      const atomNode = renderList[i]!;
      if (!atomNode.worldVisible || atomNode.worldOpacity <= 0) continue;
      atomNode.renderCanvas2D(ctx, context);
    }
  }

  dispose(): void {
    if (this.canvasElement) {
      this.canvasElement.remove();
    }
    this.canvasElement = null;
    this.ctx = null;
    this.container = null;
    this.descriptor = undefined;
  }
}
