/** Canvas 2D adapter: scene-graph renderer registered as 'canvas-2d'. */
import { registerRendererFactory } from '../../core/renderers/IRenderer.ts';
import { Canvas2DRenderer } from './Canvas2DRenderer.ts';

registerRendererFactory('canvas-2d', () => new Canvas2DRenderer());

export { Canvas2DRenderer };
