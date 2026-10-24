import type { IAtom, AtomNode } from '../../../core/scenegraph/AtomNode.ts';
import { type ChannelSchemaMap, defineChannel } from '../../../core/channel/ChannelSchema.ts';
import { ChannelBuffer } from '../../../core/channel/ChannelBuffer.ts';
import type { RenderContext } from '../../../core/types/RenderContext.ts';
import { formatCoord } from '../../../core/math/Bezier.ts';
import { clamp } from '../../../core/math/Interpolation.ts';
import { getEyeShapeSvg, registerEyeShape } from '../../../core/face/eyes.ts';
import type { EyeSvgRenderer } from '../../../core/face/eyes.ts';

export type ConsonaEyeShape =
  | 'capsule'
  | 'dot'
  | 'archUp'
  | 'archDown'
  | 'line'
  | 'cross'
  | 'diamond'
  | 'star'
  | 'ring'
  | 'squircle'
  | 'halfPill'
  | 'heart'
  | string;

export type EyeTiltMode = 'mirrored' | 'parallel' | 'spatial3D' | 'independent';

export const ConsonaEyesSchema: ChannelSchemaMap = {
  shape: defineChannel<string>({ name: 'shape', type: 'enum', defaultValue: 'capsule', blendMode: 'override' }),
  spacing: defineChannel<number>({ name: 'spacing', type: 'float', defaultValue: 22, blendMode: 'additive' }),
  xOffset: defineChannel<number>({ name: 'xOffset', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  yOffset: defineChannel<number>({ name: 'yOffset', type: 'float', defaultValue: 44, blendMode: 'additive' }),
  zOffset: defineChannel<number>({ name: 'zOffset', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  width: defineChannel<number>({ name: 'width', type: 'float', defaultValue: 10.5, blendMode: 'multiply' }),
  height: defineChannel<number>({ name: 'height', type: 'float', defaultValue: 22.0, blendMode: 'multiply' }),
  scaleX: defineChannel<number>({ name: 'scaleX', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  scaleY: defineChannel<number>({ name: 'scaleY', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  scaleZ: defineChannel<number>({ name: 'scaleZ', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  rotateX: defineChannel<number>({ name: 'rotateX', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  rotateY: defineChannel<number>({ name: 'rotateY', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  rotateZ: defineChannel<number>({ name: 'rotateZ', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  openness: defineChannel<number>({ name: 'openness', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  leftOpenness: defineChannel<number>({ name: 'leftOpenness', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  rightOpenness: defineChannel<number>({ name: 'rightOpenness', type: 'float', defaultValue: 1.0, blendMode: 'multiply' }),
  tiltDeg: defineChannel<number>({ name: 'tiltDeg', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  gazeX: defineChannel<number>({ name: 'gazeX', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  gazeY: defineChannel<number>({ name: 'gazeY', type: 'float', defaultValue: 0, blendMode: 'additive' }),
  pointerX: defineChannel<number>({ name: 'pointerX', type: 'float', defaultValue: 0, blendMode: 'override' }),
  pointerY: defineChannel<number>({ name: 'pointerY', type: 'float', defaultValue: 0, blendMode: 'override' }),
  gazeExcursion: defineChannel<number>({ name: 'gazeExcursion', type: 'float', defaultValue: 12, blendMode: 'override' }),
  pupilEnabled: defineChannel<boolean>({ name: 'pupilEnabled', type: 'boolean', defaultValue: false, blendMode: 'override' }),
  pupilScale: defineChannel<number>({ name: 'pupilScale', type: 'float', defaultValue: 0.48, blendMode: 'multiply' }),
  pupilColor: defineChannel<string>({ name: 'pupilColor', type: 'color', defaultValue: '', blendMode: 'override' }),
  pupilGazeTracking: defineChannel<number>({ name: 'pupilGazeTracking', type: 'float', defaultValue: 0.80, blendMode: 'override' }),
  strokeWidth: defineChannel<number>({ name: 'strokeWidth', type: 'float', defaultValue: 0, blendMode: 'override' }),
  strokeColor: defineChannel<string>({ name: 'strokeColor', type: 'color', defaultValue: '', blendMode: 'override' }),
  bgMode: defineChannel<string>({ name: 'bgMode', type: 'enum', defaultValue: 'accent', blendMode: 'override' }),
  bgColor: defineChannel<string>({ name: 'bgColor', type: 'color', defaultValue: '', blendMode: 'override' }),
};

/** Consona's 2D eye shapes, registered in the core eye-shape registry (scoped to the Consona family). */
export const CONSONA_FAMILY = 'consona';
const consonaEyeSvg: Record<string, EyeSvgRenderer> = {
  dot: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const r = Math.min(halfW, halfH);
    return `<circle cx="${formatCoord(cx)}" cy="${formatCoord(cy)}" r="${formatCoord(r)}" fill="${color}"${strokeAttr}${transformAttr}/>`;
  },
  archUp: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const pathD = `M ${formatCoord(cx - halfW)} ${formatCoord(cy + halfH * 0.9)} Q ${formatCoord(cx)} ${formatCoord(cy - halfH * 0.9)}, ${formatCoord(cx + halfW)} ${formatCoord(cy + halfH * 0.9)}`;
    return `<path d="${pathD}" stroke="${color}" stroke-width="2.8" stroke-linecap="round" fill="none"${transformAttr}/>`;
  },
  archDown: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const pathD = `M ${formatCoord(cx - halfW)} ${formatCoord(cy - halfH * 0.9)} Q ${formatCoord(cx)} ${formatCoord(cy + halfH * 0.9)}, ${formatCoord(cx + halfW)} ${formatCoord(cy - halfH * 0.9)}`;
    return `<path d="${pathD}" stroke="${color}" stroke-width="2.8" stroke-linecap="round" fill="none"${transformAttr}/>`;
  },
  line: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    return `<line x1="${formatCoord(cx - halfW)}" y1="${formatCoord(cy)}" x2="${formatCoord(cx + halfW)}" y2="${formatCoord(cy)}" stroke="${color}" stroke-width="2.8" stroke-linecap="round"${transformAttr}/>`;
  },
  cross: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const pathD = `M ${formatCoord(cx - halfW)} ${formatCoord(cy)} H ${formatCoord(cx + halfW)} M ${formatCoord(cx)} ${formatCoord(cy - halfH)} V ${formatCoord(cy + halfH)}`;
    return `<path d="${pathD}" stroke="${color}" stroke-width="2.8" stroke-linecap="round"${transformAttr}/>`;
  },
  diamond: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const pathD = `M ${formatCoord(cx)} ${formatCoord(cy - halfH)} L ${formatCoord(cx + halfW)} ${formatCoord(cy)} L ${formatCoord(cx)} ${formatCoord(cy + halfH)} L ${formatCoord(cx - halfW)} ${formatCoord(cy)} Z`;
    return `<path d="${pathD}" fill="${color}"${strokeAttr}${transformAttr}/>`;
  },
  star: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const arm = Math.max(w * 1.05, h * 0.65) * Math.max(0.1, openness);
    const pathD = `M ${formatCoord(cx)} ${formatCoord(cy - arm)} Q ${formatCoord(cx)} ${formatCoord(cy)} ${formatCoord(cx + arm)} ${formatCoord(cy)} Q ${formatCoord(cx)} ${formatCoord(cy)} ${formatCoord(cx)} ${formatCoord(cy + arm)} Q ${formatCoord(cx)} ${formatCoord(cy)} ${formatCoord(cx - arm)} ${formatCoord(cy)} Q ${formatCoord(cx)} ${formatCoord(cy)} ${formatCoord(cx)} ${formatCoord(cy - arm)} Z`;
    return `<path d="${pathD}" fill="${color}"${strokeAttr}${transformAttr}/>`;
  },
  ring: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    return `<ellipse cx="${formatCoord(cx)}" cy="${formatCoord(cy)}" rx="${formatCoord(halfW)}" ry="${formatCoord(halfH)}" stroke="${color}" stroke-width="2.5" fill="none"${transformAttr}/>`;
  },
  squircle: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const r = Math.min(halfW, halfH) * 0.35;
    return `<rect x="${formatCoord(cx - halfW)}" y="${formatCoord(cy - halfH)}" width="${formatCoord(w)}" height="${formatCoord(currentH)}" rx="${formatCoord(r)}" ry="${formatCoord(r)}" fill="${color}"${strokeAttr}${transformAttr}/>`;
  },
  halfPill: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const pathD = `M ${formatCoord(cx - halfW)} ${formatCoord(cy - halfH)} H ${formatCoord(cx + halfW)} V ${formatCoord(cy)} A ${formatCoord(halfW)} ${formatCoord(halfH)} 0 0 1 ${formatCoord(cx - halfW)} ${formatCoord(cy)} Z`;
    return `<path d="${pathD}" fill="${color}"${strokeAttr}${transformAttr}/>`;
  },
  heart: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const size = Math.max(w * 1.15, h * 0.68) * Math.max(0.1, openness);
    const sw = size * 1.05;
    const sh = size * 1.0;
    const topCleftY = cy - sh * 0.22;
    const bottomTipY = cy + sh * 0.54;
    const pathD = `M ${formatCoord(cx)} ${formatCoord(topCleftY)} C ${formatCoord(cx - sw * 0.55)} ${formatCoord(cy - sh * 0.68)}, ${formatCoord(cx - sw * 0.62)} ${formatCoord(cy + sh * 0.08)}, ${formatCoord(cx)} ${formatCoord(bottomTipY)} C ${formatCoord(cx + sw * 0.62)} ${formatCoord(cy + sh * 0.08)}, ${formatCoord(cx + sw * 0.55)} ${formatCoord(cy - sh * 0.68)}, ${formatCoord(cx)} ${formatCoord(topCleftY)} Z`;
    return `<path d="${pathD}" fill="${color}"${strokeAttr}${transformAttr}/>`;
  },
  capsule: ({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr }) => {
    const rx = Math.min(halfW, halfH);
    return `<rect x="${formatCoord(cx - halfW)}" y="${formatCoord(cy - halfH)}" width="${formatCoord(w)}" height="${formatCoord(currentH)}" rx="${formatCoord(rx)}" ry="${formatCoord(rx)}" fill="${color}"${strokeAttr}${transformAttr}/>`;
  },
};
for (const [name, svg] of Object.entries(consonaEyeSvg)) registerEyeShape(name, { svg }, CONSONA_FAMILY);

function renderEyeShape(
  shape: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
  openness: number,
  color: string,
  transform?: string,
  stroke?: string,
  strokeW?: number
): string {
  const currentH = Math.max(1, h * Math.max(0.1, openness));
  const halfW = w / 2;
  const halfH = currentH / 2;
  const transformAttr = transform ? ` transform="${transform}"` : '';
  const strokeAttr = stroke && strokeW && strokeW > 0 ? ` stroke="${stroke}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"` : '';

  if (openness <= 0.1) {
    return `<line x1="${formatCoord(cx - halfW)}" y1="${formatCoord(cy)}" x2="${formatCoord(cx + halfW)}" y2="${formatCoord(cy)}" stroke="${stroke || color}" stroke-width="${Math.max(2.5, strokeW || 2.5)}" stroke-linecap="round"${transformAttr}/>`;
  }

  const render = getEyeShapeSvg(shape, CONSONA_FAMILY) ?? getEyeShapeSvg('capsule', CONSONA_FAMILY)!;
  return render({ cx, cy, w, h, currentH, halfW, halfH, openness, color, stroke, strokeW, transformAttr, strokeAttr });
}

export const consonaEyesAtom: IAtom = {
  id: 'consona:eyes',
  type: 'eyes',
  zIndex: 20,
  schema: ConsonaEyesSchema,

  renderSvg(context: RenderContext, channels: ChannelBuffer, node: AtomNode): string {
    const theme = context.theme || {};
    const eyeColor = theme.iris ? (Array.isArray(theme.iris) ? theme.iris[0] : theme.iris) : (theme.irisColor || theme.accent || '#18181B');
    const scleraColor = '#FFFFFF';

    const shape = channels.get<string>('shape') || 'capsule';
    const spacing = channels.get<number>('spacing') ?? 22;
    const xOffset = channels.get<number>('xOffset') ?? 0;
    const yOffset = channels.get<number>('yOffset') ?? 44;
    const width = (channels.get<number>('width') ?? 10.5) * (channels.get<number>('scaleX') ?? 1.0);
    const height = (channels.get<number>('height') ?? 22.0) * (channels.get<number>('scaleY') ?? 1.0);
    const globalOpenness = clamp(channels.get<number>('openness') ?? 1.0, 0, 1);
    const leftOpenness = clamp((channels.get<number>('leftOpenness') ?? 1.0) * globalOpenness, 0, 1);
    const rightOpenness = clamp((channels.get<number>('rightOpenness') ?? 1.0) * globalOpenness, 0, 1);
    const tiltDeg = channels.get<number>('tiltDeg') ?? 0;
    const tiltMode = channels.get<string>('tiltMode') || 'spatial3D';
    const gazeX = channels.get<number>('gazeX') ?? 0;
    const gazeY = channels.get<number>('gazeY') ?? 0;

    const pupilEnabled = channels.get<boolean>('pupilEnabled') ?? false;
    const pupilScale = channels.get<number>('pupilScale') ?? 0.48;

    let strokeWidth = channels.get<number>('strokeWidth') ?? 0;
    let strokeColor = channels.get<string>('strokeColor') || '';

    // Robust Eye Background Color Selection: 'white' | 'black' | 'accent' | 'softAccent' | 'contrast' | 'custom'
    const bgMode = channels.get<string>('bgMode') || (pupilEnabled ? 'white' : 'accent');
    const customBgColor = channels.get<string>('bgColor');

    let outerFillColor = '#FFFFFF';
    if (customBgColor && (bgMode === 'custom' || customBgColor.startsWith('#') || customBgColor.startsWith('rgb'))) {
      outerFillColor = customBgColor;
    } else {
      switch (bgMode) {
        case 'white':
          outerFillColor = '#FFFFFF';
          break;
        case 'black':
          outerFillColor = '#09090B';
          break;
        case 'accent':
          outerFillColor = theme.accent || (Array.isArray(theme.iris) ? theme.iris[0] : theme.iris) || '#3B82F6';
          break;
        case 'softAccent':
        case 'soft-accent':
        case 'accentSoft':
          outerFillColor = theme.accentSoft || theme.eyeBorderAlt || (Array.isArray(theme.head) ? theme.head[0] : undefined) || '#93C5FD';
          break;
        case 'contrast':
          outerFillColor = theme.highlight || theme.eyeBorderAlt || '#FFFFFF';
          break;
        default:
          outerFillColor = pupilEnabled
            ? (theme.sclera || '#FFFFFF')
            : (theme.accent || (Array.isArray(theme.iris) ? theme.iris[0] : theme.iris) || '#18181B');
          break;
      }
    }

    // Dynamic contrast pupil color if not explicitly provided
    let defaultPupilColor = '#000000';
    const isLightBg =
      outerFillColor === '#FFFFFF' ||
      outerFillColor.toLowerCase() === '#ffffff' ||
      bgMode === 'white' ||
      bgMode === 'softAccent';
    if (isLightBg) {
      defaultPupilColor = theme.pupil || (bgMode === 'softAccent' ? (theme.accent || '#000000') : '#000000');
    } else {
      defaultPupilColor = theme.highlight || '#FFFFFF';
    }
    const pupilColor = channels.get<string>('pupilColor') || defaultPupilColor;

    if (strokeWidth === 0 && !strokeColor && (outerFillColor === '#FFFFFF' || outerFillColor.toLowerCase() === '#ffffff')) {
      // Subtle definition border for white sclera
      strokeWidth = 0.8;
      strokeColor = theme.eyeBorder || '#CBD5E1';
    }

    // A3: core owns projection via node.projectLocal
    const halfSpacing = spacing / 2;

    const pointerX = channels.get<number>('pointerX') ?? (gazeX !== 0 ? Math.sign(gazeX) * Math.min(1, Math.abs(gazeX) / 12) : 0);
    const pointerY = channels.get<number>('pointerY') ?? (gazeY !== 0 ? Math.sign(gazeY) * Math.min(1, Math.abs(gazeY) / 12) : 0);
    const pupilGazeTracking = channels.get<number>('pupilGazeTracking') ?? 0.80;

    // Symmetrical, isotropic ocular travel from gaze excursion (1:1 X & Y)
    const eyeGazeShiftX = gazeX;
    const eyeGazeShiftY = gazeY;

    const leftRelX = -halfSpacing + xOffset + eyeGazeShiftX;
    const rightRelX = halfSpacing + xOffset + eyeGazeShiftX;
    const relY = yOffset - 48 + eyeGazeShiftY; // relative to face center origin (50, 48)

    let leftTilt = tiltDeg;
    let rightTilt = tiltMode === 'mirrored' ? -tiltDeg : tiltDeg;
    if (tiltMode === 'spatial3D') {
      const spatialTiltMod = (eyeGazeShiftX / 12) * 9.5 + (pointerX * pupilGazeTracking) * 4.5;
      leftTilt = tiltDeg - spatialTiltMod;
      rightTilt = tiltDeg - spatialTiltMod;
    }

    // Projection calculation (A3)
    let leftProj = node.projectLocal({
      relX: leftRelX,
      relY,
      width,
      height,
      tiltDeg: leftTilt,
      baseOpacity: 1,
    });

    let rightProj = node.projectLocal({
      relX: rightRelX,
      relY,
      width,
      height,
      tiltDeg: rightTilt,
      baseOpacity: 1,
    });

    const leftPos = leftProj ? leftProj.screenPosition : { x: 50 + leftRelX, y: 48 + relY };
    const rightPos = rightProj ? rightProj.screenPosition : { x: 50 + rightRelX, y: 48 + relY };

    let leftMarkup = '';
    let rightMarkup = '';

    // Render Left Eye
    if (!leftProj || leftProj.visible) {
      const leftSvg = renderEyeShape(
        shape,
        leftPos.x,
        leftPos.y,
        width * (leftProj?.scaleX ?? 1),
        height * (leftProj?.scaleY ?? 1),
        leftOpenness,
        outerFillColor,
        leftProj?.svgTransform,
        strokeColor,
        strokeWidth
      );

      let leftPupilSvg = '';
      if (pupilEnabled && leftOpenness > 0.1) {
        const pupilLimitX = (width * 0.5) * (1 - pupilScale * 0.5);
        const pupilLimitY = (height * 0.5) * (1 - pupilScale * 0.5);
        // Amplified responsive pupil tracking gain (snappy, expressive behavioral excursion)
        const pupilGain = pupilGazeTracking * 1.55;
        const rawShiftX = pointerX * pupilLimitX * pupilGain;
        const rawShiftY = pointerY * pupilLimitY * pupilGain;
        const pShiftX = Math.tanh(rawShiftX / Math.max(0.1, pupilLimitX * 0.90)) * pupilLimitX;
        const pShiftY = Math.tanh(rawShiftY / Math.max(0.1, pupilLimitY * 0.90)) * pupilLimitY;
        const pCx = leftPos.x + pShiftX + (leftProj?.parallaxOffset?.x ?? 0);
        const pCy = leftPos.y + pShiftY + (leftProj?.parallaxOffset?.y ?? 0);
        leftPupilSvg = renderEyeShape(
          shape,
          pCx,
          pCy,
          width * (leftProj?.scaleX ?? 1) * pupilScale,
          height * (leftProj?.scaleY ?? 1) * pupilScale,
          leftOpenness,
          pupilColor,
          leftProj?.svgTransform
        );
      }
      const leftOpacity = leftProj ? leftProj.opacity : 1.0;
      const leftOpacityAttr = leftOpacity < 0.999 ? ` opacity="${formatCoord(Math.max(0, leftOpacity))}"` : '';
      leftMarkup = `<g id="left-eye-compound"${leftOpacityAttr}>${leftSvg}${leftPupilSvg}</g>`;
    }

    // Render Right Eye
    if (!rightProj || rightProj.visible) {
      const rightSvg = renderEyeShape(
        shape,
        rightPos.x,
        rightPos.y,
        width * (rightProj?.scaleX ?? 1),
        height * (rightProj?.scaleY ?? 1),
        rightOpenness,
        outerFillColor,
        rightProj?.svgTransform,
        strokeColor,
        strokeWidth
      );

      let rightPupilSvg = '';
      if (pupilEnabled && rightOpenness > 0.1) {
        const pupilLimitX = (width * 0.5) * (1 - pupilScale * 0.5);
        const pupilLimitY = (height * 0.5) * (1 - pupilScale * 0.5);
        // Amplified responsive pupil tracking gain (snappy, expressive behavioral excursion)
        const pupilGain = pupilGazeTracking * 1.55;
        const rawShiftX = pointerX * pupilLimitX * pupilGain;
        const rawShiftY = pointerY * pupilLimitY * pupilGain;
        const pShiftX = Math.tanh(rawShiftX / Math.max(0.1, pupilLimitX * 0.90)) * pupilLimitX;
        const pShiftY = Math.tanh(rawShiftY / Math.max(0.1, pupilLimitY * 0.90)) * pupilLimitY;
        const pCx = rightPos.x + pShiftX + (rightProj?.parallaxOffset?.x ?? 0);
        const pCy = rightPos.y + pShiftY + (rightProj?.parallaxOffset?.y ?? 0);
        rightPupilSvg = renderEyeShape(
          shape,
          pCx,
          pCy,
          width * (rightProj?.scaleX ?? 1) * pupilScale,
          height * (rightProj?.scaleY ?? 1) * pupilScale,
          rightOpenness,
          pupilColor,
          rightProj?.svgTransform
        );
      }
      const rightOpacity = rightProj ? rightProj.opacity : 1.0;
      const rightOpacityAttr = rightOpacity < 0.999 ? ` opacity="${formatCoord(Math.max(0, rightOpacity))}"` : '';
      rightMarkup = `<g id="right-eye-compound"${rightOpacityAttr}>${rightSvg}${rightPupilSvg}</g>`;
    }

    return `<g id="consona-eyes-group">${leftMarkup}${rightMarkup}</g>`;
  },
};
