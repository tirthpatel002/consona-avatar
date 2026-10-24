import * as THREE from 'three';
import type { ColorLike } from '../../../../core/types/AvatarDefinition.ts';
import type { FurRegion, AvatarFurOptions } from '../../../../core/plugins/fur.schema.ts';
import { furShellStyle } from '../../../../core/plugins/fur.schema.ts';
import { EYE_CLEAR_MAX, FUR_EYE_MASK_GLSL, createFurEyeMask } from './furEyeMask.ts';
import type { FurEyeMask } from './furEyeMask.ts';
import { getSharedFurTextures } from '../../materials/patterns.ts';
import { FUR_MOUTH_BEND_GLSL, FUR_MOUTH_MASK_GLSL, createFurMouthMask } from './mouthMask.ts';
import type { FurMouthMask } from './mouthMask.ts';
import { SHELL_ASSIGN_GLSL, SHELL_FRAGMENT_GLSL, SHELL_VERTEX_GLSL, ShellStack } from './shellStack.ts';
import type { FurTweens } from './furTweens.ts';

/**
 * Shell-texture fur. Each shell is the same geometry pushed out along the
 * normal in the vertex shader and cut against strand noise; roots are
 * darkened (fake AO) and a fresnel rim glow is added.
 *
 * Anti-shimmer: instead of a hard alpha test on raw per-texel noise, the
 * strand noise is mipmapped (anchored in UV space) and its contrast is
 * restored from the screen-space texel footprint; the cut is a smoothstep
 * whose width comes from fwidth (>= ~1px), resolved with alpha-to-coverage
 * on the MSAA buffer, and the outermost shells fade out softly.
 *
 * GLB SWAP POINT: the technique works on any mesh with UVs — call
 * `makeFurry(gltfMesh.geometry, color)` on a Blender body to keep the look.
 */
/** Global fur tuning (applied at render time to every character, so relative looks are preserved). */

/** Max fur regions per fur group. */
export const MAX_FUR_REGIONS = 4;

/** Region uniforms shared by all shells of one fur group: centre, radii + softness, (lighten, length, -, enabled). */
export interface FurRegionUniforms {
  uRegC: { value: THREE.Vector3[] };
  uRegR: { value: THREE.Vector4[] };
  uRegK: { value: THREE.Vector4[] };
}

export function createFurRegionUniforms(): FurRegionUniforms {
  const n = Array.from({ length: MAX_FUR_REGIONS });
  return {
    uRegC: { value: n.map(() => new THREE.Vector3()) },
    uRegR: { value: n.map(() => new THREE.Vector4(1, 1, 1, 0.15)) },
    uRegK: { value: n.map(() => new THREE.Vector4(0, 1, 0, 0)) },
  };
}

export function writeFurRegions(u: FurRegionUniforms, regions: readonly FurRegion[] = []): void {
  for (let i = 0; i < MAX_FUR_REGIONS; i++) {
    const r = regions[i];
    if (!r) {
      u.uRegK.value[i]!.set(0, 1, 0, 0);
      continue;
    }
    u.uRegC.value[i]!.set(...r.center);
    u.uRegR.value[i]!.set(r.radii[0], r.radii[1], r.radii[2], Math.min(1, Math.max(1e-3, r.soft ?? 0.15)));
    u.uRegK.value[i]!.set(r.lighten ?? 0, r.length ?? 1, 0, 1);
  }
}

/** GLSL: (fur length scale, lighten) at a body-group point. */
const REGION_GLSL = /* glsl */ `
uniform vec3 uRegC[${MAX_FUR_REGIONS}]; uniform vec4 uRegR[${MAX_FUR_REGIONS}]; uniform vec4 uRegK[${MAX_FUR_REGIONS}];
vec2 furRegion(vec3 p) {
  float len = 1.0; float lit = 0.0;
  for (int i = 0; i < ${MAX_FUR_REGIONS}; i++) {
    if (uRegK[i].w < 0.5) continue;
    float d = length((p - uRegC[i]) / max(uRegR[i].xyz, vec3(1e-4)));
    float w = 1.0 - smoothstep(1.0 - uRegR[i].w, 1.0, d);
    len *= mix(1.0, uRegK[i].y, w);
    lit = max(lit, uRegK[i].x * w);
  }
  return vec2(len, lit);
}
`;

