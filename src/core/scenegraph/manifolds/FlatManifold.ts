import { Vector2D } from '../../math/Vector2D.ts';
import type { IProjectionManifold, ProjectOptions, ProjectedPointResult } from './IProjectionManifold.ts';
import { formatCoord } from '../../math/Bezier.ts';

/**
 * FlatManifold: Standard 2D planar projection.
 */
export class FlatManifold implements IProjectionManifold {
  readonly type = 'flat';
  public originX: number;
  public originY: number;

  constructor(originX: number = 50, originY: number = 50) {
    this.originX = originX;
    this.originY = originY;
  }

  project(options: ProjectOptions): ProjectedPointResult {
    const {
      relX,
      relY,
      width,
      height,
      tiltDeg = 0,
      rotation = [0, 0, 0],
      planeOffset = [0, 0],
      baseOpacity = 1.0,
    } = options;

    const screenX = this.originX + planeOffset[0] + relX;
    const screenY = this.originY + planeOffset[1] + relY;

    const rollRad = rotation[2] ?? 0;
    const totalTilt = tiltDeg + (rollRad * 180) / Math.PI;

    let svgTransform: string | undefined = undefined;
    if (Math.abs(totalTilt) > 0.01) {
      svgTransform = `rotate(${formatCoord(totalTilt)} ${formatCoord(screenX)} ${formatCoord(screenY)})`;
    }

    return {
      visible: baseOpacity > 0.001,
      screenPosition: Vector2D.create(screenX, screenY),
      scaleX: 1.0,
      scaleY: 1.0,
      tiltDeg: totalTilt,
      opacity: baseOpacity,
      depthZ: 0,
      surfaceNormal: { x: 0, y: 0, z: 1 },
      svgTransform,
    };
  }
}
