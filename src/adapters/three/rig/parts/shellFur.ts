import * as THREE from 'three';
import type { ColorLike } from '../../../../core/types/AvatarDefinition.ts';
import type { ResolvedAvatarDefinition } from '../../../../core/define/resolveAvatar.ts';
import { registerAtomDrawer } from '../atomDrawers.ts';
import type { SurfaceGlowUniforms } from '../atomDrawers.ts';
import { FUR_MOUTH_BEND_GLSL, FUR_MOUTH_MASK_GLSL, createFurMouthMask, furMouthClearing } from './mouthMask.ts';
import type { FurMouthMask } from './mouthMask.ts';
import { EYE_CLEAR_MAX, FUR_EYE_MASK_GLSL, createFurEyeMask, furEyeClearing } from './furEyeMask.ts';
import type { FurEyeMask } from './furEyeMask.ts';
import { FUR_BAND_MASK_GLSL, FUR_BAND_SDF_GLSL, createFurBandMask, furBandClearing } from './bandMask.ts';
import type { FurBandMask } from './bandMask.ts';
import { SHELL_ASSIGN_GLSL, SHELL_FRAGMENT_GLSL, SHELL_VERTEX_GLSL, ShellStack } from './shellStack.ts';
import { FurTweens } from './furTweens.ts';
import { furShellStyle } from '../../../../core/plugins/fur.schema.ts';
import { MAX_PLUSH_SHELLS, plushOf } from '../../../../core/plugins/plush.schema.ts';
import type { ShellFurParams } from '../../../../core/plugins/plush.schema.ts';

/**
 * Realistic plush shell fur for any geometry (`sdfBody` bodies, tentacle
 * tubes...). One shared material function: N standard-material shells pushed
 * out along the normal, with
 *  - strands: 3D cellular strands on a stable surface coordinate (`furCoord`,
 *    no uv seams/poles), tapering with shell height, per-strand length jitter,
 *    grouped in clumps (low-frequency noise = longer, denser clump centres);
 *    discarded, not blended — no haze, base skin fully opaque;
 *  - flow: strands comb along `furFlow` (default: down with gravity) with
 *    height², plus optional `furWiggle` sway (and the `jelly` deformation);
 *  - shading: self-shadowed roots → lighter tips, per-vertex `furAO` crease
 *    occlusion, Kajiya-Kay anisotropic sheen along the combed strand, soft
 *    rim fuzz;
 *  - pattern: low-frequency tonal mottling, `furTint` secondary colour
 *    (undersides) blended through the fibres with per-strand jitter.
 * Same eye clearing hook as `furShells`, so `reliefEyes` sit in the pile
 * like on Allie. Pile length = `def.fur.length × lengthBoost`. All look
 * parameters come from `def.plush` (see `shellFur.schema.ts`) and are pushed
 * as uniforms every frame: studio edits are live, nothing is rebuilt.
 * Performance: built on the shared `ShellStack`: the opaque base + ONE
 * instanced draw for all shells (per-shell height is an instance attribute);
 * one material per surface, shared by base and shells; the shell count is the
 * instance count over a fixed pool. Uniforms are rewritten only when the
 * definition changes (plus the sway clock).
 */
export { DEFAULT_PLUSH, MAX_PLUSH_SHELLS, configurePlushDefaults, plushOf } from '../../../../core/plugins/plush.schema.ts';
export type { ShellFurParams } from '../../../../core/plugins/plush.schema.ts';

/** Pile length when the definition has no `fur.length` (body units). */
const FALLBACK_LENGTH = 0.06;

interface ShellUniforms {
  uFurLen: { value: number };
  uFurTime: { value: number };
  uFurWiggle: { value: number };
  uFurDensity: { value: number };
  uFurClump: { value: number };
  uFurClumping: { value: number };
  uFurTaper: { value: number };
  uFurLean: { value: number };
  uFurRootShade: { value: number };
  uFurMottle: { value: number };
  uFurMottleScale: { value: number };
  uFurStrandVar: { value: number };
  uFurTintSoft: { value: number };
  uFurTintHeight: { value: number };
  uFurSheen: { value: number };
  uFurTint: { value: THREE.Color };
  uRim: { value: THREE.Color };
  uRimK: { value: number };
}

