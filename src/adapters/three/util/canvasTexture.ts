import * as THREE from 'three';

/** Shared helpers for procedural (canvas-drawn, tileable) textures. */

/** Square canvas cleared to black. */
export function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  return { c, g };
}

/** Repeat-wrapped canvas texture. */
export function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Seeded RNG so textures are identical on every load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Wrap-around draw helper for tileable textures. */
export function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    if (x + dx > -r && x + dx < size + r && y + dy > -r && y + dy < size + r) draw(x + dx, y + dy);
  }
}

export { canvas as createTextureCanvas, finish as createRepeatTexture, rng as seededRandom, wrapped as drawWrapped };
