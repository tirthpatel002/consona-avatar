import * as THREE from 'three';
import { registerAtomDrawer } from '../atomDrawers.ts';
import { createAnchorFrame } from '../anchors.ts';
import { ParticleBurst } from '../../../../core/event/particles.ts';
import type { AvatarEffectRequest } from '../../../../core/event/effects.ts';
import { colorToRgb } from '../../../../core/color/color.ts';
import type { ColorLike } from '../../../../core/types/AvatarDefinition.ts';

/**
 * `effects` atom drawer: draws one-shot effects (`AvatarEffectQueue`) —
 * `sparkles` (a soft burst for a celebration) and `ripple` (a ring where a
 * nudge taps the screen). Everything is lazy and pooled: ONE instanced mesh
 * over a module-shared star geometry for every sparkle (additive, faded via
 * the instance colour, billboarded to the camera), a small pool of ring
 * meshes sharing one geometry. Nothing exists until the first effect;
 * nothing is simulated or uploaded while no effect is alive.
 *
 * Effects live under the rig root (not the body): a burst stays where it was
 * emitted while the body turns.
 */
export const SPARKLE_CAPACITY = 96;
export const RIPPLE_POOL = 4;
/** Default sparkle palette (soft gold, warm white, blush). */
export const SPARKLE_COLORS: readonly ColorLike[] = ['#ffd98a', '#fff4dc', '#ffb7c9'];
const RIPPLE_COLOR = '#fff1dc';
const RIPPLE_LIFE = 0.75;
const PALETTE = 16;

let starGeo: THREE.BufferGeometry | null = null;
/** Four-point star (unit radius, XY plane), module-shared. */
export function sharedStarGeometry(): THREE.BufferGeometry {
  if (starGeo) return starGeo;
  const pts = 8, pos = [0, 0, 0];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2 + Math.PI / 2, r = i % 2 === 0 ? 1 : 0.3;
    pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
  const idx: number[] = [];
  for (let i = 0; i < pts; i++) idx.push(0, 1 + i, 1 + ((i + 1) % pts));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.userData.shared = true;
  return (starGeo = g);
}
let ringGeo: THREE.RingGeometry | null = null;
function sharedRingGeometry(): THREE.RingGeometry {
  if (!ringGeo) {
    ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    ringGeo.userData.shared = true;
  }
  return ringGeo;
}

interface Ripple {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
  scale: number;
}

