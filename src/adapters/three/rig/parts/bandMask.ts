import * as THREE from 'three';

/**
 * Hairband decal-in-shader (same mechanism as `mouthMask.ts`, shared by the
 * fur surface materials): NO geometry. The band is an analytic shape in body
 * space — the body surface inside a slab (centre `uBandC`, basis
 * `uBandX` across / `uBandU` up / `uBandN` slab normal), ending in rounded caps
 * below `end` — so it rides body morphs, jelly, presets and scale for free.
 *  - skin (h = 0): fabric colour with a rounded relief profile (rib / bow
 *    styles add their own relief), the height bends the normal through the
 *    mouth's `FUR_MOUTH_BEND_GLSL` (one combined decal height);
 *  - shells (h > 0): fur cleared over the band + a margin that widens with
 *    pile height (a soft crater, like the eye clearing), so it sits in the fur.
 * Everything is uniforms: one fixed program, never a recompile or rebuild.
 */
export interface FurBandMask {
  uBandC: { value: THREE.Vector3 };
  uBandX: { value: THREE.Vector3 };
  uBandU: { value: THREE.Vector3 };
  uBandN: { value: THREE.Vector3 };
  /** (half width, end (along U), clearing margin, enabled) */
  uBandW: { value: THREE.Vector4 };
  /** (style 0 plain / 1 ribbed / 2 bow, thickness, rib pitch, bow size) */
  uBandP: { value: THREE.Vector4 };
  uBandCol: { value: THREE.Color };
  /** Bow height off the surface (body units; vertex lift along the normal). */
  uBandLift: { value: number };
  /** Fur pile length (body units; kept in sync by the surface part): the fur slopes away from the band over it. */
  uBandPile: { value: number };
}

export function createFurBandMask(): FurBandMask {
  return {
    uBandC: { value: new THREE.Vector3() },
    uBandX: { value: new THREE.Vector3(1, 0, 0) },
    uBandU: { value: new THREE.Vector3(0, 1, 0) },
    uBandN: { value: new THREE.Vector3(0, 0, 1) },
    uBandW: { value: new THREE.Vector4(0.07, 0, 0.01, 0) },
    uBandP: { value: new THREE.Vector4(0, 0.02, 0.05, 0.2) },
    uBandCol: { value: new THREE.Color() },
    uBandPile: { value: 0 },
    uBandLift: { value: 0 },
  };
}

export interface BandPlacement {
  center: THREE.Vector3;
  /** Rotation of the band frame (identity = slab normal +z, ear to ear over the top). */
  rotation: THREE.Quaternion;
  halfWidth: number;
  end: number;
  margin: number;
  style: number;
  thickness: number;
  ribPitch: number;
  bowSize: number;
  /** Bow height off the surface (body units). */
  bowLift: number;
  /** Linear colour. */
  color: THREE.Color;
}

/** Hook the hairband part writes into (provided by a surface part as `ctx.bandClearing`). Uniform writes only. */
export interface BandClearing {
  update(p: BandPlacement): void;
  disable(): void;
}

export function furBandClearing(m: FurBandMask): BandClearing {
  return {
    update(p) {
      m.uBandC.value.copy(p.center);
      m.uBandX.value.set(1, 0, 0).applyQuaternion(p.rotation);
      m.uBandU.value.set(0, 1, 0).applyQuaternion(p.rotation);
      m.uBandN.value.set(0, 0, 1).applyQuaternion(p.rotation);
      m.uBandW.value.set(p.halfWidth, p.end, p.margin, 1);
      m.uBandP.value.set(p.style, p.thickness, p.ribPitch, p.bowSize);
      m.uBandCol.value.copy(p.color);
      m.uBandLift.value = p.bowLift;
    },
    disable() {
      m.uBandW.value.w = 0;
    },
  };
}

/**
 * GLSL shared by both stages (no derivatives): uniforms, `furBandLocal(p)` (band frame coords),
 * `furBowParts(tb, s, L)` (loop / hole / tail distances; the band itself is the centre, `furBowWrap`) and `furBandLift(p)`: the bow's real
 * height off the surface, a smooth dome the vertex shader pushes skin AND shells out by along the
 * normal (so the bow has a true raised silhouette and the fur around it rides up with it).
 */
