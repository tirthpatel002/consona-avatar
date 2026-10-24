import * as THREE from 'three';
import { bodyGridIndices, lerpBodyTarget, sphereSurface } from '../../../../core/scenegraph/bodyGrid.ts';
import type { BodyTarget, GridSurface } from '../../../../core/scenegraph/bodyGrid.ts';

/**
 * Three.js side of the shared body grid: the maths (sampling, normals,
 * morph lerp, surface registry) lives in `core/scenegraph/bodyGrid.ts`.
 */
export {
  BODY_GRID,
  bodyGridCount,
  sphereSurface,
  sampleBodyTarget,
  weldedNormals,
  lerpInto,
} from '../../../../core/scenegraph/bodyGrid.ts';
export type { BodyTarget, GridSurface } from '../../../../core/scenegraph/bodyGrid.ts';

let indexCache: THREE.BufferAttribute | null = null;
/** The shared index (do not mutate). */
export function bodyGridIndex(): THREE.BufferAttribute {
  return (indexCache ??= new THREE.BufferAttribute(bodyGridIndices(), 1));
}

/** A geometry on the shared grid initialised to `t` (positions/normals/uvs are mutated in place by morphs). */
export function createBodyGridGeometry(t: BodyTarget): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setIndex(bodyGridIndex());
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(t.position), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(t.normal), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(t.uv), 2).setUsage(THREE.DynamicDrawUsage));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Snapshot the current state of a grid geometry (morph start). */
export function snapshotBody(g: THREE.BufferGeometry): BodyTarget {
  return {
    position: new Float32Array((g.attributes.position as THREE.BufferAttribute).array as Float32Array),
    normal: new Float32Array((g.attributes.normal as THREE.BufferAttribute).array as Float32Array),
    uv: new Float32Array((g.attributes.uv as THREE.BufferAttribute).array as Float32Array),
  };
}

/** Write lerp(a, b, k) into the geometry (normals re-normalised; bounds refreshed for raycasts). */
export function morphBody(g: THREE.BufferGeometry, a: BodyTarget, b: BodyTarget, k: number): void {
  const P = g.attributes.position as THREE.BufferAttribute;
  const N = g.attributes.normal as THREE.BufferAttribute;
  const U = g.attributes.uv as THREE.BufferAttribute;
  lerpBodyTarget(
    { position: P.array as Float32Array, normal: N.array as Float32Array, uv: U.array as Float32Array },
    a,
    b,
    k,
  );
  P.needsUpdate = N.needsUpdate = U.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

/**
 * Fallback for registered geometries that don't provide a grid surface:
 * radially resample (rays from the bounds centre along the grid's sphere
 * directions). Exact for star-shaped bodies; uvs come from the hit triangle.
 */
export function resampleRadially(geo: THREE.BufferGeometry): GridSurface {
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const d = new THREE.Vector3();
  const t = new THREE.Vector2();

  return (u, v, out, uv) => {
    sphereSurface(u, v, d, t);
    ray.set(c, d.normalize());
    const hits = ray.intersectObject(mesh);
    const h = hits[hits.length - 1];
    if (h) {
      out.set(h.point.x, h.point.y, h.point.z);
      if (h.uv) uv.set(h.uv.x, h.uv.y);
      else uv.set(t.x, t.y);
    } else {
      out.set(c.x, c.y, c.z);
      uv.set(t.x, t.y);
    }
  };
}
