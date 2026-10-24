import * as THREE from 'three';
import { registerAvatarOption } from '../../../core/registry/options.ts';

/** Fur strand noise (alpha for shell texturing): per-texel random -> strands. */
export function createStrandTexture(size = 256, repeat: [number, number] = [36, 22]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.pow(Math.random(), 1.6) * 255;
    img.data.set([v, v, v, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  // Prefiltered (mipmapped) noise: the fur shader restores the per-strand
  // contrast analytically from the screen-space footprint, so distant /
  // sub-pixel strands fade smoothly instead of popping frame to frame.
  t.magFilter = THREE.NearestFilter; // close-up strands stay crisp
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8; // keep strand detail at grazing angles (silhouette fuzz)
  return t;
}

// ---------- surface pattern registry ----------

export interface SurfacePattern {
  /** Creates the (greyscale, tileable) bump texture; called once per page. */
  create(): THREE.Texture;
  /** Default repeat when the definition doesn't set `fur.patternRepeat`. */
  repeat: [number, number];
}

const patterns = new Map<string, SurfacePattern>();

/** Register a tileable surface pattern (bump + optional albedo shading) usable as `fur.pattern`. */
export function registerSurfacePattern(name: string, pattern: SurfacePattern): void {
  patterns.set(name, pattern);
  registerAvatarOption('surfacePattern', name);
}

export function listSurfacePatterns(): string[] {
  return Array.from(patterns.keys());
}


/** Lazily-created shared textures (one set per page). */
const strandCache = new Map<string, THREE.CanvasTexture>();
const patternBase = new Map<string, THREE.Texture>();
const patternCache = new Map<string, THREE.Texture>();

/** Pattern texture with a given repeat (clones share the image). */
export function getPatternTexture(name: string, repeat?: [number, number]): THREE.Texture | null {
  const p = patterns.get(name);
  if (!p) return null;
  let base = patternBase.get(name);
  if (!base) {
    base = p.create();
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    patternBase.set(name, base);
  }
  const r = repeat ?? p.repeat;
  const key = `${name}:${r.join('x')}`;
  let t = patternCache.get(key);
  if (!t) {
    t = base.clone();
    t.repeat.set(r[0], r[1]);
    t.needsUpdate = true;
    patternCache.set(key, t);
  }
  return t;
}

let flat: THREE.Texture | null = null;
/** Neutral (no-bump) pattern used when nothing is registered. */
function flatPattern(): THREE.Texture {
  if (!flat) {
    flat = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    flat.wrapS = flat.wrapT = THREE.RepeatWrapping;
    flat.needsUpdate = true;
  }
  return flat;
}

/** Shared strand + pattern textures; unknown patterns fall back to the first registered one (then a flat texture). */
export function getSharedFurTextures(repeat: [number, number], pattern?: string, patternRepeat?: [number, number]) {
  const key = repeat.join('x');
  let strands = strandCache.get(key);
  if (!strands) {
    strands = createStrandTexture(256, repeat);
    strandCache.set(key, strands);
  }
  return {
    strands,
    knit:
      (pattern ? getPatternTexture(pattern, patternRepeat) : null) ??
      (patterns.size ? getPatternTexture(patterns.keys().next().value!) : null) ??
      flatPattern(),
  };
}