/** Strand-noise cut threshold for shell height `h` (0..1) at a given density (incl. the global boost). */
export function furCut(h: number, density: number, densityBoost = furShellStyle().densityBoost): number {
  if (h <= 0) return 0;
  const cut0 = Math.min(0.995, 0.2 + 0.78 * Math.pow(h, 0.7) + (1 - density) * 0.6 * Math.pow(h, 0.35));
  // global density boost: strand noise is rand^1.6, so coverage above a cut c is 1 - c^(1/1.6);
  // scale that coverage by the family's density boost and invert back to a cut.
  return Math.pow(Math.max(0, 1 - Math.min(1, (1 - Math.pow(cut0, 1 / 1.6)) * densityBoost)), 1.6);
}

/**
 * Live fur uniforms shared by a stack's shells (droop, root shade, pattern
 * shade, a second pattern for crossfades…), so any fur edit updates in place.
 * Per-shell data (height, offset, cut, layer fade) is the stack's instanced
 * `furShell` attribute; the base mesh reads it from `uFurShell`.
 */
export interface FurShellUniforms {
  uFurShell: { value: THREE.Vector4 };
  uRim: { value: THREE.Color };
  uShadeBase: { value: number };
  uShadeH: { value: number };
  uDroop: { value: number };
  uPatShade: { value: number };
  uBumpB: { value: THREE.Texture | null };
  uBumpMix: { value: number };
  uBumpBScale: { value: THREE.Vector2 };
}

const BUMP_PARS = THREE.ShaderChunk.bumpmap_pars_fragment.split('texture2D( bumpMap, ').join('furBump( ');

export function createFurMaterial(
  color: ColorLike,
  shell: boolean,
  opts: Required<AvatarFurOptions> & { patternRepeatSet?: boolean; densityBoost?: number },
  mask: FurEyeMask = createFurEyeMask(),
  regions: FurRegionUniforms = createFurRegionUniforms(),
  mouth: FurMouthMask = createFurMouthMask(),
): THREE.MeshStandardMaterial {
  const { strands, knit } = getSharedFurTextures(opts.strandRepeat, opts.pattern, opts.patternRepeatSet ? opts.patternRepeat : undefined);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    // the pattern map is always bound (knit off = bumpScale 0) so toggling never recompiles
    bumpMap: knit,
    bumpScale: opts.knit ? opts.bumpScale : 0,
    alphaMap: shell ? strands : null,
    // tiny cutoff only discards fully-empty texels; coverage does the rest
    alphaTest: shell ? 0.004 : 0,
    alphaToCoverage: shell,
  });
  const strandSize = (strands.image as { width?: number } | undefined)?.width ?? 256;
  const u: FurShellUniforms = {
    // base layer: h = 0, no offset, no cut, fully shown
    uFurShell: { value: new THREE.Vector4(0, 0, 0, 1) },
    uRim: { value: new THREE.Color(color).lerp(WHITE, 0.5) },
    uShadeBase: { value: 1 - opts.rootShade },
    uShadeH: { value: opts.rootShade },
    uDroop: { value: opts.droop },
    uPatShade: { value: opts.knit ? opts.patternShade : 0 },
    uBumpB: { value: knit },
    uBumpMix: { value: 0 },
    uBumpBScale: { value: new THREE.Vector2(1, 1) },
  };
  m.userData.fur = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, mask, regions, mouth, { uStrandSize: { value: strandSize } });
    sh.vertexShader =
      'uniform float uDroop; varying vec3 vFurObj; varying float vFurLit;\n' +
      SHELL_VERTEX_GLSL +
      REGION_GLSL +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${SHELL_ASSIGN_GLSL}\n vec2 furReg = furRegion(position); vFurLit = furReg.y; float furOff = furShellV.y * furReg.x;\n transformed += objectNormal * furOff; transformed.y -= furOff * furOff * uDroop; vFurObj = transformed;`,
      );
    sh.fragmentShader =
      'uniform vec3 uRim; uniform float uStrandSize;\n' +
      SHELL_FRAGMENT_GLSL +
      '#define uH vFurShell.x\n#define uCut vFurShell.z\n#define uFade vFurShell.w\n' +
      'uniform float uShadeBase; uniform float uShadeH; uniform float uPatShade;\n' +
      'uniform sampler2D uBumpB; uniform float uBumpMix; uniform vec2 uBumpBScale;\n' +
      FUR_EYE_MASK_GLSL + FUR_MOUTH_MASK_GLSL + 'varying vec3 vFurObj; varying float vFurLit;\n' +
      sh.fragmentShader
        .replace(
          '#include <bumpmap_pars_fragment>',
          `#ifdef USE_BUMPMAP
 uniform sampler2D bumpMap;
 uniform float bumpScale;
 // pattern crossfade: current map blended toward the incoming one (its own repeat via uBumpBScale)
 vec4 furBump( vec2 uv ) { return mix( texture2D( bumpMap, uv ), texture2D( uBumpB, uv * uBumpBScale ), uBumpMix ); }
