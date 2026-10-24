import * as THREE from 'three';

/** Shared BufferGeometry helpers. Shape builders (shaped sphere, tapered tube) live in `rig/parts/body.ts`. */

/** Swap u/v in place. */
export function swapUV(geo: THREE.BufferGeometry) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  return geo;
}

/** Re-normalise normals after a z-scale by `depth`. */
export function fixNormals(geo: THREE.BufferGeometry, depth: number) {
  const n = geo.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.set(n.getX(i), n.getY(i), n.getZ(i) / depth).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

/** Concatenate position/normal/uv of non-indexed geometries. */
export function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const arrays = parts.map((g) => (g.attributes[name] as THREE.BufferAttribute).array as Float32Array);
    const size = (parts[0]!.attributes[name] as THREE.BufferAttribute).itemSize;
    const all = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrays) {
      all.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(all, size));
  }
  return out;
}

/** `mergeGeometries` after de-indexing (accepts indexed parts). */
export function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