export const FUR_BAND_SDF_GLSL = /* glsl */ `
uniform vec3 uBandC; uniform vec3 uBandX; uniform vec3 uBandU; uniform vec3 uBandN;
uniform vec4 uBandW; uniform vec4 uBandP; uniform vec3 uBandCol; uniform float uBandPile; uniform float uBandLift;
// x = across (slab), y = arc length along the band (0 at the top), z = local radius; w = 0 when far / off
vec4 furBandLocal(vec3 p) {
  if (uBandW.w < 0.5) return vec4(0.0);
  vec3 r = p - uBandC;
  float s = dot(r, uBandN);
  if (abs(s) > uBandW.x + uBandP.w + uBandW.z + uBandPile * 2.2) return vec4(0.0);
  float a = dot(r, uBandX), b = dot(r, uBandU);
  float R = max(length(vec2(a, b)), 1e-4);
  return vec4(s, atan(a, b) * R, R, 1.0);
}
// band-centre gather of the bow: 1 at its middle → 0 a third of a bow away (smooth)
float furBowWrap(float tb, float L) {
  return 1.0 - smoothstep(0.0, L * 0.34, abs(tb));
}
// bow centred a third of the way down one side: (loop, hole, unused, tail) signed distances; tail u in tailU
vec4 furBowParts(float tb, float s, float L, out float tailU) {
  float at = abs(tb);
  float ry = L * (0.26 + 0.3 * clamp(at / L, 0.0, 1.0));
  float lobe = (length(vec2((at - L * 0.5) / (L * 0.46), s / ry)) - 1.0) * min(L * 0.46, ry);
  float hole = (length(vec2((at - L * 0.58) / (L * 0.15), s / (L * 0.09))) - 1.0) * L * 0.09;
  float knot = 1e3; // no separate knot: the band forms the bow centre
  float tail = 1e3; tailU = 0.0;
  for (int k = 0; k < 2; k++) {
    float sg = k == 0 ? 1.0 : -1.0;
    vec2 dir = normalize(vec2(0.42, 1.0));
    vec2 q = vec2(tb, s * sg);
    float u = dot(q, dir), v = dot(q, vec2(-dir.y, dir.x));
    float hwT = L * (0.12 + 0.03 * clamp(u / L, 0.0, 1.0));
    float len = L * 0.9;
    float uEnd = len - L * 0.16 * (1.0 - clamp(abs(v) / hwT, 0.0, 1.0));
    float dt = max(abs(v) - hwT, max(-u, u - uEnd));
    if (dt < tail) { tail = dt; tailU = u / len; }
  }
  return vec4(lobe, hole, knot, tail);
}
// real height of the bow off the surface (body units): smooth domes, raised band centre, loops, low tails
float furBandLift(vec3 p) {
  if (uBandP.x < 1.5 || uBandLift <= 0.0) return 0.0;
  vec4 lc = furBandLocal(p);
  if (lc.w < 0.5) return 0.0;
  float L = uBandP.w;
  float tu;
  vec4 bp = furBowParts(lc.y - lc.z * 0.62, lc.x, L, tu);
  float soft = L * 0.18;
  float loop = smoothstep(soft * 0.3, -soft, bp.x) * (1.0 - 0.45 * smoothstep(soft * 0.2, -soft * 0.5, bp.y));
  float tail = smoothstep(soft * 0.3, -soft * 0.5, bp.w) * (1.0 - 0.5 * tu);
  // the band itself is the bow's centre: it rises smoothly (wide falloffs: no facets on a coarse mesh)
  // where it gathers the loops, then runs on flat either side
  float wrap = furBowWrap(lc.y - lc.z * 0.62, L);
  float centre = wrap * smoothstep(uBandW.x * 1.6, uBandW.x * 0.2, abs(lc.x));
  return uBandLift * max(max(loop * 0.8, centre * 0.9), tail * 0.3);
}
`;

/**
 * Fragment GLSL (needs `FUR_BAND_SDF_GLSL` before it): `furBandSdf(p)` → (signed distance to the
 * band ∪ bow (<0 inside), relief height, shade, valid); `furInBand(p, h)` (fur clearing at shell
 * height h 0..1); `furBandShade(p, col)` (skin decal: returns the relief height, added to the mouth bend height).
 */