#endif
${BUMP_PARS.replace(/uniform sampler2D bumpMap;\s*/, '').replace(/uniform float bumpScale;\s*/, '')}`,
        )
        .replace(
          '#include <alphamap_fragment>',
          `#ifdef USE_ALPHAMAP
 {
   // texel footprint of the (repeated) strand noise on screen
   vec2 tuv = vAlphaMapUv * uStrandSize;
   float rho = sqrt(length(dFdx(tuv)) * length(dFdy(tuv)));
   float n = texture2D(alphaMap, vAlphaMapUv).g;
   // mip averaging shrinks the noise spread ~1/rho: restore it around the mean (E[rand^1.6] = 1/2.6)
   n = 0.3846 + (n - 0.3846) * clamp(rho, 1.0, 16.0);
   // >= ~1.5px soft edge; wider when strands are sub-pixel
   float w = max(fwidth(n) * 1.5, 0.02 + 0.03 * clamp(rho - 1.0, 0.0, 4.0));
   // prefiltering thins strands where they are sub-pixel (silhouette): lower the cut there to keep the fuzzy halo
   float cutK = uCut - 0.05 * clamp(rho - 1.0, 0.0, 3.0) * uH;
   float a = smoothstep(cutK - w, cutK + w, n);
   // soft fade of the outermost shells; uFade fades whole layers in/out (shell-count edits)
   a *= (1.0 - 0.2 * smoothstep(0.8, 1.0, uH)) * uFade;
   // embedded eyes: no fur over their footprint (+ outline), soft tight margin
   if (uEyeM.w > 0.5) {
     float d = furEyeDist(vFurObj);
     float edge = min(uEyeM.y + uEyeM.z * uH, ${EYE_CLEAR_MAX.toFixed(3)});
     a *= smoothstep(edge, edge + max(fwidth(d) * 1.5, 0.03), d);
   }
   // embedded mouth: crisp clearing
   if (furInMouth(vFurObj)) a = 0.0;
   diffuseColor.a *= a;
 }
