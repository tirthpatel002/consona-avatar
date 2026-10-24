import * as THREE from 'three';
import { registerAtomDrawer } from '../atomDrawers.ts';
import type { RigAccessory } from '../assembleRig.ts';
import type { ResolvedAvatarDefinition } from '../../../../core/define/resolveAvatar.ts';
import type { AvatarAccessory } from '../../../../core/types/AvatarDefinition.ts';
import { createBodyGridGeometry } from './bodyGrid.ts';
import type { BodyTarget } from './bodyGrid.ts';
import { createBodyTarget } from './body.ts';
import { FurLayers } from './furShells.ts';
import { FurTweens } from './furTweens.ts';
import { furEyeClearing } from './furEyeMask.ts';
import { withFurFamily } from '../../../../core/plugins/fur.schema.ts';
import { EyeRig } from './reliefEyes.ts';
import { buildAccessory, createSurfaceProbes } from './accessories.ts';
import { JellySim, applyJelly } from './jelly.ts';
import { createBodySurfaceSamplers } from './surfaceSamplers.ts';
import { furMouthClearing } from './mouthMask.ts';
import './sdfBody.ts';
import './shellFur.ts';
import './tentacles.ts';
import './reliefMouth.ts';
import './reliefHairband.ts';
import './atoms.ts';
import './effects.ts';

/**
 * Built-in atom drawers (registered on import). Families choose / reorder them
 * with `registerRigProfile(family, { parts })` and may register their own.
 */

/** Accessories get the body fur without its surface regions (those are in body space). */
const accFur = (d: ResolvedAvatarDefinition) => (d.fur === false ? false : { ...d.fur, regions: [] });

/** Shared morph-grid body geometry + body-space raycast probes. */
registerAtomDrawer({
  kind: 'body',
  build(ctx) {
    // body on the shared morph grid: every later shape change rewrites this geometry in place
    const geo = createBodyGridGeometry(createBodyTarget(ctx.def.body, ctx.profile.bodyCenterY));
    ctx.geometry = geo;
    // body-local probe sharing the (morphing) geometry: raycasts stay in body space whatever the scene transform
    const local = new THREE.Mesh(geo);
    local.updateMatrixWorld(true);
    ctx.probe = local;
    Object.assign(ctx, createBodySurfaceSamplers(local));
  },
});

/** Shell fur over the body (style from `configureFurShells`); clears under the eyes. */
registerAtomDrawer({
  kind: 'furShells',
  build(ctx) {
    const layers = new FurLayers(ctx.geometry!, ctx.def.body.color, ctx.def.fur, ctx.def.family);
    ctx.layers = layers;
    // the part owns the live fur tweens; the controller steps them, the layers follow
    layers.tweens = ctx.furTweens ??= new FurTweens(ctx.def);
    ctx.bodyMesh = layers.group.userData.base as THREE.Mesh;
    ctx.eyeClearing = furEyeClearing(layers.mask);
    ctx.mouthClearing = furMouthClearing(layers.mouthMask);
    ctx.procedural.add(layers.group);
  },
});

/** Persistent relief eyes embedded in the (morphing) body surface. */
registerAtomDrawer({
  kind: 'reliefEyes',
  build(ctx) {
    const eyes = new EyeRig(ctx.surfaceAt!, ctx.eyeClearing ?? null, ctx.def.eyes);
    ctx.eyes = eyes;
    ctx.procedural.add(eyes.group);
  },
});

/** Registered accessories (built against the body, or a body target it morphs toward). */
registerAtomDrawer({
  kind: 'accessories',
  build(ctx) {
    const { def, body } = ctx;
    const local = ctx.probe!;
    const buildAcc = (acc: AvatarAccessory, on?: { target?: BodyTarget; def?: ResolvedAvatarDefinition }): RigAccessory =>
      withFurFamily((on?.def ?? def).family, () => buildIn(acc, on));
    const buildIn = (acc: AvatarAccessory, on?: { target?: BodyTarget; def?: ResolvedAvatarDefinition }): RigAccessory => {
      const d = on?.def ?? def;
      if (on?.target) {
        // probe the body's destination shape (a throwaway mesh, never rendered)
        const probeGeo = createBodyGridGeometry(on.target);
        const probe = new THREE.Mesh(probeGeo);
        probe.updateMatrixWorld(true);
        const res = buildAccessory(acc, { body, color: d.body.color, fur: accFur(d), base: probe, ...createSurfaceProbes(probe) });
        probeGeo.dispose();
        return { spec: acc, object: res.object, hand: res.hand };
      }
      const res = buildAccessory(acc, { body, color: d.body.color, fur: accFur(d), base: local, ...createSurfaceProbes(local) });
      return { spec: acc, object: res.object, hand: res.hand };
    };
    ctx.buildAccessory = buildAcc;
    for (const acc of def.accessories ?? []) {
      if (acc.enabled === false) continue;
      const a = buildAcc(acc);
      ctx.procedural.add(a.object);
      ctx.accessories.push(a);
    }
  },
});

/** Soft-body jiggle applied to every procedural mesh (and shells/accessories added later). */
registerAtomDrawer({
  kind: 'jelly',
  build(ctx) {
    const jelly = new JellySim(ctx.def.jelly);
    ctx.jelly = jelly;
    applyJelly(ctx.procedural, jelly.uniforms);
    // shells added later (shell-count edits) get the jelly too
    if (ctx.layers) ctx.layers.group.userData.onAdd = (m: THREE.Object3D) => applyJelly(m, jelly.uniforms);
  },
});
