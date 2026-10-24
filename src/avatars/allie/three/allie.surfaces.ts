import * as THREE from 'three';
import { canvas, finish, rng, wrapped } from '../../../adapters/three/util/canvasTexture.ts';
import { swapUV, fixNormals, mergeGeometries } from '../../../adapters/three/util/geometry.ts';
import { registerSurfacePattern } from '../../../adapters/three/materials/patterns.ts';
import { registerBodyGeometry } from '../../../adapters/three/rig/parts/body.ts';
import type { BodyGridSurfaceBuilder } from '../../../adapters/three/rig/parts/body.ts';
import { allieShapes } from '../allie.shapes.ts';

/**
 * Allie yarn surfaces (tileable greyscale bump maps; the fur shader also uses
 * them to shade the albedo via `fur.patternShade`) and the two body
 * geometries that aren't deformed spheres (torus, arch).
 */





/** Knit bump (rows of little V stitches). */
export function createKnitTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const cx = x * 16 + 8;
      const cy = y * 16;
      const gr = g.createLinearGradient(cx - 8, 0, cx + 8, 0);
      gr.addColorStop(0, '#333');
      gr.addColorStop(0.5, '#fff');
      gr.addColorStop(1, '#333');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(cx - 4, cy + 8, 4, 8, -0.5, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(cx + 4, cy + 8, 4, 8, 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(28, 16);
  return t;
}

/** Chunky stockinette ribs: columns of V stitches with deep purl gutters (8 x 8 per tile). */
export function createRibTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = canvas(S);
  const cw = S / 8;
  const rh = S / 8;
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 8; row++) {
      const cx = col * cw + cw / 2;
      const cy = row * rh;
      for (const side of [-1, 1]) {
        const gr = g.createLinearGradient(cx + side * cw * 0.45, 0, cx, 0);
        gr.addColorStop(0, '#222');
        gr.addColorStop(0.55, '#f2f2f2');
        gr.addColorStop(1, '#5a5a5a');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(cx + side * cw * 0.22, cy + rh * 0.62, cw * 0.24, rh * 0.62, side * 0.62, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return finish(c);
}

/** Two braided cables per tile between purl columns. */
export function createCableTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = canvas(S);
  // background: fine stockinette
  for (let col = 0; col < 16; col++) for (let row = 0; row < 32; row++) {
    const cx = col * 16 + 8;
    const cy = row * 8;
    g.fillStyle = '#6a6a6a';
    g.beginPath();
    g.ellipse(cx - 3, cy + 4, 3, 5, -0.5, 0, Math.PI * 2);
    g.ellipse(cx + 3, cy + 4, 3, 5, 0.5, 0, Math.PI * 2);
    g.fill();
  }
  for (const bx of [64, 192]) {
    // gutters
    g.fillStyle = '#000';
    g.fillRect(bx - 50, 0, 8, S);
    g.fillRect(bx + 42, 0, 8, S);
    // two crossing strands, period = 128 px (2 crosses per tile)
    for (let k = 0; k < 4; k++) {
      const y0 = k * 64 - 64;
      for (let s = 0; s < 2; s++) {
        const dir = (k + s) % 2 ? 1 : -1;
        const gr = g.createLinearGradient(bx - 30, 0, bx + 30, 0);
        gr.addColorStop(0, '#303030');
        gr.addColorStop(0.5, '#ffffff');
        gr.addColorStop(1, '#303030');
        g.strokeStyle = gr;
        g.lineCap = 'round';
        g.lineWidth = s === 1 ? 30 : 26;
        g.beginPath();
        g.moveTo(bx - dir * 20, y0 + 6);
        g.bezierCurveTo(bx - dir * 22, y0 + 40, bx + dir * 22, y0 + 50, bx + dir * 20, y0 + 122);
        g.stroke();
        // stitch lines on the strand
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        for (let i = 1; i < 10; i++) {
          const t = i / 10;
          const x = bx - dir * 20 + dir * 40 * (3 * t * t - 2 * t * t * t);
          const y = y0 + 6 + t * 116;
          g.beginPath();
          g.moveTo(x - 10, y - 3);
          g.lineTo(x, y + 3);
          g.lineTo(x + 10, y - 3);
          g.stroke();
        }
      }
    }
  }
  return finish(c);
}

/** Bouclé / curly fleece: dense random little yarn loops. */
export function createBoucleTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = canvas(S);
  g.fillStyle = '#3a3a3a';
  g.fillRect(0, 0, S, S);
  const rand = rng(7);
  for (let i = 0; i < 900; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 3 + rand() * 5;
    const v = 140 + Math.floor(rand() * 115);
    wrapped(S, x, y, r + 3, (px, py) => {
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.lineWidth = 2 + rand() * 1.5;
      g.beginPath();
      g.arc(px, py, r, rand() * 6, rand() * 6 + 4.5);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(px, py, r - 2, 0, Math.PI * 2);
      g.stroke();
    });
  }
  return finish(c);
}