#endif`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
 diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vFurLit);
 float furShade = uShadeBase + uShadeH * uH + 0.15;
 // the bare skin right around an eye is not in the fur's shadow (no dark socket)
 if (uH < 1e-3 && uEyeM.w > 0.5) furShade = mix(furShade, 1.0, 1.0 - smoothstep(uEyeM.y, uEyeM.y + 0.25, furEyeDist(vFurObj)));
 diffuseColor.rgb *= furShade;
 #ifdef USE_BUMPMAP
 diffuseColor.rgb *= mix(1.0 - uPatShade, 1.0, furBump(vBumpMapUv).r);
 #endif
 // embedded mouth decal (skin only; shells clear over it)
 float furMouthH = 0.0;
 if (uH < 1e-3) furMouthH = furMouthShade(vFurObj, diffuseColor.rgb);`,
        )
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FUR_MOUTH_BEND_GLSL)
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n float fr = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);\n totalEmissiveRadiance += uRim * fr * fr * (0.1 + 0.6 * uH);',
        );
  };
  m.customProgramCacheKey = () => `furShells5:${shell}`;
  return m;
}
const WHITE = new THREE.Color(0xffffff);

/**
 * Knit/shell fur around one geometry, on the shared `ShellStack` (base mesh +
 * one instanced draw for every shell). Shells are only ever ADDED (capacity
 * growth), never disposed during edits. Shell count is continuous: layer i
 * sits at h = i/n and the top partial layer fades.
 */
export class FurLayers {
  readonly group = new THREE.Group();
  readonly base: THREE.Mesh;
  readonly mask = createFurEyeMask();
  readonly mouthMask: FurMouthMask;
  /** Fur regions (short-fur / lighter patches), shared by every shell. */
  readonly regions = createFurRegionUniforms();
  /** Live fur tweens (set by the owning atom drawer; see `follow`). */
  tweens?: FurTweens;
  private readonly stack: ShellStack;
  private opts: Required<AvatarFurOptions> & { patternRepeatSet?: boolean; densityBoost: number };
  /** Current (possibly fractional) shell count. 0 = no fur (plain base). */
  n: number;
  length: number;
  density: number;
  readonly color: THREE.Color;
  private patternA: THREE.Texture;
  private patternB: THREE.Texture | null = null;
  private readonly baseMat: THREE.MeshStandardMaterial;
  private readonly shellMat: THREE.MeshStandardMaterial;
  private readonly mats: THREE.MeshStandardMaterial[];

  /** `family`: whose fur style (defaults + boosts) to use; defaults to the active build family. */
  constructor(geo: THREE.BufferGeometry, color: ColorLike, fur: AvatarFurOptions | false, family?: string) {
    const style = furShellStyle(family);
    const merged = { ...style.defaults, ...(fur || {}) };
    this.opts = { ...merged, densityBoost: style.densityBoost, length: merged.length * style.lengthBoost, patternRepeatSet: !!(fur && fur.patternRepeat) };
    this.n = fur === false ? 0 : this.opts.shells;
    this.length = this.opts.length;
    this.density = this.opts.density;
    writeFurRegions(this.regions, this.opts.regions);
    this.color = new THREE.Color(color);
    this.mouthMask = createFurMouthMask(color);
    this.group.name = 'fur';
    this.baseMat = createFurMaterial(color, false, this.opts, this.mask, this.regions, this.mouthMask);
    this.shellMat = createFurMaterial(color, true, this.opts, this.mask, this.regions, this.mouthMask);
    copyStyle(this.baseMat.userData.fur as FurShellUniforms, this.shellMat.userData.fur as FurShellUniforms);
    this.mats = [this.baseMat, this.shellMat];
    this.stack = new ShellStack(this.group, geo, this.baseMat, this.shellMat, Math.ceil(this.n));
    this.stack.onShells = (m) => this.group.userData.onAdd?.(m);
    this.base = this.stack.base;
    this.group.userData.base = this.base;
    this.group.userData.eyeMask = this.mask;
    this.group.userData.layers = this;
    this.patternA = this.baseMat.bumpMap!;
    if (fur === false) this.setStyle({ knit: false });
    this.apply();
  }

  get materials(): THREE.MeshStandardMaterial[] {
    return this.mats;
  }

  /** Make sure at least `count` shells fit (capacity grows, nothing is removed). */
  ensure(count: number): void {
    this.stack.reserve(count);
  }

  /** Push n / length / density into every layer (instanced data; uploads only on change). */
  apply(): void {
    const n = Math.max(0, this.n);
    const total = Math.ceil(n);
    this.ensure(total);
    let visible = 0;
    for (let k = 0; k < total; k++) {
      const i = k + 1;
      const h = n > 0 ? Math.min(1, i / Math.max(n, 1)) : 1;
      const fade = Math.min(1, Math.max(0, n - (i - 1)));
      this.stack.set(k, h, h * this.length, furCut(h, this.density, this.opts.densityBoost), fade);
      if (fade > 0.002) visible = i;
    }
    this.stack.setCount(visible);
  }

  /** Follow the live tweens (shell count, length, density, style) for `family`'s style. */
  follow(t: FurTweens, family?: string): void {
    this.n = Math.max(0, t.shells.x);
    this.length = t.liveLength(family);
    this.density = t.density.x;
    this.apply();
    this.setStyle({ rootShade: t.rootShade.x, droop: t.droop.x, patternShade: Math.max(0, t.patternShade.x), bumpScale: Math.max(0, t.bumpScale.x), knit: true });
  }

  /** Replace the fur regions (uniform write; no recompile). */
  setRegions(regions: readonly FurRegion[] = []): void {
    writeFurRegions(this.regions, regions);
  }

  setColor(c: THREE.Color): void {
    this.color.copy(c);
    for (const m of this.mats) {
      m.color.copy(c);
      (m.userData.fur as FurShellUniforms).uRim.value.copy(c).lerp(WHITE, 0.5);
    }
  }

  /** Snap style values (tweened by `follow`). */
  setStyle(p: { rootShade?: number; droop?: number; patternShade?: number; bumpScale?: number; knit?: boolean }): void {
    if (p.rootShade !== undefined) this.opts.rootShade = p.rootShade;
    if (p.droop !== undefined) this.opts.droop = p.droop;
    if (p.patternShade !== undefined) this.opts.patternShade = p.patternShade;
    if (p.bumpScale !== undefined) this.opts.bumpScale = p.bumpScale;
    if (p.knit !== undefined) this.opts.knit = p.knit;
    for (const m of this.mats) {
      const u = m.userData.fur as FurShellUniforms;
      u.uShadeBase.value = 1 - this.opts.rootShade;
      u.uShadeH.value = this.opts.rootShade;
      u.uDroop.value = this.opts.droop;
      u.uPatShade.value = this.opts.knit ? this.opts.patternShade : 0;
      m.bumpScale = this.opts.knit ? this.opts.bumpScale : 0;
    }
  }

  /** Swap the strand noise repeat (texture swap on the same materials; no recompile). */
  setStrandRepeat(repeat: [number, number]): void {
    const { strands } = getSharedFurTextures(repeat);
    for (const m of this.mats) if (m.alphaMap) m.alphaMap = strands;
  }

  /** Begin a pattern crossfade toward `name`/`repeat`; drive it with `setPatternMix`. */
  beginPattern(name: string, repeat?: [number, number]): void {
    const { knit } = getSharedFurTextures(this.opts.strandRepeat, name, repeat);
    this.patternB = knit;
    const a = this.patternA.repeat;
    const sx = knit.repeat.x / (a.x || 1), sy = knit.repeat.y / (a.y || 1);
    for (const m of this.mats) {
      const u = m.userData.fur as FurShellUniforms;
      u.uBumpB.value = knit;
      u.uBumpBScale.value.set(sx, sy);
    }
  }

  setPatternMix(k: number): void {
    for (const m of this.mats) (m.userData.fur as FurShellUniforms).uBumpMix.value = k;
    if (k >= 1 && this.patternB) {
      this.patternA = this.patternB;
      this.patternB = null;
      for (const m of this.mats) {
        m.bumpMap = this.patternA;
        const u = m.userData.fur as FurShellUniforms;
        u.uBumpMix.value = 0;
        u.uBumpB.value = this.patternA;
        u.uBumpBScale.value.set(1, 1);
      }
    }
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    this.stack.shells.dispose();
  }
}

function copyStyle(a: FurShellUniforms, b: FurShellUniforms) {
  b.uShadeBase.value = a.uShadeBase.value;
  b.uShadeH.value = a.uShadeH.value;
  b.uDroop.value = a.uDroop.value;
  b.uPatShade.value = a.uPatShade.value;
  b.uRim.value.copy(a.uRim.value);
  b.uBumpB.value = a.uBumpB.value;
  b.uBumpMix.value = a.uBumpMix.value;
  b.uBumpBScale.value.copy(a.uBumpBScale.value);
}

/** Build a group of fur shells around `geo`. `group.userData.base` is the solid inner shell (for raycasts). */
export function makeFurry(geo: THREE.BufferGeometry, color: ColorLike, fur: AvatarFurOptions | false = {}, family?: string): THREE.Group {
  if (fur === false) {
    const g = new THREE.Group();
    g.name = 'fur';
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    g.userData.base = mesh;
    g.add(mesh);
    return g;
  }
  return new FurLayers(geo, color, fur, family).group;
}
