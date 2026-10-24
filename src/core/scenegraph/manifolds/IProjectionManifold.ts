import { type IVector2D, Vector2D } from '../../math/Vector2D.ts';
import type { IVector3D } from '../../math/Vector3D.ts';

export interface ProjectedPointResult {
  visible: boolean;
  screenPosition: Vector2D;
  scaleX: number;
  scaleY: number;
  tiltDeg: number;
  opacity: number;
  depthZ: number;
  surfaceNormal: IVector3D;
  transformMatrix?: { a: number; b: number; c: number; d: number };
  svgTransform?: string;
  parallaxOffset?: Vector2D;
}

export interface ProjectOptions {
  relX: number;
  relY: number;
  width: number;
  height: number;
  tiltDeg?: number;
  rotation?: [number, number, number]; // Euler angles [pitch, yaw, roll] in radians
  planeOffset?: [number, number];
  baseOpacity?: number;
  depthScale?: number;
  horizonMarginRatio?: number;
}

export interface IProjectionManifold {
  readonly type: string;
  project(options: ProjectOptions): ProjectedPointResult;
}