/** Popcorn / bobble knit: offset rows of round bobbles (6 x 6 per tile). */
export function createPopcornTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = canvas(S);
  const n = 6;
  const d = S / n;
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const x = col * d + (row % 2 ? d / 2 : 0);
    const y = row * d + d / 2;
    wrapped(S, x, y, d, (px, py) => {
      const gr = g.createRadialGradient(px - d * 0.12, py - d * 0.14, d * 0.05, px, py, d * 0.5);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.6, '#9a9a9a');
      gr.addColorStop(1, '#000000');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(px, py, d * 0.5, 0, Math.PI * 2);
      g.fill();
    });
  }
  return finish(c);
}

// ---------- body geometries ----------


/**
 * Upright torus (Rolly). Params: radius (ring), tube, holeY (shift of the hole),
 * depth. Spans y in [-1, ...] like every body.
 */
export function createAllieTorus(params: Record<string, unknown>): THREE.BufferGeometry {
  const R = Number(params.radius ?? 0.6);
  const r = Number(params.tube ?? 0.42);
  const depth = Number(params.depth ?? 0.82);
  const geo = new THREE.TorusGeometry(R, r, 48, 128);
  // a little thicker at the bottom so it stands, hole slightly low
  const p = geo.attributes.position as THREE.BufferAttribute;
  const holeY = Number(params.holeY ?? 0);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const ny = y / (R + r);
    p.setXYZ(i, x * (1 + 0.04 * -ny), y + holeY * (1 - Math.abs(ny)), z * depth);
  }
  fixNormals(geo, depth);
  geo.computeBoundingBox();
  geo.translate(0, -1 - geo.boundingBox!.min.y, 0);
  return swapUV(geo);
}

