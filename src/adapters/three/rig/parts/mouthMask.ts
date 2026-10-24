import * as THREE from 'three';
import type { ColorLike } from '../../../../core/types/AvatarDefinition.ts';
import { mouthColors } from '../../../../core/face/mouth.ts';

/**
 * Mouth decal-in-shader (shared by every fur / skin material, e.g. Allie's
 * knit `furShells`). The mouth has NO geometry: it is an
 * analytic 2D signed-distance shape evaluated in body space (x/y relative to
 * the mouth centre, front half only), so it rides the body's vertex morph and
 * jelly for free. Its shape is two edge profiles (lower / upper, MOUTH_SAMPLES
 * samples across the width) written as uniforms; shape changes are spring-
 * morphed uniforms — one fixed program, never a recompile.
 * - skin (h = 0): carved groove (line in the body-derived mouth colour, darker in the channel, normals
 *   bent along the SDF gradient), body-derived inner for open shapes, AA via fwidth;
 * - shells (h > 0): fur cleared over the same SDF + margin.
 */
export const MOUTH_SAMPLES = 17;

export interface FurMouthMask {
  /** Centre (body space; z = body centre: only the front half is decorated). */
  uMouthC: { value: THREE.Vector3 };
  /** (half width, clearing margin, half line thickness, enabled) */
  uMouthW: { value: THREE.Vector4 };
  uMouthLo: { value: number[] };
  uMouthUp: { value: number[] };
  uMouthLine: { value: THREE.Color };
  uMouthInner: { value: THREE.Color };
}

/** Mouth mask uniforms; colours start as the 'auto' mouth of `body` (the mouth part keeps them live). */
export function createFurMouthMask(body: ColorLike = '#808080'): FurMouthMask {
  const mc = mouthColors('auto', body);
  return {
    uMouthC: { value: new THREE.Vector3() },
    uMouthW: { value: new THREE.Vector4(0.1, 0.01, 0.01, 0) },
    uMouthLo: { value: new Array(MOUTH_SAMPLES).fill(0) },
    uMouthUp: { value: new Array(MOUTH_SAMPLES).fill(0) },
    uMouthLine: { value: new THREE.Color().setRGB(mc.line[0], mc.line[1], mc.line[2], THREE.SRGBColorSpace) },
    uMouthInner: { value: new THREE.Color().setRGB(mc.inner[0], mc.inner[1], mc.inner[2], THREE.SRGBColorSpace) },
  };
}

/** Hook the mouth part writes into (provided by a surface part as `ctx.mouthClearing`). Uniform writes only. */
export interface MouthClearing {
  /**
   * Centre (body space), half width, clearing margin, half line thickness, edge profiles
   * (body units relative to the centre, MOUTH_SAMPLES each), line / inner colours (linear).
   */
  update(c: THREE.Vector3, halfWidth: number, margin: number, lineHalf: number, lower: ArrayLike<number>, upper: ArrayLike<number>, line: THREE.Color, inner: THREE.Color): void;
  disable(): void;
}

export function furMouthClearing(m: FurMouthMask): MouthClearing {
  return {
    update(c, hw, margin, lt, lower, upper, line, inner) {
      m.uMouthC.value.copy(c);
      m.uMouthW.value.set(hw, margin, lt, 1);
      for (let i = 0; i < MOUTH_SAMPLES; i++) {
        m.uMouthLo.value[i] = lower[i] ?? 0;
        m.uMouthUp.value[i] = upper[i] ?? 0;
      }
      m.uMouthLine.value.copy(line);
      m.uMouthInner.value.copy(inner);
    },
    disable() {
      m.uMouthW.value.w = 0;
    },
  };
}

const N1 = MOUTH_SAMPLES - 1;
/**
 * GLSL: `furMouthSdf(p)` → (line distance, signed inner distance (<0 inside the opening),
 * half line thickness at p, valid); `furInMouth(p)` (fur clearing); `furMouthShade(p, col)`
 * (skin decal: returns the groove height used by `furMouthBend`).
 */
