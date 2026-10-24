import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { AvatarModelOptions } from '../../../core/types/AvatarDefinition.ts';
import type { AvatarStateMachine } from '../../../core/animation/state-machine/AvatarStateMachine.ts';
import type { ThreeAvatarRig } from './assembleRig.ts';

/**
 * Blender / GLB path. Loads a glTF, mounts it into the rig's body (so all
 * procedural root/body motion still applies), optionally hides the procedural
 * parts, and binds mapped clips to the state machine through an AnimationMixer:
 * when a mapped behavior starts, its clip plays once; when the clip finishes,
 * `machine.complete()` returns the avatar to its queue / idle.
 */
export interface GltfAvatarBinding {
  gltf: GLTF;
  mixer: THREE.AnimationMixer;
  update(dt: number): void;
  dispose(): void;
}

export function bindGltfToAvatar(
  gltf: GLTF,
  rig: ThreeAvatarRig,
  machine: AvatarStateMachine<ThreeAvatarRig>,
  options: AvatarModelOptions,
): GltfAvatarBinding {
  const model = gltf.scene;
  if (options.position) model.position.set(...options.position);
  if (options.scale !== undefined) model.scale.setScalar(options.scale);
  rig.body.add(model);
  if (options.replaceProcedural !== false) rig.procedural.visible = false;
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) rig.pickables.push(o);
  });

  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const [behavior, clipName] of Object.entries(options.clips ?? {})) {
    const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
    if (!clip) continue;
    clips.set(behavior, clip);
    // Clip-only behaviors (not procedurally defined) finish on the mixer event.
    if (!machine.has(behavior)) machine.register({ name: behavior, duration: 'clip', preset: null });
  }

  let active: THREE.AnimationAction | null = null;
  const unsub = machine.subscribe((ev) => {
    if (ev.type !== 'start') return;
    const clip = clips.get(ev.behavior);
    if (active) {
      active.fadeOut(0.2);
      active = null;
    }
    if (!clip) return;
    const a = mixer.clipAction(clip);
    const loop = machine.getBehavior(ev.behavior)?.duration === Infinity;
    a.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.fadeIn(0.2).play();
    active = a;
  });
  const onFinished = (e: { action: THREE.AnimationAction }) => {
    if (e.action === active && machine.getBehavior(machine.behavior)?.duration === 'clip') machine.complete();
  };
  mixer.addEventListener('finished', onFinished);

  return {
    gltf,
    mixer,
    update(dt) {
      mixer.update(dt);
    },
    dispose() {
      unsub();
      mixer.removeEventListener('finished', onFinished);
      mixer.stopAllAction();
      model.removeFromParent();
      rig.procedural.visible = true;
    },
  };
}

const loader = /* lazily */ { current: null as GLTFLoader | null };

export function loadGltf(url: string): Promise<GLTF> {
  loader.current ??= new GLTFLoader();
  return loader.current.loadAsync(url);
}
