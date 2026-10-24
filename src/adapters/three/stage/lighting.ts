import * as THREE from 'three';

/** A lighting rig installer: adds lights / environment to the scene, returns its disposer. */
export type LightingPreset = (scene: THREE.Scene, renderer: THREE.WebGLRenderer) => () => void;

/** Soft studio lighting: warm key, two back rims, hemisphere fill, glossy env for the eyes. */
export const studioLighting: LightingPreset = (scene, renderer) => {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.0));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
  key.position.set(-3, 5, 6);
  const rimL = new THREE.DirectionalLight(0xffffff, 2.5);
  rimL.position.set(-4, 4, -5);
  const rimR = new THREE.DirectionalLight(0xffffff, 2.0);
  rimR.position.set(5, 3, -4);
  scene.add(key, rimL, rimR);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x222222);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  panel.position.set(-2, 4, 4);
  panel.lookAt(0, 0, 0);
  const p2 = panel.clone();
  p2.position.set(3, 3, 3);
  p2.lookAt(0, 0, 0);
  env.add(panel, p2);
  scene.environment = pmrem.fromScene(env, 0.02).texture;
  panel.geometry.dispose();
  (panel.material as THREE.Material).dispose();
  return () => {
    scene.environment?.dispose();
    pmrem.dispose();
  };
};

const presets = new Map<string, LightingPreset>([['studio', studioLighting]]);

/** Register a named lighting preset (`AvatarStageOptions.lighting: 'name'`). */
export function registerLightingPreset(name: string, preset: LightingPreset): void {
  presets.set(name, preset);
}

export function getLightingPreset(name: string): LightingPreset | undefined {
  return presets.get(name);
}

export function listLightingPresets(): string[] {
  return Array.from(presets.keys());
}
