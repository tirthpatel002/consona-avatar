import type { IAtom, AtomNode } from '../../../../core/scenegraph/AtomNode.ts';
import { type ChannelSchemaMap, defineChannel } from '../../../../core/channel/ChannelSchema.ts';
import { ChannelBuffer } from '../../../../core/channel/ChannelBuffer.ts';
import type { RenderContext } from '../../../../core/types/RenderContext.ts';
import { formatCoord } from '../../../../core/math/Bezier.ts';
import { clamp } from '../../../../core/math/Interpolation.ts';

export interface RasterAssetAtomOptions {
  id: string;
  imageUrl: string;
  name?: string;
  zIndex?: number;
  anchorSocket?: 'socket_forehead' | 'socket_eyes_bridge' | 'custom';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scale?: number;
  rotationDeg?: number;
  opacity?: number;
  parallaxDepth?: number;
}

export function createRasterAssetAtom(options: RasterAssetAtomOptions): IAtom {
  const schema: ChannelSchemaMap = {
    x: defineChannel<number>({ name: 'x', type: 'float', defaultValue: options.x ?? 50, blendMode: 'additive' }),
    y: defineChannel<number>({ name: 'y', type: 'float', defaultValue: options.y ?? 50, blendMode: 'additive' }),
    width: defineChannel<number>({ name: 'width', type: 'float', defaultValue: options.width ?? 40, blendMode: 'multiply' }),
    height: defineChannel<number>({ name: 'height', type: 'float', defaultValue: options.height ?? 40, blendMode: 'multiply' }),
    scale: defineChannel<number>({ name: 'scale', type: 'float', defaultValue: options.scale ?? 1.0, blendMode: 'multiply' }),
    rotationDeg: defineChannel<number>({ name: 'rotationDeg', type: 'float', defaultValue: options.rotationDeg ?? 0, blendMode: 'additive' }),
    opacity: defineChannel<number>({ name: 'opacity', type: 'float', defaultValue: options.opacity ?? 1.0, blendMode: 'multiply' }),
    imageUrl: defineChannel<string>({ name: 'imageUrl', type: 'string', defaultValue: options.imageUrl, blendMode: 'override' }),
    anchorSocket: defineChannel<string>({ name: 'anchorSocket', type: 'enum', defaultValue: options.anchorSocket ?? 'custom', blendMode: 'override' }),
  };

  return {
    id: options.id,
    type: 'raster-asset',
    zIndex: options.zIndex ?? 40,
    schema,

    renderSvg(context: RenderContext, channels: ChannelBuffer, node: AtomNode): string {
      const { canvas } = context;
      let posX = channels.get<number>('x') ?? 50;
      let posY = channels.get<number>('y') ?? 50;
      const socket = channels.get<string>('anchorSocket');

      if (socket === 'socket_forehead') {
        posX = (canvas?.width ?? 100) / 2;
        posY = 18;
      } else if (socket === 'socket_eyes_bridge') {
        posX = (canvas?.width ?? 100) / 2;
        posY = 44;
      }

      const w = channels.get<number>('width') ?? 40;
      const h = channels.get<number>('height') ?? 40;

      const proj = node.projectLocal({
        relX: posX - 50,
        relY: posY - 48,
        width: w,
        height: h,
        tiltDeg: channels.get<number>('rotationDeg') ?? 0,
        baseOpacity: channels.get<number>('opacity') ?? 1.0,
      });

      if (proj && !proj.visible) return '';

      const finalPos = proj ? proj.screenPosition : { x: posX, y: posY };
      const scale = (channels.get<number>('scale') ?? 1.0) * (proj?.scaleX ?? 1.0);
      const rotDeg = proj ? proj.tiltDeg : (channels.get<number>('rotationDeg') ?? 0);
      const opacity = proj ? proj.opacity : (channels.get<number>('opacity') ?? 1.0);

      const transform = `translate(${formatCoord(finalPos.x)}, ${formatCoord(finalPos.y)}) rotate(${formatCoord(rotDeg)}) scale(${formatCoord(scale)})`;
      const imageUrl = channels.get<string>('imageUrl');

      return `<image id="${options.id}" href="${imageUrl}" x="${formatCoord(-w / 2)}" y="${formatCoord(-h / 2)}" width="${formatCoord(w)}" height="${formatCoord(h)}" transform="${transform}" opacity="${formatCoord(opacity)}"/>`;
    },
  };
}
