import * as THREE from 'three';
import { mergeSimple } from '../../../adapters/three/util/geometry.ts';
import type { ColorLike } from '../../../core/types/AvatarDefinition.ts';
import { makeFurry } from '../../../adapters/three/rig/parts/furShells.ts';
import { createTaperedTubeGeometry } from '../../../adapters/three/rig/parts/body.ts';
import { registerAccessory } from '../../../adapters/three/rig/parts/accessories.ts';
import type { AccessoryBuildContext } from '../../../adapters/three/rig/parts/accessories.ts';
import type { AvatarFurOptions } from '../../../core/plugins/fur.schema.ts';
import type {
  AllieAntennaAccessory,
  AllieFluffAccessory,
  AllieHandAccessory,
  AllieHornsAccessory,
  AllieLoopAccessory,
  AllieNubsAccessory,
  AlliePompomAccessory,
  AllieSproutAccessory,
  AllieTuftAccessory,
} from '../allie.accessories.ts';
import {
  ALLIE_ANTENNA,
  ALLIE_FLUFF,
  ALLIE_HAND,
  ALLIE_HORNS,
  ALLIE_LOOP,
  ALLIE_NUBS,
  ALLIE_POMPOM,
  ALLIE_SPROUT,
  ALLIE_TUFT,
  DEFAULT_TUFT_POINTS,
} from '../allie.accessories.ts';

/** Fur options with an overridden strand length (keeps `false` = no fur). */
export function withFurLength(fur: AvatarFurOptions | false, length: number | undefined): AvatarFurOptions | false {
  return fur === false ? false : { ...fur, ...(length !== undefined ? { length } : {}) };
}


/** Curled tuft: tapered fur tube along a curl. */
export function buildAllieTuft(a: AllieTuftAccessory, ctx: { color: ColorLike; fur: Parameters<typeof withFurLength>[0] }) {
  const geo = createTaperedTubeGeometry(a.points ?? DEFAULT_TUFT_POINTS, a.radius ?? 0.13);
  const obj = makeFurry(geo, a.color ?? ctx.color, withFurLength(ctx.fur, a.furLength ?? 0.05));
  obj.name = 'allie-tuft';
  return { object: obj };
}


/**
 * Mitten-shaped hand: an ellipsoid whose cross-section swells toward the base
 * (where it joins the body) and tapers to a rounded tip. `axis` is the long
 * axis index (0=x,1=y), `baseSign` which end of it is the base.
 */
