import { Vector2D, type IVector2D } from '../math/Vector2D.ts';

export type PointerCallback = (normalizedPos: Vector2D, rawEvent: MouseEvent | TouchEvent) => void;

export type TargetGetter = () => HTMLElement | SVGElement | Window | null | undefined;

/**
 * PointerObserver: High-precision mouse and touch tracking with continuous normalization relative to target center.
 */
export class PointerObserver {
  private target: HTMLElement | SVGElement | Window | TargetGetter;
  private callback?: PointerCallback;
  private currentPos: Vector2D = Vector2D.zero();
  private isListening: boolean = false;
  /** Cached bounding rect (viewport-relative) — re-read only after scroll/resize or a target change. */
  private rectCache: DOMRect | null = null;
  private rectCacheTarget: unknown = null;

  constructor(target: HTMLElement | SVGElement | Window | TargetGetter = typeof window !== 'undefined' ? window : ({} as any)) {
    this.target = target;
  }

  private invalidateRect = (): void => {
    this.rectCache = null;
  };

  start(callback: PointerCallback): this {
    this.callback = callback;
    if (this.isListening || typeof window === 'undefined') return this;

    this.isListening = true;
    window.addEventListener('mousemove', this.handleMouseMove, { passive: true });
    window.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    window.addEventListener('scroll', this.invalidateRect, { passive: true, capture: true });
    window.addEventListener('resize', this.invalidateRect, { passive: true });
    return this;
  }

  stop(): void {
    if (!this.isListening || typeof window === 'undefined') return;
    this.isListening = false;
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('touchmove', this.handleTouchMove);
    window.removeEventListener('scroll', this.invalidateRect, true);
    window.removeEventListener('resize', this.invalidateRect);
  }

  getPosition(): Vector2D {
    return this.currentPos;
  }

  private handleMouseMove = (e: MouseEvent): void => {
    const norm = this.normalizeCoordinates(e.clientX, e.clientY);
    this.currentPos = norm;
    if (this.callback) this.callback(norm, e);
  };

  private handleTouchMove = (e: TouchEvent): void => {
    const touch = e.touches[0];
    if (touch) {
      const norm = this.normalizeCoordinates(touch.clientX, touch.clientY);
      this.currentPos = norm;
      if (this.callback) this.callback(norm, e);
    }
  };

  private normalizeCoordinates(clientX: number, clientY: number): Vector2D {
    if (typeof window === 'undefined') return Vector2D.zero();

    const resolvedTarget = typeof this.target === 'function' ? (this.target as TargetGetter)() : this.target;

    if (resolvedTarget && typeof (resolvedTarget as any).getBoundingClientRect === 'function') {
      // the rect is viewport-relative: cache it and re-read only after scroll/resize (mouse
      // polling at 120–1000 Hz would otherwise force layout bookkeeping per event)
      let rect = this.rectCacheTarget === resolvedTarget ? this.rectCache : null;
      if (!rect) {
        rect = (resolvedTarget as HTMLElement).getBoundingClientRect();
        this.rectCache = rect;
        this.rectCacheTarget = resolvedTarget;
      }
      if (rect.width > 0 && rect.height > 0) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        // Dynamic influence radius adapting to avatar size and viewport to avoid hyperactivity on large avatars
        const avatarRadius = Math.max(rect.width, rect.height) * 0.5;
        const radius = Math.max(avatarRadius * 1.5, Math.max(220, Math.min(window.innerWidth, window.innerHeight) * 0.45));
        const nx = (clientX - cx) / radius;
        const ny = (clientY - cy) / radius;
        return Vector2D.create(
          Math.max(-1, Math.min(1, nx)),
          Math.max(-1, Math.min(1, ny))
        );
      }
    }

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const radius = Math.max(window.innerWidth, window.innerHeight) * 0.45;

    const nx = radius > 0 ? (clientX - cx) / radius : 0;
    const ny = radius > 0 ? (clientY - cy) / radius : 0;

    return Vector2D.create(
      Math.max(-1, Math.min(1, nx)),
      Math.max(-1, Math.min(1, ny))
    );
  }
}