export const FUR_MOUTH_MASK_GLSL = /* glsl */ `
uniform vec3 uMouthC; uniform vec4 uMouthW;
uniform float uMouthLo[${MOUTH_SAMPLES}]; uniform float uMouthUp[${MOUTH_SAMPLES}];
uniform vec3 uMouthLine; uniform vec3 uMouthInner;
vec4 furMouthSdf(vec3 p) {
  vec4 far = vec4(1e3, 1e3, 0.0, 0.0);
  if (uMouthW.w < 0.5) return far;
  vec3 q = p - uMouthC;
  float hw = max(uMouthW.x, 1e-4);
  if (q.z < 0.0 || abs(q.x) > hw * 1.6 + uMouthW.y + uMouthW.z * 2.0) return far;
  float t = clamp((q.x / hw + 1.0) * 0.5, 0.0, 1.0) * ${N1.toFixed(1)};
  int i0 = clamp(int(floor(t)), 0, ${N1 - 1});
  int i1 = i0 + 1;
  float f = t - float(i0);
  float lo0 = uMouthLo[i0], lo1 = uMouthLo[i1], up0 = uMouthUp[i0], up1 = uMouthUp[i1];
  float lo = mix(lo0, lo1, f), up = mix(up0, up1, f);
  float k = ${N1.toFixed(1)} / (2.0 * hw);
  float sLo = (lo1 - lo0) * k, sUp = (up1 - up0) * k;
  if (abs(q.y - (lo + up) * 0.5) > abs(up - lo) * 0.5 + hw + uMouthW.y + uMouthW.z * 2.0) return far;
  float ex = max(abs(q.x) - hw, 0.0);
  float dLo = abs(q.y - lo) / sqrt(1.0 + sLo * sLo);
  float dUp = abs(q.y - up) / sqrt(1.0 + sUp * sUp);
  float dLine = length(vec2(ex, min(dLo, dUp)));
  float sIn = up - lo > 1e-4 ? max(max(lo - q.y, q.y - up), ex) : 1e3;
  // rounded, tapered corners
  float u = min(abs(q.x) / hw, 1.0);
  float lt = uMouthW.z * sqrt(max(0.05, 1.0 - pow(u, 6.0)));
  return vec4(dLine, sIn, lt, 1.0);
}
bool furInMouth(vec3 p) {
  vec4 s = furMouthSdf(p);
  return s.w > 0.5 && min(s.x - s.z, s.y) < uMouthW.y;
}
float furMouthShade(vec3 p, inout vec3 col) {
  vec4 s = furMouthSdf(p);
  if (s.w < 0.5) return 0.0;
  float aa = max(fwidth(s.x), 1e-5);
  float ai = max(fwidth(s.y), 1e-5);
  // concave inner (open shapes / tongue)
  float mi = 1.0 - smoothstep(-ai, ai, s.y);
  float depthIn = clamp(-s.y / max(uMouthW.z * 2.5, 1e-4), 0.0, 1.0);
  col = mix(col, uMouthInner * (0.72 + 0.28 * (1.0 - depthIn)), mi);
  // carved line: darker in the channel centre, lighter at its rim
  float ml = 1.0 - smoothstep(s.z - aa, s.z + aa, s.x);
  float r = clamp(s.x / max(s.z, 1e-5), 0.0, 1.0);
  col = mix(col, uMouthLine * (0.62 + 0.38 * r), ml);
  // groove height (negative = recessed), used to bend the normal
  return -ml * (1.0 - r * r) * s.z * 0.6 - mi * min(-s.y, uMouthW.z) * 0.4;
}
`;

/** GLSL (after the normal is final, view space): bend `normal` along the groove's screen-space gradient. */
export const FUR_MOUTH_BEND_GLSL = /* glsl */ `
{
  float pxX = max(length(dFdx(vViewPosition)), 1e-6), pxY = max(length(dFdy(vViewPosition)), 1e-6);
  vec2 g = vec2(dFdx(furMouthH) / pxX, dFdy(furMouthH) / pxY);
  normal = normalize(normal - vec3(g, 0.0) * 1.2);
}
`;
