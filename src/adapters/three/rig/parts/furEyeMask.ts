import { hypot2 } from '../../../../core/math/hypot.ts';
import * as THREE from 'three';
import type { EyeClearing } from './reliefEyes.ts';

/**
 * Fur eye mask shared by both fur styles (knit `furShells`, plush `shellFur`):
 * uniforms + GLSL clearing the pile under embedded eyes, and its CPU mirror.
 */
/**
 * Eye clearing shared by all shells of one fur group (body-group space): the
 * fur is removed under each embedded eye's exact footprint (shape SDF texture,
 * posed by the eye's preset squash / rotation / lids) plus its outline and a
 * tight soft margin that widens a little for taller shells. Per eye: centre,
 * tangent frame (T1, T2, N), P = (sx, sy, cos, sin), L = (upper-lid y,
 * lower-lid y, lid slope, arc bend), W = (half width, half height).
 * M = (eye radius, clearing edge in shape units, edge growth per shell height, enabled).
 */
export interface FurEyeMask {
  uEyeC: { value: THREE.Vector3[] };
  uEyeT1: { value: THREE.Vector3[] };
  uEyeT2: { value: THREE.Vector3[] };
  uEyeN: { value: THREE.Vector3[] };
  uEyeP: { value: THREE.Vector4[] };
  uEyeL: { value: THREE.Vector4[] };
  uEyeW: { value: THREE.Vector4[] };
  uEyeM: { value: THREE.Vector4 };
  uEyeSdf: { value: THREE.Texture };
}

/** `EyeClearing` hook writing into a fur eye mask (pass to `EyeRig`). */
export function furEyeClearing(m: FurEyeMask): EyeClearing {
  return {
    setShape(sdf) {
      m.uEyeSdf.value = sdf;
    },
    update(eyes, margin) {
      eyes.forEach((e, i) => {
        const F = e.frame;
        const T = e.shape;
        m.uEyeC.value[i]!.copy(F.c);
        m.uEyeT1.value[i]!.copy(F.t1);
        m.uEyeT2.value[i]!.copy(F.t2);
        m.uEyeN.value[i]!.copy(F.n);
        m.uEyeP.value[i]!.set(T.sx, T.sy, T.cos, T.sin);
        m.uEyeL.value[i]!.set(T.yu0, T.yl0, T.slope, T.bend);
        m.uEyeW.value[i]!.set(T.W, T.H, 0, 0);
      });
      m.uEyeM.value.set(margin.radius, margin.outline, margin.lift, 1);
    },
  };
}

const EMPTY_SDF = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  t.needsUpdate = true;
  return t;
})();

export function createFurEyeMask(): FurEyeMask {
  const v3 = () => [new THREE.Vector3(), new THREE.Vector3()];
  const v4 = (x = 0, y = 0, z = 0, w = 0) => [new THREE.Vector4(x, y, z, w), new THREE.Vector4(x, y, z, w)];
  return {
    uEyeC: { value: v3() },
    uEyeT1: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)] },
    uEyeT2: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] },
    uEyeN: { value: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)] },
    uEyeP: { value: v4(1, 1, 1, 0) },
    uEyeL: { value: v4(1, -1, 0, 0) },
    uEyeW: { value: v4(1, 1, 0, 0) },
    uEyeM: { value: new THREE.Vector4(1, 0, 0, 0) },
    uEyeSdf: { value: EMPTY_SDF },
  };
}

/** Eye SDF textures cover ±EYE_SDF_DOMAIN shape units; distance is stored as d / EYE_SDF_RANGE + 0.5. */
export const EYE_SDF_DOMAIN = 3;
export const EYE_SDF_RANGE = 6;
/** Largest clearing edge (shape units): keeps the cleared footprint well inside the SDF domain. */
export const EYE_CLEAR_MAX = 1.2;
/** Inner domain edge: from here outward the clearing distance is analytic (no clamp-to-edge extrusion). */
const EYE_SDF_DOMAIN_IN = EYE_SDF_DOMAIN - 0.05;
/** Minimum distance reported at / past the domain edge (well outside any clearing edge). */
const EYE_SDF_BORDER = 2.0;

/**
 * CPU mirror of the GLSL `furEyeDist` (tests / headless checks). Samples the
 * mask's SDF texture bilinearly with clamp-to-edge, exactly like the shader.
 */
