import * as THREE from 'three';
import type { AvatarAccessory, AvatarDefinition, AvatarRig } from '../../../core/types/AvatarDefinition.ts';
import { isResolvedAvatar } from '../../../core/define/resolveAvatar.ts';
import { defineAvatar } from '../../../core/define/defineAvatar.ts';
import type { ResolvedAvatarDefinition } from '../../../core/define/resolveAvatar.ts';
import type { FurLayers } from './parts/furShells.ts';
import type { FurTweens } from './parts/furTweens.ts';
import type { BodyTarget } from './parts/bodyGrid.ts';
import type { EyeRig, EyeClearing } from './parts/reliefEyes.ts';
import type { JellySim } from './parts/jelly.ts';
import { getAtomDrawer, getRigProfile } from './atomDrawers.ts';
import type { RigBuildContext } from './atomDrawers.ts';
import { RigAnchors } from './anchors.ts';
import type { RigAnchorSource } from './anchors.ts';
import './parts/index.ts';
export * from './atomDrawers.ts';

/** Three.js rig — satisfies the renderer-agnostic `AvatarRig` contract. */
export interface ThreeAvatarRig extends AvatarRig {
  root: THREE.Group;
  squash: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  hand?: THREE.Object3D;
  /** Procedural body + accessories (hidden when a GLB replaces them). */
  procedural: THREE.Group;
  fur: THREE.Group;
  /** Persistent 3D eyes embedded in the body surface (absent without the `reliefEyes` part). */
  eyes?: EyeRig;
  /** Front-most body surface point / normal at body-space (x, y). */
  surfaceAt(x: number, y: number, point: THREE.Vector3, normal: THREE.Vector3): boolean;
  /** Distance from `origin` to the outermost body surface along the unit body-space direction `dir` (null: miss). */
  surfaceRadial(origin: THREE.Vector3, dir: THREE.Vector3): number | null;
  /** Meshes used for click picking. */
  pickables: THREE.Object3D[];
  definition: ResolvedAvatarDefinition;
  /** Built accessories, in definition order (disabled ones are absent). */
  accessories: RigAccessory[];
  /**
   * Build one accessory (not added to the scene) against this rig's body, or
   * against a body target the body is morphing toward, using `def`'s colour/fur.
   */
  buildAccessory(acc: AvatarAccessory, on?: { target?: BodyTarget; def?: ResolvedAvatarDefinition }): RigAccessory;
  /** Persistent fur shell stack of the body (absent when the family has no `furShells` part). */
  layers?: FurLayers;
  /** Live fur tweens owned by the fur part (`furShells` / `shellFur`). */
  furTweens?: FurTweens;
  /** The rendered body mesh (fur base when furred). */
  bodyMesh: THREE.Mesh;
  /** Shared morph-grid body geometry (mutated in place by morphs). */
  bodyGeometry: THREE.BufferGeometry;
  /** Body centre height (jelly pivot / framing), from the family rig profile. */
  bodyCenterY: number;
  /** Extra named pivots declared by the family profile (children of `body`). */
  pivots: Record<string, THREE.Group>;
  /** Per-frame hooks registered by parts (see `RigBuildContext.updaters`). */
  updaters: import('./atomDrawers.ts').RigUpdater[];
  /** Soft-body sim from the `jelly` part. */
  jelly?: JellySim;
  /** Atom / reach attach points (procedural space), see `registerAnchors`. */
  anchors: RigAnchors;
  /** Re-pick `hand` / `handRest` from the current accessories. */
  refreshHand(): void;
  /** Build one more structural atom into this rig (a plugin's composition atom, attached after assembly). */
  extend(kind: string): void;
  dispose(): void;
}

export interface RigAccessory {
  spec: AvatarAccessory;
  object: THREE.Object3D;
  hand?: { pivot: THREE.Object3D; rest: number };
}

/**
 * Assemble a procedural body rig from registered parts:
 * root (position/jump) > squash (scale, pivot at base) > body (rotations) > procedural(surface + eyes + accessories) + head (free behavior pivot) + family pivots.
 */
