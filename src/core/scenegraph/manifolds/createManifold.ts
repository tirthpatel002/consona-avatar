import type { PlaneDesc } from '../PlaneSpace.ts';
import type { IProjectionManifold } from './IProjectionManifold.ts';
import { FlatManifold } from './FlatManifold.ts';
import { SphericalManifold } from './SphericalManifold.ts';
import { CylindricalManifold } from './CylindricalManifold.ts';

/**
 * Build a projection manifold from a declarative PlaneDesc (avatar-agnostic).
 */
export function createManifoldFromPlane(desc: PlaneDesc): IProjectionManifold {
  const cx = desc.center?.[0] ?? 50;
  const cy = desc.center?.[1] ?? 50;
  const radius = desc.radius ?? 38.5;

  switch (desc.type) {
    case 'spherical':
      return new SphericalManifold(cx, cy, radius);
    case 'cylindrical':
      return new CylindricalManifold(cx, cy, radius);
    case 'flat':
    default:
      return new FlatManifold(cx, cy);
  }
}
