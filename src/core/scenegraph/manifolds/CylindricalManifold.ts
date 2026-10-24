import { Vector2D } from '../../math/Vector2D.ts';
import { clamp, lerp } from '../../math/Interpolation.ts';
import { formatCoord } from '../../math/Bezier.ts';
import type { IProjectionManifold, ProjectOptions, ProjectedPointResult } from './IProjectionManifold.ts';

/**
 * CylindricalManifold: Embeds 2D elements onto a vertical cylinder surface (e.g. torso, limb).
 */
export class CylindricalManifold implements IProjectionManifold {
  readonly type = 'cylindrical';
  public originX: number;
  public originY: number;
  public radius: number;

  constructor(
    originX: number = 50,
    originY: number = 50,
    radius: number = 30
  ) {
    this.originX = originX;
    this.originY = originY;
    this.radius = radius;
  }

  project(options: ProjectOptions): ProjectedPointResult {
    const {
      relX,
      relY,
      width: w0 = 10,
      height: h0 = 10,
      tiltDeg = 0,
      rotation = [0, 0, 0],
      planeOffset = [0, 0],
      baseOpacity = 1.0,
      horizonMarginRatio = 0.5,
    } = options;

    const cylCx = this.originX + planeOffset[0];
    const cylCy = this.originY + planeOffset[1];
    const cylR = this.radius;

    const yaw = rotation[1] ?? 0;
    const roll = rotation[2] ?? 0;

    // Angle on cylinder
    const baseTheta = Math.asin(clamp(relX / cylR, -1, 1));
    const rotatedTheta = baseTheta + yaw;

    const x3 = Math.sin(rotatedTheta) * cylR;
    const z3 = Math.cos(rotatedTheta) * cylR;
    const y3 = relY;

    const horizonMargin = w0 * horizonMarginRatio;
    if (z3 < -horizonMargin) {
      return {
        visible: false,
        screenPosition: Vector2D.create(cylCx + relX, cylCy + relY),
        scaleX: 1,
        scaleY: 1,
        tiltDeg,
        opacity: 0,
        depthZ: z3,
        surfaceNormal: { x: Math.sin(rotatedTheta), y: 0, z: Math.cos(rotatedTheta) },
      };
    }

    const tLimb = clamp((z3 + horizonMargin) / (horizonMargin * 2), 0, 1);
    const screenX = cylCx + x3;
    const screenY = cylCy + y3;
    const compression = Math.max(0.2, Math.cos(rotatedTheta));

    const totalTilt = tiltDeg + (roll * 180) / Math.PI;

    return {
      visible: baseOpacity > 0.001,
      screenPosition: Vector2D.create(screenX, screenY),
      scaleX: compression,
      scaleY: 1.0,
      tiltDeg: totalTilt,
      opacity: baseOpacity * tLimb,
      depthZ: z3,
      surfaceNormal: { x: Math.sin(rotatedTheta), y: 0, z: Math.cos(rotatedTheta) },
    };
  }
}
