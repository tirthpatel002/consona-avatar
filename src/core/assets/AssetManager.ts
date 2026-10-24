export type AssetKind = 'svg' | 'raster' | 'unknown';

export interface LoadedAsset {
  id: string;
  kind: AssetKind;
  url?: string;
  /** Sanitized SVG markup when kind === 'svg' */
  content?: string;
  width?: number;
  height?: number;
  refCount: number;
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

export interface AssetManagerOptions {
  /** Strict SVG allow-list sanitizer (default: strip scripts/handlers/external) */
  sanitizeSvg?: (raw: string) => string;
}

const DEFAULT_SANITIZE = (raw: string): string => {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\shref\s*=\s*("|')https?:/gi, ' data-blocked-href=$1');
};

/**
 * Core asset lifecycle: load, cache, ref-count, sanitize SVG.
 * Does not ship content packs — only the pipeline.
 */
export class AssetManager {
  private readonly cache = new Map<string, LoadedAsset>();
  private readonly sanitizeSvg: (raw: string) => string;

  constructor(options: AssetManagerOptions = {}) {
    this.sanitizeSvg = options.sanitizeSvg ?? DEFAULT_SANITIZE;
  }

  get(id: string): LoadedAsset | undefined {
    return this.cache.get(id);
  }

  /** Register inline SVG (sanitized). */
  registerSvg(id: string, rawSvg: string): LoadedAsset {
    const existing = this.cache.get(id);
    if (existing) {
      existing.refCount += 1;
      return existing;
    }
    const asset: LoadedAsset = {
      id,
      kind: 'svg',
      content: this.sanitizeSvg(rawSvg),
      refCount: 1,
      status: 'ready',
    };
    this.cache.set(id, asset);
    return asset;
  }

  /** Register a raster URL (no fetch — caller supplies metadata). */
  registerRaster(id: string, url: string, size?: { width?: number; height?: number }): LoadedAsset {
    const existing = this.cache.get(id);
    if (existing) {
      existing.refCount += 1;
      return existing;
    }
    const asset: LoadedAsset = {
      id,
      kind: 'raster',
      url,
      width: size?.width,
      height: size?.height,
      refCount: 1,
      status: 'ready',
    };
    this.cache.set(id, asset);
    return asset;
  }

  release(id: string): void {
    const asset = this.cache.get(id);
    if (!asset) return;
    asset.refCount -= 1;
    if (asset.refCount <= 0) {
      this.cache.delete(id);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export function sanitizeSvgContent(raw: string): string {
  return DEFAULT_SANITIZE(raw);
}