export function assembleRig(input: AvatarDefinition): ThreeAvatarRig {
  const def = isResolvedAvatar(input) ? input : defineAvatar(input);
  const profile = getRigProfile(def.family);
  const root = new THREE.Group();
  root.name = `avatar:${def.id}`;
  root.position.set(...def.position);
  const squash = new THREE.Group();
  squash.scale.setScalar(def.body.scale ?? 1);
  root.add(squash);
  const body = new THREE.Group();
  squash.add(body);
  const procedural = new THREE.Group();
  procedural.name = 'procedural';
  body.add(procedural);
  const head = new THREE.Group();
  head.name = 'head';

  // anchors read the rig lazily: parts fill in the samplers / limbs as they build, the controller sets `def` each frame
  let handOf: () => THREE.Object3D | undefined = () => undefined;
  const source: RigAnchorSource = {
    def,
    bodyCenterY: profile.bodyCenterY,
    procedural,
    get geometry() { return ctx.geometry; },
    get limbs() { return ctx.limbs; },
    get hand() { return handOf(); },
    surfaceAt: (x, y, p, n) => ctx.surfaceAt!(x, y, p, n),
    surfaceRadial: (o, d) => ctx.surfaceRadial!(o, d),
  };
  const ctx: RigBuildContext = { def, profile, root, squash, body, head, procedural, pivots: {}, accessories: [], updaters: [], anchors: new RigAnchors(source, def.family) };
  for (const name of profile.atoms) {
    const drawer = getAtomDrawer(name);
    if (!drawer?.build) throw new Error(`[rig] no structural drawer for atom '${name}' (family ${def.family ?? '*'})`);
    drawer.build(ctx);
    // head joins the body right after the eyes (original child order)
    if (name === 'reliefEyes' && !head.parent) body.add(head);
  }
  if (!head.parent) body.add(head);
  for (const p of profile.pivots) {
    const g = new THREE.Group();
    g.name = p;
    body.add(g);
    ctx.pivots[p] = g;
  }
  if (!ctx.geometry || !ctx.surfaceAt || !ctx.surfaceRadial) throw new Error('[rig] the `body` part is required');
  if (!ctx.bodyMesh) {
    ctx.bodyMesh = new THREE.Mesh(ctx.geometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(def.body.color as THREE.ColorRepresentation) }));
    procedural.add(ctx.bodyMesh);
  }
  const eyes = ctx.eyes;
  const base = ctx.bodyMesh;
  const accessories = ctx.accessories;
  const firstHand = accessories.find((a) => a.hand)?.hand;
  const fur = ctx.layers?.group ?? procedural;

  const rig: ThreeAvatarRig = {
    anchors: ctx.anchors,
    root,
    squash,
    body,
    head,
    hand: firstHand?.pivot,
    handRest: firstHand?.rest ?? 0,
    accessories,
    layers: ctx.layers,
    furTweens: ctx.furTweens,
    bodyMesh: base,
    bodyGeometry: ctx.geometry,
    bodyCenterY: profile.bodyCenterY,
    pivots: ctx.pivots,
    jelly: ctx.jelly,
    updaters: ctx.updaters,
    buildAccessory:
      ctx.buildAccessory ??
      (() => {
        throw new Error('[rig] no `accessories` part');
      }),
    extend(kind: string) {
      const drawer = getAtomDrawer(kind);
      if (!drawer?.build) throw new Error(`[rig] no structural drawer for atom '${kind}'`);
      drawer.build(ctx);
    },
    refreshHand() {
      const h = this.accessories.find((a) => a.hand)?.hand;
      this.hand = h?.pivot;
      this.handRest = h?.rest ?? 0;
    },
    baseY: def.position[1],
    phase: Math.random() * 6,
    procedural,
    fur,
    eyes,
    surfaceAt: ctx.surfaceAt,
    surfaceRadial: ctx.surfaceRadial,
    pickables: [base, ...(eyes ? eyes.eyes.map((e) => e.mesh) : [])],
    definition: def,
    dispose() {
      const geos = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      // the whole rig (parts may add overlays under the root, e.g. effects); module-shared geometry (`userData.shared`) stays
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          if (!m.geometry.userData.shared) geos.add(m.geometry);
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
        }
      });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      eyes?.dispose();
      root.removeFromParent();
    },
  };
  handOf = () => rig.hand;
  return rig;
}