registerAtomDrawer({
  kind: 'effects',
  build(ctx) {
    const root = ctx.root, procedural = ctx.procedural, anchors = ctx.anchors;
    const at = createAnchorFrame();
    const burst = new ParticleBurst(SPARKLE_CAPACITY);
    const palette = new Float32Array(PALETTE * 3);
    let paletteHead = 0;
    let sparkles: THREE.InstancedMesh | null = null;
    const ripples: Ripple[] = [];
    let ripplesAlive = 0;
    let seq = 0;
    const v = new THREE.Vector3(), sc = new THREE.Vector3(), qCam = new THREE.Quaternion(), qRoot = new THREE.Quaternion(), qTmp = new THREE.Quaternion();
    const m4 = new THREE.Matrix4(), c = new THREE.Color();

    /** Anchor (+ body-axes offset) → rig-root space. */
    const place = (r: AvatarEffectRequest, fallback: string): boolean => {
      if (!anchors.resolve(r.anchor ?? fallback, at)) return false;
      const o = r.offset;
      v.copy(at.position);
      if (o) v.set(v.x + o[0], v.y + o[1], v.z + o[2]);
      procedural.updateWorldMatrix(true, false);
      root.updateWorldMatrix(true, false);
      root.worldToLocal(procedural.localToWorld(v));
      return true;
    };

    const ensureSparkles = (): THREE.InstancedMesh => {
      if (sparkles) return sparkles;
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
      sparkles = new THREE.InstancedMesh(sharedStarGeometry(), mat, SPARKLE_CAPACITY);
      sparkles.name = 'effects:sparkles';
      sparkles.frustumCulled = false;
      sparkles.renderOrder = 6;
      sparkles.count = 0;
      sparkles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      sparkles.setColorAt(0, c.setRGB(0, 0, 0));
      sparkles.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      root.add(sparkles);
      return sparkles;
    };

    const emitSparkles = (r: AvatarEffectRequest) => {
      if (!place(r, 'head')) return;
      ensureSparkles();
      const cols = r.colors && r.colors.length ? r.colors : SPARKLE_COLORS;
      const n = Math.min(cols.length, 4);
      const base = paletteHead;
      for (let i = 0; i < n; i++) {
        const [cr, cg, cb] = colorToRgb(cols[i]!);
        c.setRGB(cr, cg, cb, THREE.SRGBColorSpace);
        const slot = ((base + i) % PALETTE) * 3;
        palette[slot] = c.r;
        palette[slot + 1] = c.g;
        palette[slot + 2] = c.b;
      }
      paletteHead = (base + n) % PALETTE;
      const before = burst.count;
      burst.emit(r.count ?? 18, v.x, v.y, v.z, { colors: n, scale: r.scale ?? 1, speed: 1.1, spread: 0.8, life: [0.8, 1.4], size: [0.035, 0.075] }, r.seed ?? ++seq);
      for (let j = before; j < burst.count; j++) burst.color[j] = (base + burst.color[j]!) % PALETTE;
    };

    const emitRipple = (r: AvatarEffectRequest) => {
      if (!place(r, 'hand')) return;
      let rp: Ripple | undefined;
      for (let i = 0; i < ripples.length; i++) if (!ripples[i]!.mesh.visible) rp = ripples[i];
      if (!rp && ripples.length < RIPPLE_POOL) {
        const [cr, cg, cb] = colorToRgb((r.colors?.[0] as ColorLike | undefined) ?? RIPPLE_COLOR);
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(cr, cg, cb, THREE.SRGBColorSpace), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(sharedRingGeometry(), mat);
        mesh.name = 'effects:ripple';
        mesh.renderOrder = 6;
        mesh.visible = false;
        root.add(mesh);
        ripples.push((rp = { mesh, age: 0, scale: 1 }));
      }
      if (!rp) rp = ripples[0]!; // pool full: recycle
      if (!rp.mesh.visible) ripplesAlive++;
      rp.mesh.visible = true;
      rp.mesh.position.copy(v);
      rp.age = 0;
      rp.scale = r.scale ?? 1;
    };

    ctx.updaters.push((f) => {
      const q = f.effects;
      if (q && q.size > 0)
        q.drain((r) => {
          if (r.kind === 'sparkles') emitSparkles(r);
          else if (r.kind === 'ripple') emitRipple(r);
        });
      // idle: nothing alive → nothing to do
      if (burst.count === 0 && ripplesAlive === 0) {
        if (sparkles && sparkles.count !== 0) sparkles.count = 0;
        return;
      }
      const dt = f.dt;
      // camera rotation in root space (billboards)
      if (f.camera) {
        root.getWorldQuaternion(qRoot).invert();
        qCam.copy(qRoot).multiply(f.camera.getWorldQuaternion(qTmp));
      } else qCam.identity();
      if (sparkles && (burst.count > 0 || sparkles.count > 0)) {
        burst.step(dt);
        const n = burst.count;
        const P = burst.position;
        for (let j = 0; j < n; j++) {
          const k = burst.brightness(j);
          const s = burst.size[j]! * (0.6 + 0.4 * k);
          m4.compose(v.set(P[j * 3]!, P[j * 3 + 1]!, P[j * 3 + 2]!), qCam, sc.set(s, s, s));
          sparkles.setMatrixAt(j, m4);
          const slot = burst.color[j]! * 3;
          sparkles.setColorAt(j, c.setRGB(palette[slot]! * k, palette[slot + 1]! * k, palette[slot + 2]! * k));
        }
        sparkles.count = n;
        sparkles.instanceMatrix.needsUpdate = true;
        sparkles.instanceColor!.needsUpdate = true;
      }
      if (ripplesAlive > 0) {
        for (let i = 0; i < ripples.length; i++) {
          const rp = ripples[i]!;
          if (!rp.mesh.visible) continue;
          rp.age += dt;
          const t = rp.age / RIPPLE_LIFE;
          if (t >= 1) {
            rp.mesh.visible = false;
            ripplesAlive--;
            continue;
          }
          const s = (0.06 + 0.3 * (1 - (1 - t) * (1 - t))) * rp.scale;
          rp.mesh.scale.set(s, s, s);
          rp.mesh.quaternion.copy(qCam);
          rp.mesh.material.opacity = 0.7 * (1 - t) * Math.min(1, t * 6);
        }
      }
    });
  },
});
