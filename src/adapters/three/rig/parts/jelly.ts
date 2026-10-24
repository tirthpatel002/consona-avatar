import * as THREE from 'three';
import { SoftBody } from '../../../../core/math/SoftBody.ts';
import type { SoftBodyInput, SoftBodyState } from '../../../../core/math/SoftBody.ts';

/**
 * Soft-body "water balloon" jiggle.
 *
 * A few damped springs (sway x/z, volume-preserving squash, poke dent) are
 * driven by the avatar's own motion (world acceleration of the body, spin,
 * behavior squash, pokes) plus a gentle idle force. The result is applied in the
 * vertex shader of every procedural mesh (body fur shells + accessories) in
 * WORLD space, so all shells, accessories and the embedded eyes deform
 * identically. The fur's eye clearing is evaluated on the undeformed
 * position, so it stays aligned.
 */
export interface JellyUniforms {
  uJBase: { value: THREE.Vector3 };
  uJH: { value: number };
  uJSway: { value: THREE.Vector3 };
  uJS: { value: number };
  uJPoke: { value: THREE.Vector4 };
  uJPokeR: { value: number };
}

export function createJellyUniforms(): JellyUniforms {
  return {
    uJBase: { value: new THREE.Vector3() },
    uJH: { value: 1.5 },
    uJSway: { value: new THREE.Vector3() },
    uJS: { value: 1 },
    uJPoke: { value: new THREE.Vector4(0, 0, 0, 0) },
    uJPokeR: { value: 0.6 },
  };
}

const GLSL = /* glsl */ `
uniform vec3 uJBase; uniform float uJH; uniform vec3 uJSway; uniform float uJS; uniform vec4 uJPoke; uniform float uJPokeR;
vec3 jellyW(vec3 w) {
  vec3 r = w - uJBase;
  float h = clamp(r.y / uJH, 0.0, 1.5);
  vec3 d = w - uJPoke.xyz;
  float f = exp(-dot(d, d) / (uJPokeR * uJPokeR));
  vec3 c = vec3(0.0, uJH * 0.5, 0.0);
  vec3 toC = r - c;
  float lc = length(toC);
  r -= (lc > 1e-4 ? toC / lc : vec3(0.0)) * uJPoke.w * f;
  r.y *= uJS;
  r.xz *= inversesqrt(max(uJS, 0.05));
  r += uJSway * (h * h);
  return uJBase + r;
}
`;

const TMP = new THREE.Vector3();

/** Patch every mesh material under `root` (except `exclude`) to apply the jelly deformation. */
export function applyJelly(root: THREE.Object3D, u: JellyUniforms, exclude?: (o: THREE.Object3D) => boolean): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || exclude?.(o)) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (m.userData.jelly) continue;
      m.userData.jelly = true;
      const prev = m.onBeforeCompile;
      const prevKey = m.customProgramCacheKey;
      m.onBeforeCompile = (sh, r) => {
        prev.call(m, sh, r);
        Object.assign(sh.uniforms, u);
        sh.vertexShader = GLSL + sh.vertexShader.replace(
          '#include <project_vertex>',
          `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
  mvPosition = modelMatrix * mvPosition;
  mvPosition.xyz = jellyW( mvPosition.xyz );
  mvPosition = viewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;`,
        );
      };
      m.customProgramCacheKey = () => `${prevKey.call(m)}|jelly`;
      m.needsUpdate = true;
    }
  });
}

export type JellyInput = SoftBodyInput;

/** Three wrapper of the core `SoftBody`: mirrors its state into `JellyUniforms`. */
export class JellySim extends SoftBody {
  readonly uniforms = createJellyUniforms();

  override pokeAt(point: THREE.Vector3, strength = 1): void {
    super.pokeAt(point, strength);
    this.sync();
  }

  override update(i: SoftBodyInput): SoftBodyState {
    const st = super.update(i);
    this.sync();
    return st;
  }

  private sync(): void {
    const s = this.state;
    const u = this.uniforms;
    u.uJBase.value.set(s.base.x, s.base.y, s.base.z);
    u.uJH.value = s.height;
    u.uJPokeR.value = s.pokeRadius;
    u.uJSway.value.set(s.sway.x, s.sway.y, s.sway.z);
    u.uJS.value = s.squash;
    u.uJPoke.value.set(s.poke.x, s.poke.y, s.poke.z, s.poke.w);
  }
}
