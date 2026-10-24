import type { UpdateContext } from '../types/Lifecycle.ts';

export type TickCallback = (context: UpdateContext) => void;

/**
 * EngineTicker: High-precision animation frame loop.
 * Coordinates all active AvatarInstances on a single shared requestAnimationFrame cycle.
 */
export class EngineTicker {
  private static instance?: EngineTicker;

  private callbacks: Set<TickCallback> = new Set();
  private rafId: number | null = null;
  private lastTimestamp: number = 0;
  private startTime: number = 0;
  private frameCount: number = 0;
  private isRunning: boolean = false;

  static getShared(): EngineTicker {
    if (!EngineTicker.instance) {
      EngineTicker.instance = new EngineTicker();
    }
    return EngineTicker.instance;
  }

  add(callback: TickCallback): this {
    this.callbacks.add(callback);
    if (!this.isRunning && typeof window !== 'undefined') {
      this.start();
    }
    return this;
  }

  remove(callback: TickCallback): this {
    this.callbacks.delete(callback);
    if (this.callbacks.size === 0) {
      this.stop();
    }
    return this;
  }

  start(): void {
    if (this.isRunning || typeof window === 'undefined') return;
    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.startTime = this.lastTimestamp;

    const tick = (now: number) => {
      if (!this.isRunning) return;

      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;

      // Cap delta time to 100ms (0.1s) to prevent spiral of death on tab unfocus
      const deltaTime = Math.min(0.1, Math.max(0.0001, rawDt));
      const totalTime = (now - this.startTime) / 1000;
      this.frameCount++;

      const context: UpdateContext = {
        time: totalTime,
        deltaTime,
        frame: this.frameCount,
      };

      for (const cb of this.callbacks) {
        cb(context);
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.isRunning = false;
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Manual single-frame evaluation (used for headless testing and SSR).
   */
  manualTick(deltaTime: number = 1 / 60): UpdateContext {
    this.frameCount++;
    const context: UpdateContext = {
      time: this.frameCount * deltaTime,
      deltaTime,
      frame: this.frameCount,
    };

    for (const cb of this.callbacks) {
      cb(context);
    }
    return context;
  }
}
