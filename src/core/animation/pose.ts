import { hypot4 } from '../math/hypot.ts';
import type { BehaviorEnd } from './timeline.ts';
import type { AvatarRig } from '../types/AvatarDefinition.ts';
import { AtomWrite, AvatarReachWrite } from '../atom/atomLayer.ts';
import { AvatarLimbWrite } from '../atom/limbLayer.ts';
import type { AvatarAnchorName } from '../atom/atom.ts';
import { AVATAR_MESSAGE_ANCHOR } from '../event/message.ts';

/**
 * Avatar pose: the behavior-driven channels of a body rig as offsets from rest,
 * in one flat Float64Array (no per-frame allocation):
 *
 *   y        root height offset (0 = `rig.baseY`)
 *   sx sy sz body scale (1 = rest)
 *   body q   body orientation quaternion (identity = rest)
 *   head q   head orientation quaternion
 *   hand     hand Z rotation offset (0 = `rig.handRest`)
 *
 * Behaviors write a pose through `AvatarPoseWriter` (relative: what the behavior
 * adds on top of the live pose; absolute: the pose to reach). The state
 * machine's `AvatarPoseLayers` composes hold ∘ carry ∘ behavior and writes it
 * to the rig.
 */
export const POSE_Y = 0;
export const POSE_SX = 1;
export const POSE_SY = 2;
export const POSE_SZ = 3;
export const POSE_BODY_Q = 4;
export const POSE_HEAD_Q = 8;
export const POSE_HAND = 12;
export const POSE_SIZE = 13;

export type AvatarPose = Float64Array;

/** A rest (identity) pose. */
export function createAvatarPose(): AvatarPose {
  const p = new Float64Array(POSE_SIZE);
  setIdentityPose(p);
  return p;
}

export function setIdentityPose(p: AvatarPose): void {
  p.fill(0);
  p[POSE_SX] = p[POSE_SY] = p[POSE_SZ] = 1;
  p[POSE_BODY_Q + 3] = 1;
  p[POSE_HEAD_Q + 3] = 1;
}

