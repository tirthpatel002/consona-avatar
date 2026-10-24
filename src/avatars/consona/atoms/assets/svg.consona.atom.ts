import type { IAtom, AtomNode } from '../../../../core/scenegraph/AtomNode.ts';
import { type ChannelSchemaMap, defineChannel } from '../../../../core/channel/ChannelSchema.ts';
import { ChannelBuffer } from '../../../../core/channel/ChannelBuffer.ts';
import type { RenderContext } from '../../../../core/types/RenderContext.ts';
import { formatCoord } from '../../../../core/math/Bezier.ts';
import { clamp } from '../../../../core/math/Interpolation.ts';

export interface SvgAssetAtomOptions {
  id: string;
  name?: string;
  zIndex?: number;
  svgUrl?: string;
  svgContent?: string;
  anchorSocket?: 'socket_forehead' | 'socket_eyes_bridge' | 'custom';
  x?: number;
  y?: number;
  scale?: number;
  rotationDeg?: number;
  opacity?: number;
  parallaxDepth?: number;
}

export function createSvgAssetAtom(options: SvgAssetAtomOptions): IAtom {
  const schema: ChannelSchemaMap = {
    x: defineChannel<number>({ name: 'x', type: 'float', defaultValue: options.x ?? 50, blendMode: 'additive' }),
    y: defineChannel<number>({ name: 'y', type: 'float', defaultValue: options.y ?? 30, blendMode: 'additive' }),
    scale: defineChannel<number>({ name: 'scale', type: 'float', defaultValue: options.scale ?? 1.0, blendMode: 'multiply' }),
    rotationDeg: defineChannel<number>({ name: 'rotationDeg', type: 'float', defaultValue: options.rotationDeg ?? 0, blendMode: 'additive' }),
    opacity: defineChannel<number>({ name: 'opacity', type: 'float', defaultValue: options.opacity ?? 1.0, blendMode: 'multiply' }),
    svgUrl: defineChannel<string>({ name: 'svgUrl', type: 'string', defaultValue: options.svgUrl ?? '', blendMode: 'override' }),
    svgContent: defineChannel<string>({ name: 'svgContent', type: 'string', defaultValue: options.svgContent ?? '', blendMode: 'override' }),
    anchorSocket: defineChannel<string>({ name: 'anchorSocket', type: 'enum', defaultValue: options.anchorSocket ?? 'custom', blendMode: 'override' }),
  };

  return {
    id: options.id,
    type: 'svg-asset',
    zIndex: options.zIndex ?? 45,
    schema,

    renderSvg(context: RenderContext, channels: ChannelBuffer, node: AtomNode): string {
      const { canvas, theme } = context;
      let posX = channels.get<number>('x') ?? 50;
      let posY = channels.get<number>('y') ?? 30;
      const socket = channels.get<string>('anchorSocket');

      if (socket === 'socket_forehead') {
        posX = (canvas?.width ?? 100) / 2;
        posY = 18;
      } else if (socket === 'socket_eyes_bridge') {
        posX = (canvas?.width ?? 100) / 2;
        posY = 44;
      }

      const proj = node.projectLocal({
        relX: posX - 50,
        relY: posY - 48,
        width: 50,
        height: 50,
        tiltDeg: channels.get<number>('rotationDeg') ?? 0,
        baseOpacity: channels.get<number>('opacity') ?? 1.0,
      });

      if (proj && !proj.visible) return '';

      const finalPos = proj ? proj.screenPosition : { x: posX, y: posY };
      const scale = (channels.get<number>('scale') ?? 1.0) * (proj?.scaleX ?? 1.0);
      const rotDeg = proj ? proj.tiltDeg : (channels.get<number>('rotationDeg') ?? 0);
      const opacity = proj ? proj.opacity : (channels.get<number>('opacity') ?? 1.0);

      const transform = `translate(${formatCoord(finalPos.x)} ${formatCoord(finalPos.y)}) rotate(${formatCoord(rotDeg)}) scale(${formatCoord(scale)})`;
      const svgUrl = channels.get<string>('svgUrl');
      const svgContent = channels.get<string>('svgContent');

      if (svgUrl) {
        return `<image id="${options.id}" href="${svgUrl}" x="-25" y="-25" width="50" height="50" transform="${transform}" opacity="${formatCoord(opacity)}"/>`;
      }

      if (svgContent) {
        return `<g id="${options.id}" transform="${transform}" opacity="${formatCoord(opacity)}">${svgContent}</g>`;
      }

      return `<g id="${options.id}" transform="${transform}" opacity="${formatCoord(opacity)}"><circle cx="0" cy="0" r="6" fill="${theme?.accent || '#00F0FF'}"/></g>`;
    },
  };
}
