/**
 * Dynamic RenderContext provided to renderers, materials, and atom draw pipelines.
 * 100% agnostic to specific product anatomies or color keys.
 */

export interface RenderCanvasConfig {
  width: number;
  height: number;
  viewBox: string;
}

export interface RenderContext {
  canvas: RenderCanvasConfig;
  theme: Record<string, any>;
  paletteId: string;
  mode: 'light' | 'dark';
  time: number;
  deltaTime: number;
  pixelRatio?: number;
  seed?: string;
  flags?: Record<string, boolean | number | string>;
}