function createMittenGeometry(size: number, scale: [number, number, number], axis: 0 | 1, baseSign: 1 | -1, swell = 0.7) {
  const g = new THREE.SphereGeometry(size, 40, 28).scale(...scale);
  const p = g.attributes.position as THREE.BufferAttribute;
  const ext = size * scale[axis];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = (v.getComponent(axis) / ext) * baseSign; // 1 at base, -1 at tip
    const k = 1 + swell * Math.pow(THREE.MathUtils.clamp((d + 1) / 2, 0, 1), 1.6);
    for (let c = 0; c < 3; c++) if (c !== axis) v.setComponent(c, v.getComponent(c) * k);
    // pull the swollen base slightly into the body so it blends under the fur
    v.setComponent(axis, v.getComponent(axis) + baseSign * size * 0.08 * Math.max(0, d));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Hands get their own fur: the body's yarn/fur look (same pattern + colour) at
 * ~60% of the body's length, so they read as separate limbs instead of being
 * swallowed by the body shells.
 */
function handFur(fur: Parameters<typeof withFurLength>[0], length?: number) {
  if (fur === false) return false;
  return withFurLength(fur, length ?? Math.max(0.04, (fur.length ?? 0.09) * 0.6));
}

/** Stubby raised nub hand on a pivot (drives `rig.hand`). */
export function buildAllieHand(a: AllieHandAccessory, ctx: { color: ColorLike; fur: Parameters<typeof withFurLength>[0] }) {
  const right = a.side === 'right';
  const sign = right ? -1 : 1;
  const [px, py, pz] = a.position ?? [-0.8, 0.55, 0.6];
  const pivot = new THREE.Group();
  pivot.name = 'allie-hand-pivot';
  pivot.position.set(px * sign, py, pz);
  const size = a.size ?? 0.2;
  const hand = makeFurry(createMittenGeometry(size, [1, a.length ?? 1.2, 0.9], 1, -1), a.color ?? ctx.color, handFur(ctx.fur, a.furLength));
  hand.position.set(-0.05 * sign, 0.3 + size * ((a.length ?? 1.2) - 1.2) * 0.6, 0.05);
  pivot.add(hand);
  const rest = (a.rest ?? 0.35) * sign;
  pivot.rotation.z = rest;
  return { object: pivot, hand: { pivot, rest } };
}

// ---------- Threadies accessories (seated on the surface with ctx.surfaceTop) ----------

type Ctx = AccessoryBuildContext;
/** Accessory fur: the body's fur length/shell setup, but without the body's yarn pattern. */
const soft = (ctx: Ctx, length: number) => {
  const f = withFurLength(ctx.fur, length);
  return f === false ? false : { ...f, knit: false, patternShade: 0, density: 0.9, droop: 2 };
};
const V = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

/** Almond leaf: flattened ellipsoid with pointed ends, long axis = +x. */
function leafGeometry(len: number, width: number, thick: number) {
  const geo = new THREE.SphereGeometry(1, 32, 16);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const k = Math.pow(Math.max(0, 1 - x * x), 0.35);
    p.setXYZ(i, ((x + 1) / 2) * len, p.getY(i) * k * thick, p.getZ(i) * k * width);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildAllieSprout(a: AllieSproutAccessory, ctx: Ctx) {
  const s = a.size ?? 0.22;
  const x = a.x ?? 0;
  const y0 = ctx.surfaceTop(x, 0) - 0.03;
  const g = new THREE.Group();
  g.name = 'allie-sprout';
  const color = a.color ?? '#7FB539';
  const stem = makeFurry(createTaperedTubeGeometry([V(0, 0, 0), V(0, s * 0.35, 0), V(0.01, s * 0.6, 0)], s * 0.11, 0.7), a.stemColor ?? color, soft(ctx, 0.012));
  g.add(stem);
  for (const side of [-1, 1]) {
    const leaf = makeFurry(leafGeometry(s * 1.15, s * 0.42, s * 0.09), color, soft(ctx, 0.018));
    leaf.position.set(0, s * 0.55, 0);
    leaf.rotation.set(0, side < 0 ? Math.PI : 0, 0.5 + (a.lean ?? 0) * side);
    leaf.rotateX(side * 0.25);
    g.add(leaf);
  }
  g.position.set(x, y0, 0);
  return { object: g };
}

function fluffBall(a: AlliePompomAccessory | AllieFluffAccessory, ctx: Ctx, name: string, lumps: number) {
  const r = a.radius ?? 0.2;
  const sq = a.squash ?? 0.9;
  const x = a.x ?? 0;
  const top = ctx.surfaceTop(x, 0);
  const g = new THREE.Group();
  g.name = name;
  const color = a.color ?? ctx.color;
  const fur = soft(ctx, a.furLength ?? 0.08);
  const ball = makeFurry(new THREE.SphereGeometry(r, 48, 32).scale(1, sq, 0.95), color, fur);
  g.add(ball);
  for (let i = 0; i < lumps; i++) {
    const ang = (i / lumps) * Math.PI * 2 + 0.4;
    const lump = makeFurry(new THREE.SphereGeometry(r * 0.55, 32, 20), color, fur);
    lump.position.set(Math.cos(ang) * r * 0.62, r * sq * (0.15 + 0.35 * ((i * 7) % 3) / 2), Math.sin(ang) * r * 0.45);
    g.add(lump);
  }
  g.position.set(x, top + r * sq * 0.62, 0);
  return { object: g };
}

export const buildAlliePompom = (a: AlliePompomAccessory, ctx: Ctx) => fluffBall(a, ctx, 'allie-pompom', 0);
export const buildAllieFluff = (a: AllieFluffAccessory, ctx: Ctx) => fluffBall(a, ctx, 'allie-fluff', 6);

export function buildAllieAntenna(a: AllieAntennaAccessory, ctx: Ctx) {
  const h = a.height ?? 0.32;
  const x = a.x ?? 0;
  const th = a.thickness ?? 0.035;
  const y0 = ctx.surfaceTop(x, 0) - 0.04;
  const curl = a.curl ?? 0;
  const pts = curl
    ? [V(0, 0, 0), V(0.02, h * 0.45, 0), V(0.04 * curl, h * 0.85, 0), V(0.1 * curl, h, 0), V(0.14 * curl, h * 0.9, 0)]
    : [V(0, 0, 0), V(0.005, h * 0.5, 0), V(0, h, 0)];
  const g = new THREE.Group();
  g.name = 'allie-antenna';
  const color = a.color ?? ctx.color;
  g.add(makeFurry(createTaperedTubeGeometry(pts, th, curl ? 0.55 : 0.85), color, soft(ctx, 0.015)));
  if (a.bobble) {
    const b = makeFurry(new THREE.SphereGeometry(a.bobble, 32, 20).scale(1, 1.15, 1), color, soft(ctx, 0.04));
    b.position.set(0, h + a.bobble * 0.7, 0);
    g.add(b);
  }
  g.position.set(x, y0, 0);
  return { object: g };
}

export function buildAllieLoop(a: AllieLoopAccessory, ctx: Ctx) {
  const R = a.radius ?? 0.12;
  const t = a.tube ?? 0.035;
  const x = a.x ?? 0;
  const ring = makeFurry(new THREE.TorusGeometry(R, t, 20, 48), a.color ?? '#EE8FC6', soft(ctx, 0.012));
  ring.name = 'allie-loop';
  ring.position.set(x, ctx.surfaceTop(x, 0) + R * 0.75, 0);
  ring.rotation.set(0, a.tilt ?? 0.35, 0);
  return { object: ring };
}

/**
 * Horn: a curved cone along a smooth arc, radius tapering from a flared base
 * (sunk into the head so it blends in) to a softly rounded tip.
 */
export function createHornGeometry(side: number, L: number, r: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -r * 0.9, 0),
    new THREE.Vector3(side * L * 0.1, L * 0.3, 0),
    new THREE.Vector3(side * L * 0.2, L * 0.65, -0.02),
    new THREE.Vector3(side * L * 0.1, L * 0.92, -0.03),
    new THREE.Vector3(-side * L * 0.03, L * 1.02, -0.03),
  ]);
  const seg = 48;
  const radial = 24;
  const tube = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const radius = (s: number) => {
    const taper = r * (0.18 + 0.82 * Math.pow(1 - s, 0.85));
    const flare = s < 0.25 ? 1 + 0.55 * Math.pow(1 - s / 0.25, 2) : 1;
    return taper * flare;
  };
  const p = tube.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const s = i / seg;
    curve.getPointAt(s, c);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c); // unit offset (tube radius 1)
      v.multiplyScalar(radius(s)).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  tube.computeVertexNormals();
  // rounded tip cap
  const tipR = radius(1);
  const end = curve.getPointAt(1);
  const tip = new THREE.SphereGeometry(tipR, 16, 12).translate(end.x, end.y, end.z);
  return mergeSimple([tube, tip]);
}


