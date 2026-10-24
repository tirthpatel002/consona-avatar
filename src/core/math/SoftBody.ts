import { hypot2 } from './hypot.ts';
import type { AvatarJellyOptions, Vec3Like } from '../types/AvatarDefinition.ts';
import { DEFAULT_JELLY } from '../define/resolveAvatar.ts';
import { Spring, stepSpring } from './Spring.ts';
import { clamp } from './Interpolation.ts';
import type { SpringState } from './Spring.ts';

/**
 * Soft-body "water balloon" jiggle (renderer-agnostic).
 *
 * A few damped springs (sway x/z, volume-preserving squash, poke dent) driven
 * by the avatar's own motion (world acceleration of the body, spin, behavior
 * squash, pokes) plus a gentle idle force. Renderers map `state` onto their
 * deformation (the Three adapter feeds shader uniforms, `rig/parts/jelly.ts`).
 */
export interface SoftBodyInput {
  dt: number;
  time: number;
  /** World position of the body centre this frame. */
  center: Vec3Like;
  /** World position of the body base (squash pivot). */
  base: Vec3Like;
  /** World body height. */
  height: number;
  /** Body yaw (for spin bulge). */
  yaw: number;
  /** Behavior squash (body.scale.y). */
  behaviorScaleY: number;
}

export interface SoftBodyState {
  base: { x: number; y: number; z: number };
  height: number;
  /** Top offset (scaled by h² along the body). */
  sway: { x: number; y: number; z: number };
  /** Vertical scale (xz get 1/sqrt). */
  squash: number;
  /** Poke point (xyz) + dent depth (w). */
  poke: { x: number; y: number; z: number; w: number };
  pokeRadius: number;
}


export class SoftBody {
  readonly state: SoftBodyState = {
    base: { x: 0, y: 0, z: 0 },
    height: 1.5,
    sway: { x: 0, y: 0, z: 0 },
    squash: 1,
    poke: { x: 0, y: 0, z: 0, w: 0 },
    pokeRadius: 0.6,
  };
  opts: Required<AvatarJellyOptions> | false;
  private readonly sx: SpringState = { x: 0, v: 0 };
  private readonly sz: SpringState = { x: 0, v: 0 };
  private readonly sq: SpringState = { x: 0, v: 0 }; // squash offset (s = 1 + x)
  private readonly poke = new Spring(0);
  private prevC: { x: number; y: number; z: number } | null = null;
  private readonly prevV = { x: 0, y: 0, z: 0 };
  private prevYaw = 0;
  private prevYawV = 0;
  private prevSY = 1;
  private prevSYV = 0;
  private warm = 0;

  private readonly defaults: Required<AvatarJellyOptions>;

  constructor(opts: AvatarJellyOptions | false = {}, defaults: Required<AvatarJellyOptions> = DEFAULT_JELLY) {
    this.defaults = defaults;
    this.opts = opts === false ? false : { ...defaults, ...opts };
  }

  setOptions(opts: AvatarJellyOptions | false): void {
    this.opts = opts === false ? false : { ...this.defaults, ...opts };
  }

  /** Reset motion history (e.g. after teleporting) without killing the wobble. */
  resetHistory(): void {
    this.prevC = null;
    this.warm = 0;
  }

  /** Poke at a world point: dent + sway away from the hit. */
  pokeAt(point: Vec3Like, strength = 1): void {
    if (!this.opts) return;
    const o = this.opts;
    const s = this.state;
    s.poke.x = point.x, s.poke.y = point.y, s.poke.z = point.z;
    this.poke.impulse(5 * o.poke * strength);
    const dx = point.x - s.base.x;
    const dz = point.z - s.base.z;
    const l = hypot2(dx, dz) || 1;
    // push the top away from the hit; front hits mostly squash
    this.sx.v -= (dx / l) * 3.2 * o.poke * strength;
    this.sz.v -= (dz / l) * 1.8 * o.poke * strength;
    this.sq.v -= 1.6 * o.poke * strength;
  }

