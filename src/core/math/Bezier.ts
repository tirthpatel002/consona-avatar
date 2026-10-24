import { Vector2D, type IVector2D } from './Vector2D.ts';

/**
 * Parametric Bézier curve evaluation and SVG path string generation.
 */

export interface QuadraticBezierSegment {
  p0: IVector2D;
  p1: IVector2D;
  p2: IVector2D;
}

export interface CubicBezierSegment {
  p0: IVector2D;
  p1: IVector2D;
  p2: IVector2D;
  p3: IVector2D;
}

/**
 * Evaluates a quadratic Bézier curve at parameter t in [0, 1].
 */
export function evaluateQuadraticBezier(
  p0: IVector2D,
  p1: IVector2D,
  p2: IVector2D,
  t: number
): Vector2D {
  const u = 1 - t;
  const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
  const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
  return new Vector2D(x, y);
}

/**
 * Evaluates a cubic Bézier curve at parameter t in [0, 1].
 */
export function evaluateCubicBezier(
  p0: IVector2D,
  p1: IVector2D,
  p2: IVector2D,
  p3: IVector2D,
  t: number
): Vector2D {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
  const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;
  return new Vector2D(x, y);
}

/**
 * Rounds a floating point number to 3 decimal places for optimal SVG output.
 */
export function formatCoord(val: number): string {
  const rounded = Math.round(val * 1000) / 1000;
  return rounded.toString();
}

/**
 * Generates an SVG path string from quadratic curve points.
 */
export function quadraticToSvgPath(p0: IVector2D, p1: IVector2D, p2: IVector2D, close: boolean = false): string {
  return `M ${formatCoord(p0.x)} ${formatCoord(p0.y)} Q ${formatCoord(p1.x)} ${formatCoord(p1.y)} ${formatCoord(p2.x)} ${formatCoord(p2.y)}${close ? ' Z' : ''}`;
}

/**
 * Generates an SVG path string from cubic curve points.
 */
export function cubicToSvgPath(p0: IVector2D, p1: IVector2D, p2: IVector2D, p3: IVector2D, close: boolean = false): string {
  return `M ${formatCoord(p0.x)} ${formatCoord(p0.y)} C ${formatCoord(p1.x)} ${formatCoord(p1.y)} ${formatCoord(p2.x)} ${formatCoord(p2.y)} ${formatCoord(p3.x)} ${formatCoord(p3.y)}${close ? ' Z' : ''}`;
}
