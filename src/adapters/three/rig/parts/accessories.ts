import * as THREE from 'three';
import type { ColorLike, AvatarAccessory } from '../../../../core/types/AvatarDefinition.ts';
import type { AvatarFurOptions } from '../../../../core/plugins/fur.schema.ts';

export interface AccessoryBuildContext {
  body: THREE.Group;
  color: ColorLike;
  fur: AvatarFurOptions | false;
  /** Solid inner body mesh (body-group space). */
  base: THREE.Mesh;
  /** Body bounds in body-group space. */
  bounds: THREE.Box3;
  /** Highest body-surface point at (x, z), body-group space (bounds top if missed). */
  surfaceTop(x: number, z: number): number;
  /** Front-most body-surface point at (x, y) (bounds front if missed). */
  surfaceFront(x: number, y: number): number;
}

export interface AccessoryBuildResult {
  object: THREE.Object3D;
  /** When set, becomes the rig's hand pivot (driven by behaviors through `rig.hand`). */
  hand?: { pivot: THREE.Object3D; rest: number };
}

export type AccessoryBuilder<A extends AvatarAccessory = AvatarAccessory> = (accessory: A, ctx: AccessoryBuildContext) => AccessoryBuildResult;

/**
 * Accessory builder registry. The engine ships no concrete accessories —
 * avatar packages register builders keyed by `AvatarAccessory.type`.
 */
const builders = new Map<string, AccessoryBuilder>();

export function registerAccessory<A extends AvatarAccessory>(type: string, builder: AccessoryBuilder<A>): void {
  builders.set(type, builder as unknown as AccessoryBuilder);
}

export function hasAccessory(type: string): boolean {
  return builders.has(type);
}


export function buildAccessory(accessory: AvatarAccessory, ctx: AccessoryBuildContext): AccessoryBuildResult {
  const b = builders.get(accessory.type);
  if (!b) throw new Error(`Unknown avatar accessory "${accessory.type}" — registerAccessory() it first`);
  return b(accessory, ctx);
}

/** Build surface probes for an accessory context. */
export function createSurfaceProbes(base: THREE.Mesh): Pick<AccessoryBuildContext, 'bounds' | 'surfaceTop' | 'surfaceFront'> {
  base.geometry.computeBoundingBox();
  const bounds = base.geometry.boundingBox!.clone();
  const ray = new THREE.Raycaster();
  const o = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const back = new THREE.Vector3(0, 0, -1);
  return {
    bounds,
    surfaceTop(x, z) {
      for (const j of [0, 1e-3, -1e-3]) {
        ray.set(o.set(x + j, bounds.max.y + 5, z + j), down);
        const hit = ray.intersectObject(base)[0];
        if (hit) return hit.point.y;
      }
      return bounds.max.y;
    },
    surfaceFront(x, y) {
      for (const j of [0, 1e-3, -1e-3]) {
        ray.set(o.set(x + j, y + j, bounds.max.z + 5), back);
        const hit = ray.intersectObject(base)[0];
        if (hit) return hit.point.z;
      }
      return bounds.max.z;
    },
  };
}
