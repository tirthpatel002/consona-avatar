import * as THREE from 'three';
import type { ResolvedAvatarDefinition } from '../../../../core/define/resolveAvatar.ts';
import { hairbandColor, hairbandStyleIndex, isAutoHairbandColor } from '../../../../core/face/hairband.ts';
import { registerAtomDrawer } from '../atomDrawers.ts';
import type { BandPlacement } from './bandMask.ts';

/**
 * Hairband as a decal-in-shader, exactly like `reliefMouth`: this part owns NO
 * geometry. It turns `def.hairband` into the band frame / style / colour and
 * writes it through the surface part's `ctx.bandClearing` (`shellFur`), whose
 * skin shader draws the fabric and whose shells part the fur around it (see
 * `bandMask.ts`). Rides body morphs, jelly, behaviors and scale for free;
 * uniforms are written only when the (preset-applied) definition or the live
 * body colour ('auto') changes — nothing per frame otherwise.
 */
registerAtomDrawer({
  kind: 'reliefHairband',
  build(ctx) {
    const qx = new THREE.Quaternion(), qz = new THREE.Quaternion();
    const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
    const col = new THREE.Color();
    const place: BandPlacement = { center: new THREE.Vector3(), rotation: new THREE.Quaternion(), halfWidth: 0, end: 0, margin: 0, style: 0, thickness: 0, ribPitch: 0, bowSize: 0, bowLift: 0, color: col };
    const fallbackCol = new THREE.Color(ctx.def.body.color as THREE.ColorRepresentation);
    const bodyCol = () => (ctx.bodyMesh?.material as THREE.MeshStandardMaterial | undefined)?.color ?? fallbackCol;
    let lastDef: ResolvedAvatarDefinition | null = null, lastRev = -1, lastHex = -1;

    const update = (def: ResolvedAvatarDefinition, rev: number) => {
      const hook = ctx.bandClearing;
      const hb = def.hairband;
      const hex = hb && isAutoHairbandColor(hb.color) ? bodyCol().getHex() : -2;
      if (def === lastDef && rev === lastRev && hex === lastHex) return;
      lastDef = def; lastRev = rev; lastHex = hex;
      if (!hb || !hook) {
        hook?.disable();
        return;
      }
      // frame: ear to ear over the top, tipped toward the face (position) then sideways (tilt)
      qz.setFromAxisAngle(Z, hb.tilt);
      qx.setFromAxisAngle(X, hb.position);
      place.rotation.multiplyQuaternions(qx, qz);
      place.center.set(0, ctx.profile.bodyCenterY + hb.y, 0);
      place.halfWidth = hb.width / 2;
      place.end = hb.end;
      place.margin = Math.max(0.008, hb.width * 0.12);
      place.style = hairbandStyleIndex(hb.style);
      place.thickness = hb.thickness;
      place.ribPitch = Math.max(0.02, hb.width * 0.32);
      place.bowSize = hb.width * 2.2;
      // the bow stands off the surface about as high as the pile, so its silhouette clears the fur
      place.bowLift = place.bowSize * 0.4;
      const body = `#${bodyCol().getHexString(THREE.SRGBColorSpace)}`;
      const c = hairbandColor(hb.color, body);
      col.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
      hook.update(place);
    };
    update(ctx.def, 0);
    ctx.updaters.push((f) => update(f.definition, f.revision));
  },
});
