import { hypot2 } from '../../../core/math/hypot.ts';
import type { IAtom, AtomNode } from '../../../core/scenegraph/AtomNode.ts';
import { type ChannelSchemaMap, defineChannel } from '../../../core/channel/ChannelSchema.ts';
import { ChannelBuffer } from '../../../core/channel/ChannelBuffer.ts';
import type { RenderContext } from '../../../core/types/RenderContext.ts';
import { formatCoord } from '../../../core/math/Bezier.ts';
import { lerpColor } from '../../../core/channel/Interpolators.ts';
import { clamp } from '../../../core/math/Interpolation.ts';

export type ConsonaHeadShape =
  | 'circle'
  | 'square'
  | 'squircle'
  | 'egg'
  | 'diamond'
  | 'capsule'
  | 'pear'
  | 'hexagon'
  | 'pillHorizontal'
  | 'pillVertical'
  | 'arch'
  | 'triangle'
  | 'heart'
  | 'star';

export const ConsonaHeadSchema: ChannelSchemaMap = {
  shape: defineChannel<string>({ name: 'shape', type: 'enum', defaultValue: 'circle', blendMode: 'override' }),
  width: defineChannel<number>({ name: 'width', type: 'float', defaultValue: 78, blendMode: 'multiply' }),
  height: defineChannel<number>({ name: 'height', type: 'float', defaultValue: 78, blendMode: 'multiply' }),
  roundness: defineChannel<number>({ name: 'roundness', type: 'float', defaultValue: 0.85, blendMode: 'additive' }),
  scaleX: defineChannel<number>({ name: 'scaleX', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  scaleY: defineChannel<number>({ name: 'scaleY', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  xOffset: defineChannel<number>({ name: 'xOffset', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  yOffset: defineChannel<number>({ name: 'yOffset', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  surfaceShadow: defineChannel<boolean>({ name: 'surfaceShadow', type: 'boolean', defaultValue: false, blendMode: 'override' }),
  color: defineChannel<string>({ name: 'color', type: 'color', defaultValue: '', blendMode: 'override' }),
  shading3D: defineChannel<boolean>({ name: 'shading3D', type: 'boolean', defaultValue: true, blendMode: 'override' }),
};

function buildRoundedPolygonPath(
  vertices: { x: number; y: number }[],
  radius: number | ((idx: number) => number)
): string {
  const n = vertices.length;
  if (n < 3) return '';

  const entries: {
    pIn: { x: number; y: number };
    pOut: { x: number; y: number };
    v: { x: number; y: number };
  }[] = [];

  for (let i = 0; i < n; i++) {
    const vPrev = vertices[(i - 1 + n) % n]!;
    const vCurr = vertices[i]!;
    const vNext = vertices[(i + 1) % n]!;

    const dPrev = { x: vPrev.x - vCurr.x, y: vPrev.y - vCurr.y };
    const lenPrev = hypot2(dPrev.x, dPrev.y);
    const uPrev = lenPrev > 0 ? { x: dPrev.x / lenPrev, y: dPrev.y / lenPrev } : { x: 0, y: 0 };

    const dNext = { x: vNext.x - vCurr.x, y: vNext.y - vCurr.y };
    const lenNext = hypot2(dNext.x, dNext.y);
    const uNext = lenNext > 0 ? { x: dNext.x / lenNext, y: dNext.y / lenNext } : { x: 0, y: 0 };

    const targetR = typeof radius === 'function' ? radius(i) : radius;
    const maxR = Math.min(lenPrev * 0.49, lenNext * 0.49);
    const effR = Math.max(0.5, Math.min(targetR, maxR));

    entries.push({
      v: vCurr,
      pIn: { x: vCurr.x + uPrev.x * effR, y: vCurr.y + uPrev.y * effR },
      pOut: { x: vCurr.x + uNext.x * effR, y: vCurr.y + uNext.y * effR },
    });
  }

  let d = `M ${formatCoord(entries[0]!.pOut.x)} ${formatCoord(entries[0]!.pOut.y)}`;
  for (let i = 1; i <= n; i++) {
    const curr = entries[i % n]!;
    d += ` L ${formatCoord(curr.pIn.x)} ${formatCoord(curr.pIn.y)}`;

    const cp1 = {
      x: curr.pIn.x + (curr.v.x - curr.pIn.x) * 0.552,
      y: curr.pIn.y + (curr.v.y - curr.pIn.y) * 0.552,
    };
    const cp2 = {
      x: curr.pOut.x + (curr.v.x - curr.pOut.x) * 0.552,
      y: curr.pOut.y + (curr.v.y - curr.pOut.y) * 0.552,
    };

    d += ` C ${formatCoord(cp1.x)} ${formatCoord(cp1.y)}, ${formatCoord(cp2.x)} ${formatCoord(cp2.y)}, ${formatCoord(curr.pOut.x)} ${formatCoord(curr.pOut.y)}`;
  }
  d += ' Z';
  return d;
}

export function generateHeadShapePath(
  shape: string,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  roundness: number
): string {
  switch (shape) {
    case 'circle': {
      const k = 0.55228475;
      const krX = halfW * k;
      const krY = halfH * k;
      return (
        `M ${formatCoord(cx)} ${formatCoord(cy - halfH)} ` +
        `C ${formatCoord(cx + krX)} ${formatCoord(cy - halfH)}, ${formatCoord(cx + halfW)} ${formatCoord(cy - krY)}, ${formatCoord(cx + halfW)} ${formatCoord(cy)} ` +
        `C ${formatCoord(cx + halfW)} ${formatCoord(cy + krY)}, ${formatCoord(cx + krX)} ${formatCoord(cy + halfH)}, ${formatCoord(cx)} ${formatCoord(cy + halfH)} ` +
        `C ${formatCoord(cx - krX)} ${formatCoord(cy + halfH)}, ${formatCoord(cx - halfW)} ${formatCoord(cy + krY)}, ${formatCoord(cx - halfW)} ${formatCoord(cy)} ` +
        `C ${formatCoord(cx - halfW)} ${formatCoord(cy - krY)}, ${formatCoord(cx - krX)} ${formatCoord(cy - halfH)}, ${formatCoord(cx)} ${formatCoord(cy - halfH)} Z`
      );
    }

    case 'squircle':
    case 'square': {
      const maxCornerR = Math.min(halfW, halfH) * 0.98;
      const cornerR = maxCornerR * clamp(roundness, 0.0, 1.0);
      const k = cornerR * 0.55228475;

      return (
        `M ${formatCoord(cx - halfW + cornerR)} ${formatCoord(cy - halfH)} ` +
        `L ${formatCoord(cx + halfW - cornerR)} ${formatCoord(cy - halfH)} ` +
        `C ${formatCoord(cx + halfW - cornerR + k)} ${formatCoord(cy - halfH)}, ${formatCoord(cx + halfW)} ${formatCoord(cy - halfH + cornerR - k)}, ${formatCoord(cx + halfW)} ${formatCoord(cy - halfH + cornerR)} ` +
        `L ${formatCoord(cx + halfW)} ${formatCoord(cy + halfH - cornerR)} ` +
        `C ${formatCoord(cx + halfW)} ${formatCoord(cy + halfH - cornerR + k)}, ${formatCoord(cx + halfW - cornerR + k)} ${formatCoord(cy + halfH)}, ${formatCoord(cx + halfW - cornerR)} ${formatCoord(cy + halfH)} ` +
        `L ${formatCoord(cx - halfW + cornerR)} ${formatCoord(cy + halfH)} ` +
        `C ${formatCoord(cx - halfW + cornerR - k)} ${formatCoord(cy + halfH)}, ${formatCoord(cx - halfW)} ${formatCoord(cy + halfH - cornerR + k)}, ${formatCoord(cx - halfW)} ${formatCoord(cy + halfH - cornerR)} ` +
        `L ${formatCoord(cx - halfW)} ${formatCoord(cy - halfH + cornerR)} ` +
        `C ${formatCoord(cx - halfW)} ${formatCoord(cy - halfH + cornerR - k)}, ${formatCoord(cx - halfW + cornerR - k)} ${formatCoord(cy - halfH)}, ${formatCoord(cx - halfW + cornerR)} ${formatCoord(cy - halfH)} Z`
      );
    }

    case 'pillHorizontal':
    case 'capsule': {
      const hw = halfW * 1.05;
      const hh = halfH * 0.65;
      const r = hh;
      const kr = r * 0.55228475;
      const flatW = hw - r;
      const yCenter = cy;

      return (
        `M ${formatCoord(cx - flatW)} ${formatCoord(yCenter - hh)} ` +
        `L ${formatCoord(cx + flatW)} ${formatCoord(yCenter - hh)} ` +
        `C ${formatCoord(cx + flatW + kr)} ${formatCoord(yCenter - hh)}, ${formatCoord(cx + hw)} ${formatCoord(yCenter - kr)}, ${formatCoord(cx + hw)} ${formatCoord(yCenter)} ` +
        `C ${formatCoord(cx + hw)} ${formatCoord(yCenter + kr)}, ${formatCoord(cx + flatW + kr)} ${formatCoord(yCenter + hh)}, ${formatCoord(cx + flatW)} ${formatCoord(yCenter + hh)} ` +
        `L ${formatCoord(cx - flatW)} ${formatCoord(yCenter + hh)} ` +
        `C ${formatCoord(cx - flatW - kr)} ${formatCoord(yCenter + hh)}, ${formatCoord(cx - hw)} ${formatCoord(yCenter + kr)}, ${formatCoord(cx - hw)} ${formatCoord(yCenter)} ` +
        `C ${formatCoord(cx - hw)} ${formatCoord(yCenter - kr)}, ${formatCoord(cx - flatW - kr)} ${formatCoord(yCenter - hh)}, ${formatCoord(cx - flatW)} ${formatCoord(yCenter - hh)} Z`
      );
    }

    case 'pillVertical': {
      const hw = halfW * 0.75;
      const hh = halfH * 1.05;
      const r = hw;
      const kr = r * 0.55228475;
      const flatH = hh - r;

      return (
        `M ${formatCoord(cx)} ${formatCoord(cy - hh)} ` +
        `C ${formatCoord(cx + kr)} ${formatCoord(cy - hh)}, ${formatCoord(cx + hw)} ${formatCoord(cy - hh + kr)}, ${formatCoord(cx + hw)} ${formatCoord(cy - flatH)} ` +
        `L ${formatCoord(cx + hw)} ${formatCoord(cy + flatH)} ` +
        `C ${formatCoord(cx + hw)} ${formatCoord(cy + hh - kr)}, ${formatCoord(cx + kr)} ${formatCoord(cy + hh)}, ${formatCoord(cx)} ${formatCoord(cy + hh)} ` +
        `C ${formatCoord(cx - kr)} ${formatCoord(cy + hh)}, ${formatCoord(cx - hw)} ${formatCoord(cy + hh - kr)}, ${formatCoord(cx - hw)} ${formatCoord(cy + flatH)} ` +
        `L ${formatCoord(cx - hw)} ${formatCoord(cy - flatH)} ` +
        `C ${formatCoord(cx - hw)} ${formatCoord(cy - hh + kr)}, ${formatCoord(cx - kr)} ${formatCoord(cy - hh)}, ${formatCoord(cx)} ${formatCoord(cy - hh)} Z`
      );
    }

    case 'egg':
    case 'pear': {
      const topY = cy - halfH;
      const bottomY = cy + halfH * 0.98;
      const waistY = cy + halfH * 0.18;
      const rxTop = halfW * 0.62;
      const rxBottom = halfW * 0.96;
      const kTop = rxTop * 0.55228475;
      const kBottom = rxBottom * 0.55228475;

      return (
        `M ${formatCoord(cx)} ${formatCoord(topY)} ` +
        `C ${formatCoord(cx + kTop)} ${formatCoord(topY)}, ${formatCoord(cx + rxBottom)} ${formatCoord(waistY - halfH * 0.50)}, ${formatCoord(cx + rxBottom)} ${formatCoord(waistY)} ` +
        `C ${formatCoord(cx + rxBottom)} ${formatCoord(waistY + kBottom)}, ${formatCoord(cx + kBottom)} ${formatCoord(bottomY)}, ${formatCoord(cx)} ${formatCoord(bottomY)} ` +
        `C ${formatCoord(cx - kBottom)} ${formatCoord(bottomY)}, ${formatCoord(cx - rxBottom)} ${formatCoord(waistY + kBottom)}, ${formatCoord(cx - rxBottom)} ${formatCoord(waistY)} ` +
        `C ${formatCoord(cx - rxBottom)} ${formatCoord(waistY - halfH * 0.50)}, ${formatCoord(cx - kTop)} ${formatCoord(topY)}, ${formatCoord(cx)} ${formatCoord(topY)} Z`
      );
    }

    case 'arch': {
      const bottomR = 16 * clamp(roundness, 0.4, 1.4);
      const kBottom = bottomR * 0.55228475;

      return (
        `M ${formatCoord(cx)} ${formatCoord(cy - halfH * 0.98)} ` +
        `C ${formatCoord(cx + halfW * 0.72)} ${formatCoord(cy - halfH * 0.98)}, ${formatCoord(cx + halfW * 0.96)} ${formatCoord(cy - halfH * 0.22)}, ${formatCoord(cx + halfW * 0.96)} ${formatCoord(cy + halfH * 0.32)} ` +
        `L ${formatCoord(cx + halfW * 0.96)} ${formatCoord(cy + halfH * 0.95 - bottomR)} ` +
        `C ${formatCoord(cx + halfW * 0.96)} ${formatCoord(cy + halfH * 0.95 - bottomR + kBottom)}, ${formatCoord(cx + halfW * 0.96 - bottomR + kBottom)} ${formatCoord(cy + halfH * 0.95)}, ${formatCoord(cx + halfW * 0.96 - bottomR)} ${formatCoord(cy + halfH * 0.95)} ` +
        `L ${formatCoord(cx - halfW * 0.96 + bottomR)} ${formatCoord(cy + halfH * 0.95)} ` +
        `C ${formatCoord(cx - halfW * 0.96 + bottomR - kBottom)} ${formatCoord(cy + halfH * 0.95)}, ${formatCoord(cx - halfW * 0.96)} ${formatCoord(cy + halfH * 0.95 - bottomR + kBottom)}, ${formatCoord(cx - halfW * 0.96)} ${formatCoord(cy + halfH * 0.95 - bottomR)} ` +
        `L ${formatCoord(cx - halfW * 0.96)} ${formatCoord(cy + halfH * 0.32)} ` +
        `C ${formatCoord(cx - halfW * 0.96)} ${formatCoord(cy - halfH * 0.22)}, ${formatCoord(cx - halfW * 0.72)} ${formatCoord(cy - halfH * 0.98)}, ${formatCoord(cx)} ${formatCoord(cy - halfH * 0.98)} Z`
      );
    }

    case 'triangle': {
      const rX = halfW * 0.98;
      const rY = halfH * 0.98;
      const vertices: { x: number; y: number }[] = [];
      for (let i = 0; i < 3; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
        vertices.push({
          x: cx + rX * Math.cos(angle),
          y: cy + rY * Math.sin(angle) + halfH * 0.08,
        });
      }
      const cornerR = Math.min(halfW, halfH) * 0.38 * clamp(roundness, 0.4, 1.3);
      return buildRoundedPolygonPath(vertices, cornerR);
    }

    case 'heart': {
      const w = halfW * 2 * 0.98;
      const h = halfH * 2 * 0.98;
      const hw = w / 2;
      const hh = h / 2;
      const rFactor = clamp(roundness, 0.4, 1.3);
      const bottomR = 12 * rFactor;

      return (
        `M ${formatCoord(cx)} ${formatCoord(cy - hh * 0.38)} ` +
        `C ${formatCoord(cx - hw * 0.36)} ${formatCoord(cy - hh * 0.92)}, ${formatCoord(cx - hw)} ${formatCoord(cy - hh * 0.58)}, ${formatCoord(cx - hw)} ${formatCoord(cy - hh * 0.12)} ` +
        `C ${formatCoord(cx - hw)} ${formatCoord(cy + hh * 0.35)}, ${formatCoord(cx - hw * 0.42)} ${formatCoord(cy + hh * 0.72)}, ${formatCoord(cx - bottomR)} ${formatCoord(cy + hh * 0.92 - bottomR * 0.4)} ` +
        `Q ${formatCoord(cx)} ${formatCoord(cy + hh * 0.92)} ${formatCoord(cx + bottomR)} ${formatCoord(cy + hh * 0.92 - bottomR * 0.4)} ` +
        `C ${formatCoord(cx + hw * 0.42)} ${formatCoord(cy + hh * 0.72)}, ${formatCoord(cx + hw)} ${formatCoord(cy + hh * 0.35)}, ${formatCoord(cx + hw)} ${formatCoord(cy - hh * 0.12)} ` +
        `C ${formatCoord(cx + hw)} ${formatCoord(cy - hh * 0.58)}, ${formatCoord(cx + hw * 0.36)} ${formatCoord(cy - hh * 0.92)}, ${formatCoord(cx)} ${formatCoord(cy - hh * 0.38)} Z`
      );
    }

    case 'star': {
      const rOut = Math.min(halfW, halfH) * 1.16;
      const rIn = rOut * (0.58 + 0.04 * (1 - clamp(roundness, 0.2, 1.0)));
      const vertices: { x: number; y: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? rOut : rIn;
        vertices.push({
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        });
      }
      return buildRoundedPolygonPath(
        vertices,
        (idx) => (idx % 2 === 0 ? rOut * 0.26 * clamp(roundness, 0.4, 1.3) : rIn * 0.32 * clamp(roundness, 0.4, 1.3))
      );
    }

    case 'diamond': {
      const vertices: { x: number; y: number }[] = [
        { x: cx, y: cy - halfH },
        { x: cx + halfW, y: cy },
        { x: cx, y: cy + halfH },
        { x: cx - halfW, y: cy },
      ];
      const cornerR = Math.min(halfW, halfH) * 0.28 * clamp(roundness, 0.4, 1.3);
      return buildRoundedPolygonPath(vertices, cornerR);
    }

    case 'hexagon': {
      const r = Math.min(halfW, halfH) * 0.98;
      const vertices: { x: number; y: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = -Math.PI / 6 + (i * Math.PI) / 3;
        vertices.push({
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        });
      }
      const cornerR = r * 0.36 * clamp(roundness, 0.4, 1.3);
      return buildRoundedPolygonPath(vertices, cornerR);
    }

    default: {
      // Circle fallback
      return generateHeadShapePath('circle', cx, cy, halfW, halfH, roundness);
    }
  }
}

export const consonaHeadAtom: IAtom = {
  id: 'consona:head',
  type: 'head',
  zIndex: 10,
  schema: ConsonaHeadSchema,

  renderSvg(context: RenderContext, channels: ChannelBuffer, node: AtomNode): string {
    const canvas = context.canvas || { width: 100, height: 100 };
    const paletteKey = context.paletteId.replace(/[^a-zA-Z0-9_]/g, '_');

    const shape = channels.get<string>('shape') || 'circle';
    const width = (channels.get<number>('width') || 78) * (channels.get<number>('scaleX') || 1);
    const height = (channels.get<number>('height') || 78) * (channels.get<number>('scaleY') || 1);
    const roundness = channels.get<number>('roundness') ?? 0.85;
    const xOffset = channels.get<number>('xOffset') || 0;
    const yOffset = channels.get<number>('yOffset') || 0;
    const surfaceShadow = channels.get<boolean>('surfaceShadow') || false;
    const customColor = channels.get<string>('color');
    const shading3D = channels.get<boolean>('shading3D') !== false && !customColor;

    // Chassis uses world translation (full head width is too large for spherical limb math).
    // Face features (eyes) share the headGroup plane via projectLocal.
    const cx = 50 + xOffset + node.worldTransform.position[0];
    const cy = 48 + yOffset + node.worldTransform.position[1];
    const halfW = width / 2;
    const halfH = height / 2;

    const gradId = `consonaHeadGrad_${paletteKey}`;
    const filterId = `consonaHeadFilter_${paletteKey}`;
    const fillColor = shading3D ? `url(#${gradId})` : (customColor || context.theme?.headColor || '#E4E4E7');

    const pathD = generateHeadShapePath(shape, cx, cy, halfW, halfH, roundness);

    let shadowMarkup = '';
    if (surfaceShadow) {
      // Soft contact blob under the chassis — radial fade, not a hard/edgy disc
      const groundY = cy + halfH + 1.6;
      const rx = halfW * 0.78;
      const ry = Math.max(3.2, halfH * 0.085);
      shadowMarkup =
        `<ellipse id="head-ground-shadow" cx="${formatCoord(cx)}" cy="${formatCoord(groundY)}" ` +
        `rx="${formatCoord(rx)}" ry="${formatCoord(ry)}" ` +
        `fill="url(#consonaGroundShadowGrad)" filter="url(#consonaGroundShadowBlur)"/>`;
    }

    const filterAttr = shading3D ? ` filter="url(#${filterId})"` : '';
    // In-plane roll (spin/rotate z, shake tilt, gaze roll) turns the chassis about its
    // own centre. Only the mesh takes it: the ground shadow stays flat on the floor.
    const rollDeg = ((((node.worldTransform.rotation[2] * 180) / Math.PI) % 360) + 540) % 360 - 180;
    const rollAttr = Math.abs(rollDeg) > 0.01
      ? ` transform="rotate(${formatCoord(rollDeg)} ${formatCoord(cx)} ${formatCoord(cy)})"`
      : '';
    const mainMesh = `<path id="head-mesh" d="${pathD}" fill="${fillColor}"${filterAttr}${rollAttr}/>`;

    return `${shadowMarkup}${mainMesh}`;
  },
};
