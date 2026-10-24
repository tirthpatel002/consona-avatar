import { hypot3 } from '../../math/hypot.ts';
import { Vector2D } from '../../math/Vector2D.ts';
import { Matrix3D } from '../../math/Matrix3D.ts';
import { lerp, clamp } from '../../math/Interpolation.ts';
import { formatCoord } from '../../math/Bezier.ts';
import type { IProjectionManifold, ProjectOptions, ProjectedPointResult } from './IProjectionManifold.ts';

/**
 * SphericalManifold: Embeds 2D elements onto a 3D spherical surface.
 * Performs 3D Euler matrix rotation, conformal tangent-plane basis mapping (paper bending),
 * horizon occlusion and limb wrapping, and surface-normal parallax extraction.
 */
export class SphericalManifold implements IProjectionManifold {
  readonly type = 'spherical';
  public originX: number;
  public originY: number;
  public radius: number;

  private matrix = new Matrix3D();
  private cachedAngles: [number, number, number] = [0, 0, 0];

  constructor(
    originX: number = 50,
    originY: number = 48,
    radius: number = 38.5
  ) {
    this.originX = originX;
    this.originY = originY;
    this.radius = radius;
  }

  project(
    optionsOrRelX: ProjectOptions | number,
    relYArg?: number,
    depthScaleArg?: number,
    yawArg?: number,
    pitchArg?: number
  ): ProjectedPointResult & { x: number; y: number } {
    let options: ProjectOptions;
    if (typeof optionsOrRelX === 'number') {
      options = {
        relX: optionsOrRelX - this.originX,
        relY: (relYArg ?? this.originY) - this.originY,
        width: 10,
        height: 10,
        rotation: [pitchArg ?? 0, yawArg ?? 0, 0],
      };
    } else {
      options = optionsOrRelX;
    }

    const {
      relX,
      relY,
      width: w0 = 10,
      height: h0 = 10,
      tiltDeg = 0,
      rotation = [0, 0, 0],
      planeOffset = [0, 0],
      baseOpacity = 1.0,
      depthScale = 0.48,
      horizonMarginRatio = 0.54,
    } = options;

    const sphereCx = this.originX + planeOffset[0];
    const sphereCy = this.originY + planeOffset[1];
    const sphereR = this.radius;

    // 1. Unrotated 3D position on the front hemisphere
    const x0 = relX;
    const y0 = relY;
    const r2 = x0 * x0 + y0 * y0;
    const z0 = Math.sqrt(Math.max(0, sphereR * sphereR - r2));

    // 2. Base surface normal & local tangent basis vectors
    const invR0 = 1 / sphereR;
    const nx0 = x0 * invR0;
    const ny0 = y0 * invR0;
    const nz0 = z0 * invR0;

    const radTilt0 = (tiltDeg * Math.PI) / 180;
    const cosTilt0 = Math.cos(radTilt0);
    const sinTilt0 = Math.sin(radTilt0);

    const ux0 = cosTilt0;
    const uy0 = sinTilt0;
    const uz0 = nz0 > 0.05 ? -(ux0 * nx0 + uy0 * ny0) / nz0 : 0;

    const vx0 = -sinTilt0;
    const vy0 = cosTilt0;
    const vz0 = nz0 > 0.05 ? -(vx0 * nx0 + vy0 * ny0) / nz0 : 0;

    const uLen = hypot3(ux0, uy0, uz0) || 1;
    const vLen = hypot3(vx0, vy0, vz0) || 1;
    const uNorm = { x: ux0 / uLen, y: uy0 / uLen, z: uz0 / uLen };
    const vNorm = { x: vx0 / vLen, y: vy0 / vLen, z: vz0 / vLen };

    // 3. Euler Rotation via Matrix3D (pitch = x, yaw = y, roll = z)
    const pitch = rotation[0] ?? 0;
    const yaw = rotation[1] ?? 0;
    const roll = rotation[2] ?? 0;

    if (
      pitch !== this.cachedAngles[0] ||
      yaw !== this.cachedAngles[1] ||
      roll !== this.cachedAngles[2]
    ) {
      this.matrix.setFromEuler(pitch, yaw, roll);
      this.cachedAngles = [pitch, yaw, roll];
    }

    const P3 = this.matrix.transformVector3({ x: x0, y: y0, z: z0 });
    const N3 = this.matrix.transformVector3({ x: nx0, y: ny0, z: nz0 });
    const U3 = this.matrix.transformVector3(uNorm);
    const V3 = this.matrix.transformVector3(vNorm);

    const x3 = P3.x;
    const y3 = P3.y;
    const z3 = P3.z;

    const horizonMargin = w0 * horizonMarginRatio;

    // Complete backface occlusion if behind horizon
    if (z3 < -horizonMargin) {
      return {
        visible: false,
        screenPosition: Vector2D.create(sphereCx + x0, sphereCy + y0),
        x: sphereCx + x0,
        y: sphereCy + y0,
        scaleX: 1,
        scaleY: 1,
        tiltDeg,
        opacity: 0,
        depthZ: z3,
        surfaceNormal: N3,
      };
    }

    // Smooth limb transition across horizon
    const tLimb = clamp((z3 + horizonMargin) / (horizonMargin * 2.5), 0, 1);
    const smoothLimb = tLimb * tLimb * (3 - 2 * tLimb);

    // Projected screen center with smooth silhouette hugging
    let screenX = sphereCx + x3;
    let screenY = sphereCy + y3;

    if (tLimb < 1.0) {
      const rSilhouette = Math.sqrt(Math.max(1, sphereR * sphereR - y3 * y3));
      const limbEdgeX = sphereCx + Math.sign(x3 || 1) * rSilhouette;
      const wrapBlend = (1 - tLimb) * 0.70;
      screenX = lerp(screenX, limbEdgeX, wrapBlend);
    }

    const screenCenter = Vector2D.create(screenX, screenY);

    // Conformal 2D tangent basis vectors for paper bending
    const a = U3.x;
    const b = U3.y;
    const c = V3.x;
    const d = V3.y;

    const rotatedTilt = tiltDeg + (roll * 180) / Math.PI;

    const hasSphereRotation =
      Math.abs(pitch) > 1e-4 ||
      Math.abs(yaw) > 1e-4 ||
      Math.abs(roll) > 1e-4;

    const limbHorizonCompression = 0.35 + 0.65 * smoothLimb;
    const wScale = hasSphereRotation ? limbHorizonCompression : 1.0;
    const hScale = 1.0;

    const finalOpacity = baseOpacity * smoothLimb;

    // Surface-normal parallax offset for pupils / layered atoms
    const parallaxOffset = Vector2D.create(
      -N3.x * 3.6 * (1 - depthScale),
      -N3.y * 3.6 * (1 - depthScale)
    );

    const has2DTransform =
      hasSphereRotation ||
      Math.abs(tiltDeg) > 1e-3;

    const svgTransform = has2DTransform
      ? `translate(${formatCoord(screenCenter.x)} ${formatCoord(screenCenter.y)}) matrix(${formatCoord(a)} ${formatCoord(b)} ${formatCoord(c)} ${formatCoord(d)} 0 0) translate(${formatCoord(-screenCenter.x)} ${formatCoord(-screenCenter.y)})`
      : undefined;

    return {
      visible: finalOpacity > 0.001,
      screenPosition: screenCenter,
      x: screenCenter.x,
      y: screenCenter.y,
      scaleX: Math.max(0.01, wScale),
      scaleY: Math.max(0.01, hScale),
      tiltDeg: rotatedTilt,
      opacity: finalOpacity,
      depthZ: z3,
      surfaceNormal: N3,
      transformMatrix: hasSphereRotation ? { a, b, c, d } : undefined,
      svgTransform,
      parallaxOffset,
    };
  }
}