export function furEyeDistance(m: FurEyeMask, p: { x: number; y: number; z: number }): number {
  const tex = m.uEyeSdf.value as THREE.DataTexture;
  const img = tex.image as { data: Uint8Array; width: number; height: number };
  const N = img.width;
  const texel = (x: number, y: number) => img.data[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))]! / 255;
  const sample = (u: number, v: number) => {
    const fx = Math.min(1, Math.max(0, u)) * N - 0.5, fy = Math.min(1, Math.max(0, v)) * N - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = texel(x0, y0) * (1 - tx) + texel(x0 + 1, y0) * tx;
    const b = texel(x0, y0 + 1) * (1 - tx) + texel(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
  const dot = (a: THREE.Vector3, x: number, y: number, z: number) => a.x * x + a.y * y + a.z * z;
  let best = 1e3;
  const r = Math.max(m.uEyeM.value.x, 1e-4);
  for (let i = 0; i < 2; i++) {
    const C = m.uEyeC.value[i]!;
    const qx = p.x - C.x, qy = p.y - C.y, qz = p.z - C.z;
    const qn = dot(m.uEyeN.value[i]!, qx, qy, qz);
    if (qn < -0.8 * r || qn > 1.5 * r) continue;
    const X = dot(m.uEyeT1.value[i]!, qx, qy, qz) / r;
    const Y = dot(m.uEyeT2.value[i]!, qx, qy, qz) / r;
    const P = m.uEyeP.value[i]!, L = m.uEyeL.value[i]!, W = m.uEyeW.value[i]!;
    const xn = Math.min(1, Math.max(-1, X / Math.max(W.x, 1e-3)));
    const win = Math.max(L.x + L.z * X - L.y, 0.03 * W.y);
    const y2 = ((Y - L.w * (1 - xn * xn) - L.y) / win) * 2 * W.y - W.y;
    const x1 = P.z * X + P.w * y2;
    const y1 = -P.w * X + P.z * y2;
    const sx = x1 / P.x, sy = y1 / P.y;
    let d = (sample(sx / (2 * EYE_SDF_DOMAIN) + 0.5, sy / (2 * EYE_SDF_DOMAIN) + 0.5) - 0.5) * EYE_SDF_RANGE;
    const ox = Math.max(Math.abs(sx) - EYE_SDF_DOMAIN_IN, 0), oy = Math.max(Math.abs(sy) - EYE_SDF_DOMAIN_IN, 0);
    if (ox > 0 || oy > 0) d = Math.max(d, hypot2(ox, oy) * 4 + EYE_SDF_BORDER);
    best = Math.min(best, d);
  }
  return best;
}

/** GLSL: distance (shape units) from `p` to the nearest eye footprint (negative inside). */
export const FUR_EYE_MASK_GLSL = /* glsl */ `
uniform vec3 uEyeC[2]; uniform vec3 uEyeT1[2]; uniform vec3 uEyeT2[2]; uniform vec3 uEyeN[2];
uniform vec4 uEyeP[2]; uniform vec4 uEyeL[2]; uniform vec4 uEyeW[2]; uniform vec4 uEyeM; uniform sampler2D uEyeSdf;
float furEyeDist(vec3 p) {
  float best = 1e3;
  float r = max(uEyeM.x, 1e-4);
  for (int i = 0; i < 2; i++) {
    vec3 q = p - uEyeC[i];
    // depth bound: only the near surface patch around the eye (never the body behind / far in front)
    float qn = dot(q, uEyeN[i]);
    if (qn < -0.8 * r || qn > 1.5 * r) continue;
    float X = dot(q, uEyeT1[i]) / r;
    float Y = dot(q, uEyeT2[i]) / r;
    vec4 P = uEyeP[i]; vec4 L = uEyeL[i]; vec4 W = uEyeW[i];
    float xn = clamp(X / max(W.x, 1e-3), -1.0, 1.0);
    float win = max(L.x + L.z * X - L.y, 0.03 * W.y);
    float y2 = ((Y - L.w * (1.0 - xn * xn) - L.y) / win) * 2.0 * W.y - W.y;
    float x1 = P.z * X + P.w * y2;
    float y1 = -P.w * X + P.z * y2;
    vec2 sp = vec2(x1 / P.x, y1 / P.y);
    vec2 uv = sp / (2.0 * ${EYE_SDF_DOMAIN.toFixed(3)}) + 0.5;
    float d = (texture2D(uEyeSdf, uv).r - 0.5) * ${EYE_SDF_RANGE.toFixed(3)};
    // outside the SDF texture: clamp-to-edge would extrude the border texels into infinite strips;
    // instead the distance keeps growing with the distance past the domain
    vec2 o = max(abs(sp) - ${EYE_SDF_DOMAIN_IN.toFixed(3)}, 0.0);
    if (o.x + o.y > 0.0) d = max(d, length(o) * 4.0 + ${EYE_SDF_BORDER.toFixed(3)});

    best = min(best, d);
  }
  return best;
}
`;