/** Quaternion from XYZ Euler angles (THREE's default order), written at `o`. */
export function eulerToQuat(out: Float64Array, o: number, x: number, y: number, z: number): void {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  out[o] = s1 * c2 * c3 + c1 * s2 * s3;
  out[o + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[o + 2] = c1 * c2 * s3 + s1 * s2 * c3;
  out[o + 3] = c1 * c2 * c3 - s1 * s2 * s3;
}

/** Write-side API handed to behaviors (`ctx.pose`). Every call overwrites that channel. */
export class AvatarPoseWriter {
  readonly pose: AvatarPose;
  constructor(pose: AvatarPose) {
    this.pose = pose;
  }
  /** Root height offset (body units above rest). */
  y(v: number): this {
    this.pose[POSE_Y] = v;
    return this;
  }
  scale(x: number, y: number, z: number): this {
    this.pose[POSE_SX] = x;
    this.pose[POSE_SY] = y;
    this.pose[POSE_SZ] = z;
    return this;
  }
  /** Body rotation, XYZ Euler radians. */
  body(x: number, y: number, z: number): this {
    eulerToQuat(this.pose, POSE_BODY_Q, x, y, z);
    return this;
  }
  bodyQuaternion(x: number, y: number, z: number, w: number): this {
    const p = this.pose;
    p[POSE_BODY_Q] = x; p[POSE_BODY_Q + 1] = y; p[POSE_BODY_Q + 2] = z; p[POSE_BODY_Q + 3] = w;
    return this;
  }
  /** Head rotation, XYZ Euler radians. */
  head(x: number, y: number, z: number): this {
    eulerToQuat(this.pose, POSE_HEAD_Q, x, y, z);
    return this;
  }
  /** Hand Z rotation offset from rest. */
  hand(z: number): this {
    this.pose[POSE_HAND] = z;
    return this;
  }

  // ---------- face channels (not part of the pose blend; reset every frame) ----------
  /** Preset eye pose overlaid relatively this frame (see `AvatarFaceState.eyeOverlay`); weight 0 = none. */
  eyeOverlayPose: string | null = null;
  eyeOverlayWeight = 0;
  eyeOverlayMirror = false;
  /** Mouth shape to show this frame (null = the configured / preset mouth). */
  mouthShape: string | null = null;
  eyePose(preset: string | null, weight = 1, mirror = false): this {
    this.eyeOverlayPose = preset;
    this.eyeOverlayWeight = weight;
    this.eyeOverlayMirror = mirror;
    return this;
  }
  mouth(shape: string | null): this {
    this.mouthShape = shape;
    return this;
  }

  // ---------- atom + reach channels (see `core/atom`; reset every frame) ----------
  /** Atom requests of this frame (pooled: `atomWrites[0 .. atomCount)`). */
  readonly atomWrites: AtomWrite[] = [];
  atomCount = 0;
  /** Reach request of this frame. */
  readonly reachWrite = new AvatarReachWrite();
  /**
   * Show atom `id` this frame at `weight` (0..1); chain `.at(anchor)`,
   * `.offset(x, y, z)`, `.rotate(x, y, z)`, `.size(s)`. Not writing it fades it out.
   */
  atom(id: string, weight = 1): AtomWrite {
    let w = this.atomWrites[this.atomCount];
    if (!w) this.atomWrites.push((w = new AtomWrite()));
    this.atomCount++;
    return w.reset(id, weight);
  }
  /**
   * Bring a hand toward anchor `target` (`approach` 0 = the family's hold point
   * near it, 1 = onto it); chain `.side('left' | 'right')`, `.offset(x, y, z)`.
   */
  reach(target: AvatarAnchorName | null, weight = 1, approach = 0): AvatarReachWrite {
    return this.reachWrite.reset(target, weight, approach);
  }

  // ---------- multi-limb channel (see `core/atom/limbLayer`; reset every frame) ----------
  /** Limb requests of this frame (pooled: `limbWrites[0 .. limbCount)`). */
  readonly limbWrites: AvatarLimbWrite[] = [];
  limbCount = 0;
  /** Limb tone of this frame: 1 = still / limp (the max of the behavior's and the postures'). */
  limbCalm = 0;
  limbSlack = 0;
  /**
   * Bring limb `index` (the family's numbering, e.g. a tentacle) toward anchor
   * `target` this frame (`approach` 1 = onto the anchor, ignoring the
   * offset); chain `.offset(x, y, z)`. Not writing it relaxes the limb.
   */
  limb(index: number, target: AvatarAnchorName, weight = 1, approach = 0): AvatarLimbWrite {
    let w = this.limbWrites[this.limbCount];
    if (!w) this.limbWrites.push((w = new AvatarLimbWrite()));
    this.limbCount++;
    return w.reset(index, target, weight, approach);
  }
  /** Limb tone this frame: `calm` 1 holds the limbs still, `slack` 1 lets them go limp. */
  limbTone(calm: number, slack = 0): this {
    this.limbCalm = Math.max(this.limbCalm, calm);
    this.limbSlack = Math.max(this.limbSlack, slack);
    return this;
  }

  // ---------- message channel (see `core/message`; reset every frame) ----------
  messageText: string | null = null;
  messageWeight = 0;
  messageAnchor: AvatarAnchorName = AVATAR_MESSAGE_ANCHOR;
  /** Show a speech bubble this frame (`weight` 0..1 fades it; not writing it clears it). An emitted message wins. */
  message(text: string, weight = 1, anchor: AvatarAnchorName = AVATAR_MESSAGE_ANCHOR): this {
    this.messageText = text;
    this.messageWeight = weight;
    this.messageAnchor = anchor;
    return this;
  }

  /** Clear the non-pose channels (face, atoms, reach, limbs, message) before an behavior writes the next frame. */
  resetChannels(): void {
    this.eyeOverlayPose = null;
    this.eyeOverlayWeight = 0;
    this.eyeOverlayMirror = false;
    this.mouthShape = null;
    this.atomCount = 0;
    this.reachWrite.reset(null, 0, 0);
    this.limbCount = 0;
    this.limbCalm = 0;
    this.limbSlack = 0;
    this.messageText = null;
    this.messageWeight = 0;
  }
}


/** Partial absolute pose (timeline `pose` steps / the built-in `pose` behavior). */
export interface AvatarPoseOptions {
  /** Blend time to reach the pose (s, default 0.4). */
  duration?: number;
  ease?: string;
  end?: BehaviorEnd;
  offset?: number;
  preset?: string;
}

export interface AvatarPoseTarget {
  y?: number;
  scale?: number | [number, number, number];
  /** XYZ Euler radians. */
  body?: [number, number, number];
  head?: [number, number, number];
  hand?: number;
}

export function writePoseTarget(w: AvatarPoseWriter, t: AvatarPoseTarget): void {
  if (t.y !== undefined) w.y(t.y);
  if (t.scale !== undefined) typeof t.scale === 'number' ? w.scale(t.scale, t.scale, t.scale) : w.scale(t.scale[0], t.scale[1], t.scale[2]);
  if (t.body) w.body(t.body[0], t.body[1], t.body[2]);
  if (t.head) w.head(t.head[0], t.head[1], t.head[2]);
  if (t.hand !== undefined) w.hand(t.hand);
}

// ---------- layer stack ----------
const OFFSET_REST = [0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
const QUATS = [POSE_BODY_Q, POSE_HEAD_Q];
const LINEAR = [POSE_Y, POSE_SX, POSE_SY, POSE_SZ, POSE_HAND];

function normalizeQ(p: Float64Array, o: number): void {
  const n = hypot4(p[o]!, p[o + 1]!, p[o + 2]!, p[o + 3]!) || 1;
  p[o] = p[o]! / n; p[o + 1] = p[o + 1]! / n; p[o + 2] = p[o + 2]! / n; p[o + 3] = p[o + 3]! / n;
}

/** out[o..] = a[o..] ⊗ b[o..] (Hamilton product; `out` may alias neither). */
function mulQ(out: Float64Array, a: Float64Array, b: Float64Array, o: number): void {
  const ax = a[o]!, ay = a[o + 1]!, az = a[o + 2]!, aw = a[o + 3]!;
  const bx = b[o]!, by = b[o + 1]!, bz = b[o + 2]!, bw = b[o + 3]!;
  out[o] = aw * bx + ax * bw + ay * bz - az * by;
  out[o + 1] = aw * by - ax * bz + ay * bw + az * bx;
  out[o + 2] = aw * bz + ax * by - ay * bx + az * bw;
  out[o + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** out = a ∘ b (offsets add, scales multiply, rotations compose). */
export function composePose(out: AvatarPose, a: AvatarPose, b: AvatarPose): void {
  out[POSE_Y] = a[POSE_Y]! + b[POSE_Y]!;
  out[POSE_SX] = a[POSE_SX]! * b[POSE_SX]!;
  out[POSE_SY] = a[POSE_SY]! * b[POSE_SY]!;
  out[POSE_SZ] = a[POSE_SZ]! * b[POSE_SZ]!;
  mulQ(out, a, b, POSE_BODY_Q);
  mulQ(out, a, b, POSE_HEAD_Q);
  out[POSE_HAND] = a[POSE_HAND]! + b[POSE_HAND]!;
  normalizeQ(out, POSE_BODY_Q);
  normalizeQ(out, POSE_HEAD_Q);
}

/** out = lerp(a, b, k) per channel (quaternions nlerp on the short arc). `out` may alias `a`. */
export function blendPose(out: AvatarPose, a: AvatarPose, b: AvatarPose, k: number): void {
  for (const o of QUATS) {
    const dot = a[o]! * b[o]! + a[o + 1]! * b[o + 1]! + a[o + 2]! * b[o + 2]! + a[o + 3]! * b[o + 3]!;
    const s = dot < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) out[o + i] = a[o + i]! + (s * b[o + i]! - a[o + i]!) * k;
    normalizeQ(out, o);
  }
  for (const i of LINEAR) out[i] = a[i]! + (b[i]! - a[i]!) * k;
}

/**
 * Pose layers: hold ∘ carry(t) ∘ behavior. `carry` is the live pose captured when
 * an behavior starts; it relaxes to rest along a critically damped spring that
 * starts with the captured velocity (momentum survives interrupts). `hold`
 * keeps an ended behavior's final pose until the next behavior starts.
 */
export class AvatarPoseLayers {
  readonly out = createAvatarPose();
  readonly hold = createAvatarPose();
  private readonly prev = createAvatarPose();
  private readonly vel = new Float64Array(POSE_SIZE);
  private readonly carry0 = new Float64Array(POSE_SIZE);
  private readonly carryV = new Float64Array(POSE_SIZE);
  private readonly carry = createAvatarPose();
  private readonly tmp = createAvatarPose();
  private carryT = 0;
  private omega = 40;
  private hasCarry = false;

  constructor() {
    this.carry0.set(OFFSET_REST);
  }

  /** Start relaxing the live pose (`out`, incl. hold) to rest over ~`duration` s, keeping its velocity. */
  capture(duration: number): void {
    const out = this.out;
    // short arc: identity, not −identity (a full spin ends at q = −1)
    for (const o of QUATS) if (out[o + 3]! < 0) for (let i = 0; i < 4; i++) { out[o + i] = -out[o + i]!; this.vel[o + i] = -this.vel[o + i]!; }
    for (let i = 0; i < POSE_SIZE; i++) {
      this.carry0[i] = out[i]! - OFFSET_REST[i]!;
      this.carryV[i] = this.vel[i]!;
    }
    setIdentityPose(this.hold);
    this.carryT = 0;
    this.omega = 6 / Math.max(1e-3, duration);
    this.hasCarry = duration > 0;
  }

  /** Freeze the current output as the held pose (no carry). */
  holdCurrent(): void {
    this.hold.set(this.out);
    this.hasCarry = false;
  }

  /** Clear everything (seek / reset). */
  reset(): void {
    setIdentityPose(this.out);
    setIdentityPose(this.prev);
    setIdentityPose(this.hold);
    this.vel.fill(0);
    this.hasCarry = false;
  }

  /**
   * Compose this frame: `behavior` is relative (offset on the live pose) or
   * absolute (target); `weight` 0..1 is the behavior's blend-in.
   */
  compose(behavior: AvatarPose, mode: 'relative' | 'absolute', weight: number, dt: number): AvatarPose {
    const { carry, tmp, out } = this;
    // carry(t): x(t) = (x0 + (v0 + ω x0) t) e^{−ωt}
    if (this.hasCarry) {
      this.carryT += dt;
      const t = this.carryT, w = this.omega, e = Math.exp(-w * t);
      for (let i = 0; i < POSE_SIZE; i++) carry[i] = OFFSET_REST[i]! + (this.carry0[i]! + (this.carryV[i]! + w * this.carry0[i]!) * t) * e;
      normalizeQ(carry, POSE_BODY_Q);
      normalizeQ(carry, POSE_HEAD_Q);
      if (w * t > 12) this.hasCarry = false;
      composePose(tmp, this.hold, carry);
    } else tmp.set(this.hold);
    if (mode === 'absolute') blendPose(out, tmp, behavior, weight);
    else {
      if (weight < 1) {
        carry.set(OFFSET_REST);
        blendPose(carry, carry, behavior, weight);
        composePose(out, tmp, carry);
      } else composePose(out, tmp, behavior);
    }
    if (dt > 1e-4) for (let i = 0; i < POSE_SIZE; i++) this.vel[i] = (out[i]! - this.prev[i]!) / dt;
    this.prev.set(out);
    return out;
  }
}

/** Write a composed pose onto a rig (quaternion when the transform has one, else XYZ Euler). */
export function applyPoseToRig(p: AvatarPose, rig: AvatarRig): void {
  const rp = rig.root.position;
  rp.set(rp.x, rig.baseY + p[POSE_Y]!, rp.z);
  rig.body.scale.set(p[POSE_SX]!, p[POSE_SY]!, p[POSE_SZ]!);
  writeRotation(rig.body, p, POSE_BODY_Q);
  writeRotation(rig.head, p, POSE_HEAD_Q);
  if (rig.hand) rig.hand.rotation.set(rig.hand.rotation.x, rig.hand.rotation.y, rig.handRest + p[POSE_HAND]!);
}

function writeRotation(t: AvatarRig['body'], p: AvatarPose, o: number): void {
  const x = p[o]!, y = p[o + 1]!, z = p[o + 2]!, w = p[o + 3]!;
  if (t.quaternion) {
    t.quaternion.set(x, y, z, w);
    return;
  }
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - w * z), m13 = 2 * (x * z + w * y);
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - w * x), m32 = 2 * (y * z + w * x), m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) t.rotation.set(Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11));
  else t.rotation.set(Math.atan2(m32, m22), ey, 0);
}
