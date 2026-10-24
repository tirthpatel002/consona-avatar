/**
 * Optional Three.js adapter surface (W9).
 *
 * Peer-style entry: import only when a descriptor uses ModelNode.
 * Does not depend on `three` at build/test time — host apps supply it.
 *
 * Usage (app code):
 *   import { createThreeAdapter } from '@consona/avatar/three';
 *   const layer = createThreeAdapter(THREE);
 */

/** Method syntax keeps this structurally compatible with THREE.WebGLRenderer. */
export interface ThreeRendererLike {
  domElement: HTMLElement;
  render(scene: unknown, camera: unknown): void;
  dispose(): void;
}

export interface ThreeLike {
  Scene: new () => unknown;
  WebGLRenderer: new (params?: unknown) => ThreeRendererLike;
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => unknown;
}

export interface ThreeAdapter {
  readonly kind: 'three';
  scene: unknown;
  camera: unknown;
  renderer: ThreeRendererLike;
  /** Register a glTF/GLB URL for later load by the host */
  registerModel(id: string, url: string): void;
  listModels(): string[];
  dispose(): void;
}

/**
 * Create a minimal WebGL layer host. Animation clips from glTF should be
 * converted to core `Animation` by the host and registered on the mixer —
 * same play surface as 2D.
 */
export function createThreeAdapter(THREE: ThreeLike, canvas?: HTMLCanvasElement): ThreeAdapter {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  const models = new Map<string, string>();

  return {
    kind: 'three',
    scene,
    camera,
    renderer,
    registerModel(id: string, url: string) {
      models.set(id, url);
    },
    listModels() {
      return Array.from(models.keys());
    },
    dispose() {
      renderer.dispose();
      models.clear();
    },
  };
}

export const THREE_ADAPTER_PACKAGE = '@consona/avatar/three';

// ---------------------------------------------------------------------------
// Avatars: procedural Allie-style characters + GLB/AnimationMixer path.
// `AvatarStage` implements `ThreeAdapter`. These modules import `three`
// directly (optional peer dependency); the core/consona bundles never do.
// React bindings: `@consona/avatar/three/react`.
// ---------------------------------------------------------------------------
export * from './rig/index.ts';
