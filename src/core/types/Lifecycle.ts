/**
 * Engine update context and lifecycle hooks.
 */

export interface UpdateContext {
  time: number;          // Total elapsed time in seconds
  deltaTime: number;     // Delta time for this frame in seconds
  frame?: number;        // Incremental frame count
}

export interface LifecycleHooks {
  onBeforeUpdate?(context: UpdateContext): void;
  onAfterUpdate?(context: UpdateContext): void;
  onBeforeRender?(context: UpdateContext): void;
  onAfterRender?(context: UpdateContext): void;
  onDispose?(): void;
}