/** Inverted-U arch (Barnaby): a tube along two straight legs + a half-circle bridge. */
export function createAllieArch(params: Record<string, unknown>): THREE.BufferGeometry {
  const R = Number(params.radius ?? 0.5);
  const r = Number(params.tube ?? 0.35);
  const leg = Number(params.leg ?? 0.95);
  const depth = Number(params.depth ?? 1);
  const pts: THREE.Vector3[] = [];
  const legSteps = 8;
  for (let i = 0; i <= legSteps; i++) pts.push(new THREE.Vector3(-R, -leg + (leg * i) / legSteps, 0));
  for (let i = 1; i < 24; i++) {
    const a = Math.PI - (Math.PI * i) / 24;
    pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
  }
  for (let i = 0; i <= legSteps; i++) pts.push(new THREE.Vector3(R, -(leg * i) / legSteps, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tube = new THREE.TubeGeometry(curve, 160, r, 48, false);
  // round feet: cap both ends with half spheres
  const cap = (x: number) => new THREE.SphereGeometry(r, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(x, -leg, 0);
  const parts = [tube, cap(-R), cap(R)].map((g) => g.toNonIndexed());
  const merged = mergeGeometries(parts);
  const p = merged.attributes.position as THREE.BufferAttribute;
  const n = merged.attributes.normal as THREE.BufferAttribute;
  const floor = -leg - r * 0.8;
  for (let i = 0; i < p.count; i++) {
    // flatten the very bottom so it stands
    const y = p.getY(i);
    if (y < floor) n.setXYZ(i, n.getX(i) * 0.3, -1, n.getZ(i) * 0.3);
    p.setXYZ(i, p.getX(i), Math.max(y, floor), p.getZ(i) * depth);
  }
  fixNormals(merged, depth);
  merged.computeBoundingBox();
  merged.translate(0, -1 - merged.boundingBox!.min.y, 0);
  return swapUV(merged);
}



/** Flower body: a sphere with its poles on ±z, deformed by `allieShapes.flower` (even tessellation per petal). */
export function createAllieFlower(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 128, 48).rotateX(Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    allieShapes.flower(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- grid (morphable) forms of the bodies above ----------

/** Torus on the shared morph grid (u = around the ring, v = around the tube). */
export const allieTorusSurface: BodyGridSurfaceBuilder = (params) => {
  const R = Number(params.radius ?? 0.6);
  const r = Number(params.tube ?? 0.42);
  const depth = Number(params.depth ?? 0.82);
  const holeY = Number(params.holeY ?? 0);
  return {
    alignBottom: -1,
    surface(u, v, out, uv) {
      const a = u * Math.PI * 2;
      const b = v * Math.PI * 2;
      const x = (R + r * Math.cos(b)) * Math.cos(a);
      const y = (R + r * Math.cos(b)) * Math.sin(a);
      const z = r * Math.sin(b);
      const ny = y / (R + r);
      out.set(x * (1 + 0.04 * -ny), y + holeY * (1 - Math.abs(ny)), z * depth);
      uv.set(v, u); // same orientation as the swapped TorusGeometry uvs
    },
  };
};

/** Arch on the shared morph grid (u = around the tube, v = foot → bridge → foot, with round feet). */
export const allieArchSurface: BodyGridSurfaceBuilder = (params) => {
  const R = Number(params.radius ?? 0.5);
  const r = Number(params.tube ?? 0.35);
  const leg = Number(params.leg ?? 0.95);
  const depth = Number(params.depth ?? 1);
  const pts: THREE.Vector3[] = [];
  const legSteps = 8;
  for (let i = 0; i <= legSteps; i++) pts.push(new THREE.Vector3(-R, -leg + (leg * i) / legSteps, 0));
  for (let i = 1; i < 24; i++) {
    const a = Math.PI - (Math.PI * i) / 24;
    pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
  }
  for (let i = 0; i <= legSteps; i++) pts.push(new THREE.Vector3(R, -(leg * i) / legSteps, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const cap = 0.1;
  const floor = -leg - r * 0.8;
  const c = new THREE.Vector3();
  const t = new THREE.Vector3();
  return {
    alignBottom: -1,
    surface(u, v, out, uv) {
      let s: number;
      let rad = r;
      let push = 0;
      if (v < cap) {
        const psi = (v / cap) * (Math.PI / 2);
        s = 0;
        rad = r * Math.sin(psi);
        push = -r * Math.cos(psi);
      } else if (v > 1 - cap) {
        const psi = ((1 - v) / cap) * (Math.PI / 2);
        s = 1;
        rad = r * Math.sin(psi);
        push = r * Math.cos(psi);
      } else s = (v - cap) / (1 - 2 * cap);
      curve.getPointAt(s, c);
      curve.getTangentAt(s, t);
      c.addScaledVector(t, push);
      const a = u * Math.PI * 2;
      // ring frame: in-plane normal (−t.y, t.x) and the z axis
      out.set(c.x + rad * Math.cos(a) * -t.y, c.y + rad * Math.cos(a) * t.x, rad * Math.sin(a));
      out.set(out.x, Math.max(out.y, floor), out.z * depth);
      uv.set(u, s);
    },
  };
};

/** Flower on the shared morph grid (poles on ±z, like `createAllieFlower`). */
export const allieFlowerSurface: BodyGridSurfaceBuilder = () => ({
  surface(u, v, out, uv) {
    const phi = u * Math.PI * 2;
    const th = v * Math.PI;
    const x = -Math.cos(phi) * Math.sin(th);
    const y = Math.cos(th);
    const z = Math.sin(phi) * Math.sin(th);
    out.set(x, -z, y);
    allieShapes.flower(out);
    uv.set(u, 1 - v);
  },
});

let done = false;
/** Register Allie surface patterns + body geometries with the Three adapter (idempotent). */
export function registerAllieSurfaces(): void {
  if (done) return;
  done = true;
  registerSurfacePattern('knit', { create: createKnitTexture, repeat: [28, 16] });
  registerSurfacePattern('rib', { create: createRibTexture, repeat: [3, 5] });
  registerSurfacePattern('cable', { create: createCableTexture, repeat: [2, 5] });
  registerSurfacePattern('boucle', { create: createBoucleTexture, repeat: [6, 3] });
  registerSurfacePattern('popcorn', { create: createPopcornTexture, repeat: [8, 4] });
  registerBodyGeometry('allie:torus', createAllieTorus, allieTorusSurface);
  registerBodyGeometry('allie:arch', createAllieArch, allieArchSurface);
  registerBodyGeometry('allie:flower', createAllieFlower, allieFlowerSurface);
}
