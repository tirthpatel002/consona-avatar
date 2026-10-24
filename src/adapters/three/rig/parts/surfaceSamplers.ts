import * as THREE from 'three';
import type { ThreeAvatarRig } from '../assembleRig.ts';

/**
 * Body-space surface samplers over a body-local probe mesh (shared by every
 * body part): `surfaceAt` (front-most point at x, y) and `surfaceRadial`
 * (outer skin distance along a direction).
 */
export function createBodySurfaceSamplers(local: THREE.Mesh): Pick<ThreeAvatarRig, 'surfaceAt' | 'surfaceRadial'> {
  // (jittered: a ray exactly on a UV seam can slip between triangles)
  const ray = new THREE.Raycaster();
  const surfaceAt: ThreeAvatarRig['surfaceAt'] = (x, y, point, normal) => {
    for (const j of [0, 1e-3, -1e-3]) {
      ray.set(new THREE.Vector3(x + j, y + j, 5), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(local)[0];
      if (hit) {
        point.copy(hit.point);
        normal.copy(hit.face!.normal);
        if (normal.z < 0) normal.negate();
        return true;
      }
    }
    return false;
  };
  const rOrigin = new THREE.Vector3();
  const rDir = new THREE.Vector3();
  const surfaceRadial: ThreeAvatarRig['surfaceRadial'] = (origin, dir) => {
    // cast inward from outside so the first hit is the outer skin (rings / holes included)
    rDir.copy(dir).negate();
    rOrigin.copy(origin).addScaledVector(dir, 5);
    ray.set(rOrigin, rDir);
    const hit = ray.intersectObject(local)[0];
    return hit ? 5 - hit.distance : null;
  };
  return { surfaceAt, surfaceRadial };
}