export function buildAllieHorns(a: AllieHornsAccessory, ctx: Ctx) {
  const sp = a.spread ?? 0.42;
  const L = a.length ?? 0.4;
  const r = a.radius ?? 0.1;
  const g = new THREE.Group();
  g.name = 'allie-horns';
  // symmetric pair: same seat height (the lower of the two probes, so both bases sink in) for both sides
  const y0 = Math.min(ctx.surfaceTop(-sp, 0), ctx.surfaceTop(sp, 0));
  for (const side of [-1, 1]) {
    const horn = makeFurry(createHornGeometry(side, L, r), a.color ?? ctx.color, soft(ctx, a.furLength ?? 0.025));
    horn.position.set(side * sp, y0, 0);
    horn.rotation.z = -side * 0.12; // lean outward, following the head curve
    g.add(horn);
  }
  return { object: g };
}

export function buildAllieNubs(a: AllieNubsAccessory, ctx: Ctx) {
  const size = a.size ?? 0.17;
  const y = ctx.bounds.min.y + (a.y ?? 0.3);
  const ray = new THREE.Raycaster();
  const g = new THREE.Group();
  g.name = 'allie-nubs';
  let hand: { pivot: THREE.Object3D; rest: number } | undefined;
  for (const side of [-1, 1]) {
    ray.set(new THREE.Vector3(side * 5, y, 0.1), new THREE.Vector3(-side, 0, 0));
    const hit = ray.intersectObject(ctx.base)[0];
    const sx = hit ? hit.point.x : side * ctx.bounds.max.x;
    const pivot = new THREE.Group();
    // seat the pivot on the body surface, then push the nub out past the body's fur shells
    const bodyFur = ctx.fur === false ? 0 : (ctx.fur.length ?? 0.09);
    pivot.position.set(sx - side * size * 0.2, y, 0.1);
    const nub = makeFurry(createMittenGeometry(size, [1.05, a.length ?? 1.15, 0.95], 0, (-side) as 1 | -1), a.color ?? ctx.color, handFur(ctx.fur, a.furLength));
    nub.position.set(side * (size * 0.85 + bodyFur * 0.9), size * 0.2, 0);
    pivot.add(nub);
    pivot.rotation.z = side * -0.25;
    g.add(pivot);
    if (side < 0) hand = { pivot, rest: pivot.rotation.z };
  }
  return { object: g, hand };
}

let registered = false;
/** Register Allie accessory builders with the Three adapter (idempotent). */
export function registerAllieAccessories(): void {
  if (registered) return;
  registered = true;
  registerAccessory<AllieTuftAccessory>(ALLIE_TUFT, buildAllieTuft);
  registerAccessory<AllieHandAccessory>(ALLIE_HAND, buildAllieHand);
  registerAccessory<AllieSproutAccessory>(ALLIE_SPROUT, buildAllieSprout);
  registerAccessory<AlliePompomAccessory>(ALLIE_POMPOM, buildAlliePompom);
  registerAccessory<AllieFluffAccessory>(ALLIE_FLUFF, buildAllieFluff);
  registerAccessory<AllieAntennaAccessory>(ALLIE_ANTENNA, buildAllieAntenna);
  registerAccessory<AllieLoopAccessory>(ALLIE_LOOP, buildAllieLoop);
  registerAccessory<AllieHornsAccessory>(ALLIE_HORNS, buildAllieHorns);
  registerAccessory<AllieNubsAccessory>(ALLIE_NUBS, buildAllieNubs);
}
