/**
 * SVG adapter: the retained (live DOM) and string (static / SSR) scene-graph
 * renderers. Importing it registers them as 'retained-svg' / 'svg-string'.
 */
import { registerRendererFactory } from '../../core/renderers/IRenderer.ts';
import { RetainedSvgRenderer } from './RetainedSvgRenderer.ts';
import { SvgStringRenderer } from './SvgStringRenderer.ts';

registerRendererFactory('retained-svg', () => new RetainedSvgRenderer());
registerRendererFactory('svg-string', () => new SvgStringRenderer());

export { RetainedSvgRenderer, SvgStringRenderer };
