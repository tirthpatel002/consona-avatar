/**
 * Pure helpers for `AvatarStage.snapshot()` (no `three` / DOM dependency, so
 * they are unit-testable in Node).
 */

export interface AvatarSnapshotOptions {
  /**
   * Multiplier over the canvas's on-screen device pixels (CSS size ×
   * `devicePixelRatio`, NOT the stage's live pixel-ratio cap). Default 2.
   */
  scale?: number;
  /** Longest-side cap in px (also clamped to the GPU's texture / renderbuffer / viewport limits). Default 4096. */
  maxSize?: number;
  /** Total pixel budget (keeps the MSAA target + readback within memory). Default 4096². */
  maxPixels?: number;
  /** Image MIME type (default 'image/png'; PNG keeps the alpha channel). */
  type?: string;
  /** Encoder quality for lossy types (ignored by PNG). */
  quality?: number;
}

export interface SnapshotSizeInput {
  /** Canvas CSS size. */
  cssWidth: number;
  cssHeight: number;
  /** Real device pixel ratio (uncapped). */
  devicePixelRatio: number;
  scale?: number;
  maxSize?: number;
  maxPixels?: number;
  /** Hardware limit: min(maxTextureSize, MAX_RENDERBUFFER_SIZE, MAX_VIEWPORT_DIMS). */
  gpuMaxSize?: number;
}

export const SNAPSHOT_DEFAULT_SCALE = 2;
export const SNAPSHOT_DEFAULT_MAX_SIZE = 4096;
export const SNAPSHOT_DEFAULT_MAX_PIXELS = 4096 * 4096;

/**
 * Output size of a snapshot: CSS size × devicePixelRatio × scale, shrunk
 * uniformly (aspect ratio kept) to fit the size / pixel / GPU limits.
 */
export function snapshotSize(i: SnapshotSizeInput): { width: number; height: number; pixelRatio: number } {
  const cssW = Math.max(1, i.cssWidth);
  const cssH = Math.max(1, i.cssHeight);
  const dpr = i.devicePixelRatio > 0 && Number.isFinite(i.devicePixelRatio) ? i.devicePixelRatio : 1;
  const scale = i.scale !== undefined && i.scale > 0 && Number.isFinite(i.scale) ? i.scale : SNAPSHOT_DEFAULT_SCALE;
  const maxSide = Math.max(1, Math.min(i.maxSize ?? SNAPSHOT_DEFAULT_MAX_SIZE, i.gpuMaxSize ?? Infinity));
  const maxPixels = Math.max(1, i.maxPixels ?? SNAPSHOT_DEFAULT_MAX_PIXELS);
  let ratio = dpr * scale;
  ratio = Math.min(ratio, maxSide / Math.max(cssW, cssH));
  ratio = Math.min(ratio, Math.sqrt(maxPixels / (cssW * cssH)));
  const width = Math.max(1, Math.min(Math.floor(maxSide), Math.round(cssW * ratio)));
  const height = Math.max(1, Math.min(Math.floor(maxSide), Math.round(cssH * ratio)));
  return { width, height, pixelRatio: ratio };
}

/**
 * GL readback (bottom-up rows, premultiplied alpha — what blending onto a
 * transparent clear produces) → top-down straight-alpha RGBA for ImageData / PNG.
 * Fully transparent pixels become (0,0,0,0) so edges carry no colour fringe.
 */
export function premultipliedToImageRows(src: Uint8Array, width: number, height: number, out = new Uint8ClampedArray(width * height * 4)): Uint8ClampedArray {
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const s = (height - 1 - y) * row;
    const d = y * row;
    for (let x = 0; x < row; x += 4) {
      const a = src[s + x + 3]!;
      if (a === 0) {
        out[d + x] = out[d + x + 1] = out[d + x + 2] = out[d + x + 3] = 0;
      } else if (a === 255) {
        out[d + x] = src[s + x]!;
        out[d + x + 1] = src[s + x + 1]!;
        out[d + x + 2] = src[s + x + 2]!;
        out[d + x + 3] = 255;
      } else {
        const k = 255 / a;
        out[d + x] = Math.min(255, Math.round(src[s + x]! * k));
        out[d + x + 1] = Math.min(255, Math.round(src[s + x + 1]! * k));
        out[d + x + 2] = Math.min(255, Math.round(src[s + x + 2]! * k));
        out[d + x + 3] = a;
      }
    }
  }
  return out;
}

/** `<name>-snapshot-<YYYYMMDD-HHMMSS>.png` (filesystem-safe). */
export function snapshotFilename(name: string, date = new Date(), ext = 'png'): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  const safe = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'avatar';
  return `${safe}-snapshot-${stamp}.${ext}`;
}