const FUR_NOISE_GLSL = /* glsl */ `
vec3 furHash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float furVNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = furHash3(i).x, b = furHash3(i + vec3(1,0,0)).x, c = furHash3(i + vec3(0,1,0)).x, d = furHash3(i + vec3(1,1,0)).x;
  float e = furHash3(i + vec3(0,0,1)).x, g = furHash3(i + vec3(1,0,1)).x, h = furHash3(i + vec3(0,1,1)).x, k = furHash3(i + vec3(1,1,1)).x;
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
// nearest strand: x = distance to its centre (cell units), y = strand random
vec2 furCell(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  float best = 9.0; float id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = furHash3(i + o);
    vec3 d = o + r - f;
    float l = dot(d, d);
    if (l < best) { best = l; id = r.z; }
  }
  return vec2(sqrt(best), id);
}
`;

/**
 * Optional GPU deformation of the surface (e.g. simulated tentacle tubes): `body` runs at the top of the
 * vertex shader and must assign `furPos`, `furNrm`, `furFlowA`, `furAOA`, `furTintA` (object space);
 * they replace the `position` / `normal` / `furFlow` / `furAO` / `furTint` attributes everywhere.
 */
export interface ShellFurDeform {
  /** Program cache key suffix. */
  key: string;
  uniforms: Record<string, THREE.IUniform>;
  header: string;
  body: string;
}

/** Ordered (4×4 Bayer) dither: `uFurFade` < 1 discards that share of fragments, everything stays opaque + depth-writing. */
const FUR_FADE_GLSL = /* glsl */ `
uniform float uFurFade;
float furBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float furBayer4(vec2 a) { return furBayer2(0.5 * a) * 0.25 + furBayer2(a); }
`;

/** Soft emissive spot (e.g. a plugin's pulsing glow on the chest): gaussian around `uGlow.xyz` (radius `uGlow.w`), skipped while `uGlowColor` is black. */
const FUR_GLOW_GLSL = /* glsl */ `
uniform vec4 uGlow; uniform vec3 uGlowColor;
`;

/** New glow uniforms (off). */
export function createSurfaceGlow(): SurfaceGlowUniforms {
  return { uGlow: { value: new THREE.Vector4(0, 0, 1, 0.35) }, uGlowColor: { value: new THREE.Color(0, 0, 0) } };
}

function createShellMaterial(u: ShellUniforms, mask: FurEyeMask, mouth: FurMouthMask, band: FurBandMask, color: THREE.Color, deform?: ShellFurDeform, fade?: THREE.IUniform<number>, glow?: SurfaceGlowUniforms): THREE.MeshStandardMaterial {
  // every shell is opaque + depth-writing: strands are discarded (alpha-tested), never blended
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, transparent: false, depthWrite: true, side: THREE.FrontSide });
  m.userData.followBody = true;
  m.userData.fur = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, mask, mouth, band, { uFurShell: { value: BASE_SHELL } }, deform?.uniforms, fade && { uFurFade: fade }, glow);
    sh.vertexShader =
      'attribute float furTint; attribute float furWiggle; attribute float furAO; attribute vec3 furCoord; attribute vec3 furFlow;\n' +
      'uniform float uFurLen; uniform float uFurTime; uniform float uFurWiggle; uniform float uFurLean;\n' +
      SHELL_VERTEX_GLSL +
      FUR_BAND_SDF_GLSL +
      '#define uFurH furShellV.x\n' +
      'varying float vFurTint; varying float vFurAO; varying vec3 vFurCoord; varying vec3 vFurObj; varying vec3 vFurDirV;\n' +
      (deform ? deform.header : '') +
      sh.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          deform
            ? `vec3 furPos; vec3 furNrm; vec3 furFlowA; float furAOA; float furTintA;
${deform.body}
#include <beginnormal_vertex>
objectNormal = furNrm;`
            : `vec3 furPos = position; vec3 furFlowA = furFlow; float furAOA = furAO; float furTintA = furTint;
#include <beginnormal_vertex>`,
        )
        .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
