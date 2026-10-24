import * as THREE from 'three';
import { getAtomDrawer, registerAtomDrawer } from '../atomDrawers.ts';
import type { RigFrame } from '../atomDrawers.ts';
import { createAnchorFrame } from '../anchors.ts';
import type { AtomDefinition } from '../../../../core/atom/atom.ts';
import type { AtomState } from '../../../../core/atom/atomLayer.ts';
import type { ResolvedAvatarDefinition } from '../../../../core/define/resolveAvatar.ts';
import { createShellFur } from './shellFur.ts';
import type { ShellFur } from './shellFur.ts';

/**
 * `atoms` atom drawer: draws the atoms behaviors show (`AvatarStateMachine.atoms`).
 * A atom's visual is built once, on first use, from the builder registered
 * for its `kind` (cached for the rig's lifetime); hidden atoms are invisible
 * objects (no draw, no update). Visible ones follow their anchor with one
 * matrix compose per frame and fade / pop in and out with `shown`.
 * Materials are cheap (standard / basic, faked glass: no transmission).
 */
export interface AtomDrawing {
  object: THREE.Object3D;
  /**
   * Per-frame hook while visible (own animation, e.g. floating Zz; `frame`
   * carries the live definition, e.g. the body colour). Set
   * `material.userData.fade` (0..1) to modulate a material's opacity on top of the atom fade.
   */
  update?(dt: number, state: AtomState, frame: RigFrame): void;
  /**
   * The visual shows `state.shown` itself (e.g. a dithered, depth-writing fade
   * in `update`): the part neither pops its scale nor touches its materials' opacity.
   */
  ownFade?: boolean;
  /**
   * The mesh a atom with `surface: 'avatar'` dresses in the avatar's own
   * surface (shell fur over its geometry, short pile, the body's colour and
   * plush look); it replaces the mesh. `dressed` hands the visual the surface
   * material and its dithered-fade uniform: an `ownFade` visual drives that
   * uniform itself, otherwise the part sets it to `shown`.
   */
  surface?: {
    mesh: THREE.Mesh;
    dressed?(material: THREE.MeshStandardMaterial, fade: THREE.IUniform<number>): void;
  };
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/**
 * Module-shared geometry by key (built once): drawings share it across every
 * rig (`userData.shared`: rig disposal skips it); only small materials are per instance.
 */
export function sharedAtomGeometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

interface LiveAtom {
  visual: AtomDrawing;
  mats: THREE.Material[];
  base: number[];
  surface: { fur: ShellFur; fade: THREE.IUniform<number> } | null;
}

/** Avatar-surface atoms: pile length vs. the body's, and a low shell count (a atom is small on screen). */
export const ATOM_SURFACE_PILE = 0.35;
const SURFACE_SHELLS = 10;

/** Dress the visual's surface mesh in the avatar's shell fur (strands sized as on the body despite the atom scale). */
function dressSurface(visual: AtomDrawing, def: AtomDefinition, avatar: ResolvedAvatarDefinition): LiveAtom['surface'] {
  const sf = visual.surface;
  if (def.surface !== 'avatar' || !sf) return null;
  const k = def.scale ?? 1;
  const geo = sf.mesh.geometry;
  const coord = (geo.attributes.position as THREE.BufferAttribute).clone();
  for (let i = 0; i < coord.array.length; i++) (coord.array as Float32Array)[i]! *= k;
  geo.setAttribute('furCoord', coord);
  const fade = { value: 0 };
  const fur = createShellFur(geo, avatar, { pile: ATOM_SURFACE_PILE / k, maxShells: avatar.fur ? SURFACE_SHELLS : 2, fade });
  fur.group.name = 'surface';
  fur.group.position.copy(sf.mesh.position);
  fur.group.quaternion.copy(sf.mesh.quaternion);
  fur.group.scale.copy(sf.mesh.scale);
  for (const m of fur.group.children) m.frustumCulled = false;
  const parent = sf.mesh.parent ?? visual.object;
  sf.mesh.removeFromParent();
  (sf.mesh.material as THREE.Material).dispose();
  parent.add(fur.group);
  sf.dressed?.(fur.base.material as THREE.MeshStandardMaterial, fade);
  return { fur, fade };
}

const UP = new THREE.Vector3(0, 1, 0);
/** Pop-in scale over the fade (slight overshoot), 1 when fully shown. */
const pop = (k: number) => (k >= 1 ? 1 : 0.35 + 0.65 * (1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2));

registerAtomDrawer({
  kind: 'atoms',
  build(ctx) {
    const group = new THREE.Group();
    group.name = 'atoms';
    ctx.procedural.add(group);
    const live = new Map<string, LiveAtom | null>();
    const frame = createAnchorFrame();
    const pos = new THREE.Vector3(), off = new THREE.Vector3(), sc = new THREE.Vector3();
    const q = new THREE.Quaternion(), qr = new THREE.Quaternion(), e = new THREE.Euler();

    const create = (s: AtomState, avatar: ResolvedAvatarDefinition): LiveAtom | null => {
      const def = s.def;
      const build = def && getAtomDrawer(def.kind)?.draw;
      if (!def || !build) {
        console.warn(`[atoms] no ${def ? `drawer for kind "${def.kind}"` : 'definition'} for atom "${s.id}"`);
        return null;
      }
      const visual = build(def);
      const surface = dressSurface(visual, def, avatar);
      const o = visual.object;
      o.name = `atom:${s.id}`;
      o.matrixAutoUpdate = false;
      o.visible = false;
      const mats: THREE.Material[] = [];
      o.traverse((c) => {
        const m = (c as THREE.Mesh).material;
        // the avatar surface fades by dither (opaque), never by opacity
        if (m) for (const x of Array.isArray(m) ? m : [m]) if (!x.userData.fur && !mats.includes(x)) mats.push(x);
      });
      // every part-faded material is transparent from the start (no program switch mid-fade)
      if (!visual.ownFade) for (const m of mats) m.transparent = true;
      group.add(o);
      return { visual, mats, base: mats.map((m) => m.opacity), surface };
    };

    ctx.updaters.push((f) => {
      const states = f.atoms;
      if (!states) return;
      for (let i = 0; i < states.length; i++) {
        const s = states[i]!;
        let p = live.get(s.id);
        if (s.shown <= 0) {
          if (p && p.visual.object.visible) p.visual.object.visible = false;
          continue;
        }
        if (p === undefined) live.set(s.id, (p = create(s, f.definition)));
        if (!p) continue;
        const o = p.visual.object;
        const def = s.def!;
        if (!ctx.anchors.resolve(s.anchor, frame)) {
          o.visible = false;
          continue;
        }
        // orientation: upright (body axes) or aligned to the anchor normal, then rest + behavior rotation
        if (def.align) q.setFromUnitVectors(UP, frame.normal);
        else q.identity();
        const r = def.rotation;
        if (r) q.multiply(qr.setFromEuler(e.set(r[0], r[1], r[2])));
        if (s.rx !== 0 || s.ry !== 0 || s.rz !== 0) q.multiply(qr.setFromEuler(e.set(s.rx, s.ry, s.rz)));
        // position: anchor + standoff along its normal + offsets (anchor axes when aligned)
        const d = def.offset;
        off.set((d?.[0] ?? 0) + s.ox, (d?.[1] ?? 0) + s.oy, (d?.[2] ?? 0) + s.oz);
        if (def.align) off.applyQuaternion(qr.setFromUnitVectors(UP, frame.normal));
        pos.copy(frame.position).addScaledVector(frame.normal, def.standoff ?? 0).add(off);
        const own = p.visual.ownFade === true;
        const k = (def.scale ?? 1) * s.scale * (own ? 1 : pop(s.shown));
        o.matrix.compose(pos, q, sc.set(k, k, k));
        o.matrixWorldNeedsUpdate = true;
        o.visible = k > 1e-4;
        p.visual.update?.(f.dt, s, f);
        if (p.surface) {
          p.surface.fur.update(f.definition, f.time, f.revision);
          if (!own) p.surface.fade.value = s.shown;
        }
        if (own) continue;
        for (let j = 0; j < p.mats.length; j++) {
          const m = p.mats[j]!;
          const fade = (m.userData.fade as number | undefined) ?? 1;
          m.opacity = p.base[j]! * s.shown * fade;
        }
      }
    });
  },
});