export const FUR_BAND_MASK_GLSL = /* glsl */ `
vec4 furBandSdf(vec3 p) {
  vec4 far = vec4(1e3, 0.0, 1.0, 0.0);
  vec4 lc = furBandLocal(p);
  if (lc.w < 0.5) return far;
  float s = lc.x, t = lc.y, R = lc.z;
  float hw = max(uBandW.x, 1e-4);
  float L = uBandP.w;
  float th = uBandP.y;
  // band: slab |s| < hw, rounded caps (radius hw) where it ends at b = end
  float b = cos(t / R) * R;
  float cb = uBandW.y + hw;
  float dB = b < cb ? length(vec2(s, b - cb)) - hw : abs(s) - hw;
  float wrap = 0.0;
  if (uBandP.x > 1.5) {
    // bow: the band gathers (pinches) where it ties the loops
    wrap = furBowWrap(t - R * 0.62, uBandP.w);
    float hwP = hw * (1.0 - 0.22 * wrap);
    dB = b < cb ? length(vec2(s, b - cb)) - hwP : abs(s) - hwP;
    hw = hwP;
  }
  float prof = sqrt(clamp(1.0 - pow(clamp(-dB / hw, 0.0, 1.0) - 1.0, 2.0), 0.0, 1.0));
  float height = th * prof;
  float shade = mix(0.78, 1.0, prof);
  if (uBandP.x > 0.5 && uBandP.x < 1.5) {
    // ribbed: ridges across the band
    float rib = cos(t * 6.2831853 / max(uBandP.z, 1e-3));
    height *= 0.8 + 0.2 * rib;
    shade *= 0.86 + 0.14 * rib;
  }
  float d = dB;
  if (uBandP.x > 1.5) {
    // bow: loops with holes and V-cut tails tied by the (pinched, raised) band centre; simple dome shading per piece (its height comes from
    // the vertex lift; the lift is added to the bend height so the shading matches the raised shape)
    float tu;
    vec4 bp = furBowParts(t - R * 0.62, s, L, tu);
    float dBow = min(bp.x, bp.w);
    if (dB < 0.0 && wrap > 0.35) {
      // band centre over the loop roots and tails: the band's own fabric, gathered (soft side shading)
      height = th * prof + furBandLift(p) * 0.35;
      shade *= mix(1.0, 0.85 + 0.15 * prof, wrap);
    } else if (dBow < 0.0 || dBow < d) {
      if (bp.x < 0.0) {
        float lp = sqrt(clamp(-bp.x / (L * 0.24), 0.0, 1.0));
        // a little darker where the loops tuck under the band centre
        shade = mix(0.66, 1.03, lp) * mix(0.72, 1.0, smoothstep(L * 0.1, L * 0.36, abs(t - R * 0.62)));
        // darker inner hole
        float hm = 1.0 - smoothstep(-L * 0.02, L * 0.02, bp.y);
        shade *= mix(1.0, 0.5, hm);
      } else {
        float tp = sqrt(clamp(-bp.w / (L * 0.1), 0.0, 1.0));
        shade = mix(0.68, 1.0, tp) * mix(0.78, 1.0, smoothstep(0.0, 0.25, tu));
      }
      height = th * 0.6 + furBandLift(p) * 0.35;
    }
    d = min(d, dBow);
  }
  return vec4(d, height, shade, 1.0);
}
bool furInBand(vec3 p, float h) {
  vec4 s = furBandSdf(p);
  // parted fur: the pile slopes down to the band edge (~45°), like the eye clearing
  return s.w > 0.5 && s.x < uBandW.z + h * uBandPile * 2.2;
}
float furBandShade(vec3 p, inout vec3 col) {
  vec4 s = furBandSdf(p);
  if (s.w < 0.5) return 0.0;
  float aa = max(fwidth(s.x), 1e-5);
  float m = 1.0 - smoothstep(-aa, aa, s.x);
  col = mix(col, uBandCol * s.z, m);
  return s.y * m;
}
`;