${deform ? 'transformed = furPos;' : ''}
${SHELL_ASSIGN_GLSL}
vec3 furN = normalize(objectNormal);
// comb direction: furFlow (tentacles: toward the tip) else gravity, projected on the surface
vec3 furF = dot(furFlowA, furFlowA) > 1e-4 ? furFlowA : vec3(0.0, -1.0, 0.0);
furF -= furN * dot(furF, furN);
furF = dot(furF, furF) > 1e-5 ? normalize(furF) : vec3(0.0);
float furAng = atan(furPos.x, furPos.z);
float furW = sin(uFurTime * 2.1 + furAng * 3.0 + furPos.y * 4.0) * uFurWiggle * furWiggle;
vec3 furDir = normalize(furN + furF * uFurLean * 1.6 * uFurH);
transformed += furN * uFurLen * uFurH + furF * uFurLen * uFurLean * uFurH * uFurH;
transformed += vec3(cos(furAng), 0.3, -sin(furAng)) * furW * uFurH;
// hairband bow: real height off the surface (skin and shells ride up together; masks stay on the surface coords)
transformed += furN * furBandLift(furPos);
vFurDirV = normalize(normalMatrix * furDir);
vFurTint = furTintA;
vFurAO = furAOA;
vFurCoord = furCoord;
vFurObj = furPos + furN * uFurLen * uFurH;`,
      );
    sh.fragmentShader =
      SHELL_FRAGMENT_GLSL +
      '#define uFurH vFurShell.x\n' +
      'uniform float uFurDensity; uniform float uFurClump; uniform float uFurClumping; uniform float uFurTaper; uniform float uFurRootShade; uniform float uFurMottle; uniform float uFurMottleScale; uniform float uFurStrandVar; uniform float uFurTintSoft; uniform float uFurTintHeight; uniform float uFurSheen; uniform vec3 uFurTint; uniform vec3 uRim; uniform float uRimK;\n' +
      'varying float vFurTint; varying float vFurAO; varying vec3 vFurCoord; varying vec3 vFurObj; varying vec3 vFurDirV;\n' +
      FUR_NOISE_GLSL +
      FUR_EYE_MASK_GLSL +
      FUR_MOUTH_MASK_GLSL +
      FUR_BAND_SDF_GLSL +
      FUR_BAND_MASK_GLSL +
      (fade ? FUR_FADE_GLSL : '') +
      (glow ? FUR_GLOW_GLSL : '') +
      sh.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
${fade ? 'if (uFurFade < 0.999 && furBayer4(gl_FragCoord.xy) + 0.03125 > uFurFade) discard;' : ''}
vec2 furS = furCell(vFurCoord * uFurDensity);
// early out: outside the widest possible strand radius this shell fragment is discarded below anyway
// (same decision, skips the clump noise for the majority of shell fragments)
if (uFurH > 0.001 && furS.x > 0.62 * max(1.0, uFurTaper)) discard;
// clumps: low-frequency noise, clump centres longer / denser
float furClumpN = furVNoise(vFurCoord * uFurClump);
float furClumpN2 = furVNoise(vFurCoord * uFurClump * 2.7 + 17.0);
float furClumpLen = 1.0 - uFurClumping + uFurClumping * smoothstep(0.2, 0.8, furClumpN * 0.7 + furClumpN2 * 0.3);
float furLen = max(furClumpLen, 0.2) * (0.7 + 0.3 * furS.y);
if (uFurH > 0.001) {
  // tapered strands: radius shrinks with height; strands end at their own length
  float furR = mix(0.62, 0.62 * uFurTaper, uFurH / max(furLen, 0.05));
  if (uFurH > furLen || furS.x > furR) discard;
  // embedded eyes: no pile over their footprint (+ outline)
  if (uEyeM.w > 0.5) {
    float furEd = furEyeDist(vFurObj);
    if (furEd < min(uEyeM.y + uEyeM.z * uFurH, ${EYE_CLEAR_MAX.toFixed(3)})) discard;
  }
  // embedded mouth: same crisp clearing
  if (furInMouth(vFurObj)) discard;
  // hairband: fur parted around the band (crater widens with pile height)
  if (furInBand(vFurObj, uFurH)) discard;
}
// peach blended through the fibres (per-strand jitter around the transition)
float furT = clamp(vFurTint + uFurTintHeight + ((furS.y - 0.5) * 0.45 * (1.0 - abs(vFurTint * 2.0 - 1.0)) + (furClumpN - 0.5) * 0.2) * (0.3 + uFurTintSoft), 0.0, 1.0);
float furSoft = 0.02 + 0.48 * uFurTintSoft;
diffuseColor.rgb = mix(diffuseColor.rgb, uFurTint, smoothstep(0.5 - furSoft, 0.5 + furSoft, furT));
// tonal mottling (base + pile)
float furM = furVNoise(vFurCoord * uFurMottleScale) * 0.6 + furVNoise(vFurCoord * uFurMottleScale * 2.2 + 3.0) * 0.4;
diffuseColor.rgb *= 1.0 + (furM - 0.5) * 2.0 * uFurMottle;
diffuseColor.rgb *= 1.0 + (furS.y - 0.5) * 2.0 * uFurStrandVar;
// self-shadow: dark roots → light tips; crease AO fades out toward the tips
float furHt = uFurH / max(furLen, 0.05);
diffuseColor.rgb *= mix(1.0 - uFurRootShade, 1.08, sqrt(clamp(furHt, 0.0, 1.0)));
diffuseColor.rgb *= mix(vFurAO, 1.0, 0.35 + 0.5 * furHt);
diffuseColor.a = 1.0;
// embedded mouth decal (skin only; shells are cleared above)
float furMouthH = 0.0;
if (uFurH < 0.001) {
  furMouthH = furMouthShade(vFurObj, diffuseColor.rgb);
  // hairband decal (relief shares the mouth's normal bend)
  furMouthH += furBandShade(vFurObj, diffuseColor.rgb);
}`,
        )
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FUR_MOUTH_BEND_GLSL)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
{
  vec3 V = normalize(vViewPosition);
  vec3 L = normalize(vec3(-0.35, 0.8, 0.5));
  vec3 Hh = normalize(L + V);
  vec3 Tt = normalize(vFurDirV);
  float th = dot(Tt, Hh);
  // Kajiya-Kay: primary (white-ish) + secondary (tinted, broader) lobes, stronger toward the tips
  float furSpec = pow(sqrt(max(0.0, 1.0 - th * th)), 80.0) * 0.6 + pow(sqrt(max(0.0, 1.0 - th * th)), 14.0) * 0.4;
  float furTip = clamp(uFurH / max(furLen, 0.05), 0.0, 1.0);
  totalEmissiveRadiance += mix(vec3(1.0), diffuseColor.rgb, 0.5) * furSpec * uFurSheen * furTip * vFurAO;
  float furRim = pow(1.0 - clamp(dot(normalize(normal), V), 0.0, 1.0), 2.2);
  totalEmissiveRadiance += uRim * furRim * uRimK * (0.3 + 0.7 * furTip) * vFurAO;
${glow ? `  if (uGlowColor.r + uGlowColor.g + uGlowColor.b > 0.0) {
    vec3 gd = (vFurObj - uGlow.xyz) / uGlow.w;
    totalEmissiveRadiance += uGlowColor * exp(-dot(gd, gd) * 1.6) * (0.45 + 0.55 * furTip);
  }` : ''}
}`,
        );
  };
  m.customProgramCacheKey = () => `shellFur8${deform ? `|${deform.key}` : ''}${fade ? '|fade' : ''}${glow ? '|glow' : ''}`;
  return m;
}

/** Base layer: h = 0. */
const BASE_SHELL = new THREE.Vector4(0, 0, 0, 1);

export interface ShellFur {
  group: THREE.Group;
  /** Opaque base shell. */
  base: THREE.Mesh;
  update(def: ResolvedAvatarDefinition, time: number, revision?: number): void;
}

export interface ShellFurOptions {
  /** Eye / mouth / hairband clearings (the body's; default: none). */
  mask?: FurEyeMask;
  mouth?: FurMouthMask;
  band?: FurBandMask;
  deform?: ShellFurDeform;
  /** Pile length × this (default 1; e.g. a short-pile atom). */
  pile?: number;
  /** At most this many layers incl. the base (default: the plush `shells`). */
  maxShells?: number;
  /** Dithered fade 0..1 (`value`, you drive it): opaque + depth-writing at every step, never sorted. */
  fade?: THREE.IUniform<number>;
  /** Emissive spot uniforms (see `createSurfaceGlow`); omit for no glow code in the shader. */
  glow?: SurfaceGlowUniforms;
}

/**
 * Shell fur over any geometry (body, tentacle tubes, atoms...) in a family's style.
 * Missing attributes get defaults: `furTint`/`furWiggle` 0, `furAO` 1,
 * `furFlow` 0 (= gravity), `furCoord` = the rest position.
 */
export function createShellFur(geo: THREE.BufferGeometry, def: ResolvedAvatarDefinition, options: ShellFurOptions = {}): ShellFur {
  const { mask = createFurEyeMask(), mouth = createFurMouthMask(def.body.color), band = createFurBandMask(), deform, pile = 1, maxShells = MAX_PLUSH_SHELLS, fade, glow } = options;
  const n = geo.attributes.position!.count;
  for (const a of ['furTint', 'furWiggle']) if (!geo.attributes[a]) geo.setAttribute(a, new THREE.BufferAttribute(new Float32Array(n), 1));
  if (!geo.attributes.furAO) geo.setAttribute('furAO', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  if (!geo.attributes.furFlow) geo.setAttribute('furFlow', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  if (!geo.attributes.furCoord) geo.setAttribute('furCoord', (geo.attributes.position as THREE.BufferAttribute).clone());
  const color = new THREE.Color(def.body.color as THREE.ColorRepresentation);
  const lengthOf = (d: ResolvedAvatarDefinition) => (d.fur ? (d.fur.length ?? FALLBACK_LENGTH) * furShellStyle(d.family).lengthBoost * pile : 0);
  const p0 = plushOf(def);
  const u: ShellUniforms = {
    uFurLen: { value: lengthOf(def) },
    uFurTime: { value: 0 },
    uFurWiggle: { value: 0 },
    uFurDensity: { value: 0 },
    uFurClump: { value: 0 },
    uFurClumping: { value: 0 },
    uFurTaper: { value: 0 },
    uFurLean: { value: 0 },
    uFurRootShade: { value: 0 },
    uFurMottle: { value: 0 },
    uFurMottleScale: { value: 0 },
    uFurStrandVar: { value: 0 },
    uFurTintSoft: { value: 0 },
    uFurTintHeight: { value: 0 },
    uFurSheen: { value: 0 },
    uFurTint: { value: new THREE.Color() },
    uRim: { value: color.clone().lerp(new THREE.Color(1, 1, 1), 0.5) },
    uRimK: { value: 0 },
  };
  const group = new THREE.Group();
  group.name = 'shellFur';
  // one material for the base and every shell; fixed pool, the visible count is the instance count (no rebuild)
  const mat = createShellMaterial(u, mask, mouth, band, color, deform, fade, glow);
  const cap = Math.max(2, Math.min(MAX_PLUSH_SHELLS, maxShells));
  const stack = new ShellStack(group, geo, mat, mat, cap - 1, (m) => {
    m.renderOrder = 1;
  });
  const base = stack.base;
  base.name = 'body';
  base.castShadow = true;
  base.receiveShadow = true;
  let shown = -1;
  const apply = (p: ShellFurParams) => {
    const count = Math.max(2, Math.min(cap, Math.round(p.shells)));
    if (count !== shown) {
      shown = count;
      for (let i = 1; i < count; i++) stack.set(i - 1, i / (count - 1), 0, 0, 1);
      stack.setCount(count - 1);
    }
    u.uFurWiggle.value = p.wiggle;
    u.uFurDensity.value = p.strandDensity;
    u.uFurClump.value = p.clumpScale;
    u.uFurClumping.value = p.clumping;
    u.uFurTaper.value = p.taper;
    u.uFurLean.value = p.lean;
    u.uFurRootShade.value = p.rootShade;
    u.uFurMottle.value = p.mottle;
    u.uFurMottleScale.value = p.mottleScale;
    u.uFurStrandVar.value = p.strandVariation;
    u.uFurTintSoft.value = p.tintSoftness;
    u.uFurTintHeight.value = p.tintHeight;
    u.uFurSheen.value = p.sheen;
    u.uRimK.value = p.rim;
    u.uFurTint.value.set(p.tint);
  };
  apply(p0);
  band.uBandPile.value = u.uFurLen.value;
  let applied: ResolvedAvatarDefinition = def;
  let appliedRev = 0;
  return {
    group,
    base,
    update(d, time, rev = 0) {
      u.uFurTime.value = time;
      // look uniforms only change with the definition or a preset (dirty flag: same object + revision = nothing to write)
      if (d === applied && rev === appliedRev) return;
      applied = d;
      appliedRev = rev;
      u.uFurLen.value = lengthOf(d);
      band.uBandPile.value = u.uFurLen.value;
      apply(plushOf(d));
    },
  };
}

/** Rig part `shellFur`: plush shells over `ctx.geometry`; sets `ctx.bodyMesh` to the opaque base shell. */
registerAtomDrawer({
  kind: 'shellFur',
  build(ctx) {
    const mask = createFurEyeMask();
    ctx.eyeClearing = furEyeClearing(mask);
    const mouth = createFurMouthMask(ctx.def.body.color);
    ctx.mouthClearing = furMouthClearing(mouth);
    const band = createFurBandMask();
    ctx.bandClearing = furBandClearing(band);
    ctx.furTweens ??= new FurTweens(ctx.def);
    // the body exposes an emissive spot (e.g. a pulsing glow), uniforms only
    const glow = createSurfaceGlow();
    ctx.surfaceGlow = glow;
    const fur = createShellFur(ctx.geometry!, ctx.def, { mask, mouth, band, glow });
    ctx.bodyMesh = fur.base;
    ctx.procedural.add(fur.group);
    // tips sway; length / secondary colour follow the live definition
    ctx.updaters.push((f) => fur.update(f.definition, f.time, f.revision));
  },
});