  /** Add a squash/stretch kick (e.g. on rig swap). Negative = squash. */
  kick(squash: number, sway = 0): void {
    this.sq.v += squash;
    this.sx.v += sway;
  }

  update(i: SoftBodyInput): SoftBodyState {
    const s = this.state;
    s.base.x = i.base.x, s.base.y = i.base.y, s.base.z = i.base.z;
    s.height = Math.max(0.2, i.height);
    s.pokeRadius = 0.38 * i.height;
    const o = this.opts;
    if (!o || o.amount <= 0) {
      s.sway.x = s.sway.y = s.sway.z = 0;
      s.squash = 1;
      s.poke.w = 0;
      return s;
    }
    const dt = Math.max(1e-4, Math.min(i.dt, 0.05));
    const idt = 1 / dt;
    // world acceleration of the body centre (finite differences, clamped against teleports)
    let ax = 0, ay = 0, az = 0;
    if (this.prevC) {
      const vx = (i.center.x - this.prevC.x) * idt, vy = (i.center.y - this.prevC.y) * idt, vz = (i.center.z - this.prevC.z) * idt;
      if (this.warm > 1) ax = (vx - this.prevV.x) * idt, ay = (vy - this.prevV.y) * idt, az = (vz - this.prevV.z) * idt;
      this.prevV.x = vx, this.prevV.y = vy, this.prevV.z = vz;
      this.warm++;
    }
    this.prevC = this.prevC ?? { x: 0, y: 0, z: 0 };
    this.prevC.x = i.center.x, this.prevC.y = i.center.y, this.prevC.z = i.center.z;
    {
      const l = Math.sqrt(ax * ax + ay * ay + az * az);
      const d = 1 / (l || 1);
      const m = clamp(l, 0, 80);
      ax = ax * d * m, ay = ay * d * m, az = az * d * m;
    }
    let yawV = (i.yaw - this.prevYaw) / dt;
    if (Math.abs(yawV) > 60) yawV = this.prevYawV;
    this.prevYaw = i.yaw;
    const yawA = (yawV - this.prevYawV) / dt;
    this.prevYawV = yawV;
    const syV = (i.behaviorScaleY - this.prevSY) / dt;
    const syA = clamp((syV - this.prevSYV) / dt, -400, 400);
    this.prevSY = i.behaviorScaleY;
    this.prevSYV = syV;

    const p = { stiffness: o.stiffness, damping: o.damping };
    const t = i.time;
    const idle = o.idle;
    const A = o.amount;
    const H = s.height;
    // inertia: the top lags behind the body's acceleration
    const fx = -ax * 0.08 * A + idle * A * 0.35 * Math.sin(t * 1.9) + clamp(yawA, -60, 60) * 0.004 * A;
    const fz = -az * 0.08 * A + idle * A * 0.25 * Math.sin(t * 1.37 + 1.1);
    // vertical accel (launch / landing) squashes; behavior squash rate overshoots; spin flattens a bit
    const fq = -ay * 0.02 * A + syA * 0.0025 * A + idle * A * 0.12 * Math.sin(t * 2.6) - Math.min(yawV * yawV, 150) * 0.0006 * A;
    stepSpring(this.sx, 0, p, dt, fx);
    stepSpring(this.sz, 0, p, dt, fz);
    stepSpring(this.sq, 0, { stiffness: p.stiffness * 1.6, damping: p.damping }, dt, fq);
    this.poke.params = { stiffness: p.stiffness * 2.2, damping: Math.max(0.12, p.damping) };
    this.poke.update(dt);
    // keep it a wobble, not a melt
    this.sx.x = clamp(this.sx.x, -0.35, 0.35);
    this.sz.x = clamp(this.sz.x, -0.35, 0.35);
    this.sq.x = clamp(this.sq.x, -0.3, 0.3);
    s.sway.x = this.sx.x * H * 0.35, s.sway.y = 0, s.sway.z = this.sz.x * H * 0.35;
    s.squash = 1 + this.sq.x;
    s.poke.w = clamp(this.poke.x, -0.6, 0.6) * H * 0.5;
    return s;
  }
}
