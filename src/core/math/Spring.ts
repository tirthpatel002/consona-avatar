import { Vector2D, type IVector2D } from './Vector2D.ts';

/**
 * THE spring implementation of core (scene-graph avatars and body avatars).
 * One semi-implicit-Euler, sub-stepped integrator (`integrateSpring`) over N
 * dimensions, configured by a `SpringModel`:
 *  - `damping: 'ratio'`       — damping is a ratio ζ (c = 2ζ√k); `SpringParams`, `Spring`, `stepSpring`.
 *  - `damping: 'coefficient'` — damping is an absolute coefficient c with mass; `SpringConfig`, `Spring1D`, `Spring2D`.
 * `VectorSpring` is the N-dimensional class; the others are typed facades over it / the kernel.
 */

/**
 * Spring physics configuration for natural, organic motion.
 */
export interface SpringConfig {
  stiffness: number; // Spring stiffness (k), e.g. 150 - 300
  damping: number;   // Damping coefficient c (absolute), e.g. 15 - 30
  mass?: number;     // Mass (m), default 1.0
  precision?: number;// Threshold below which motion is considered settled
}

export const DEFAULT_GAZE_SPRING: SpringConfig = {
  stiffness: 110,
  damping: 22,
  mass: 1.0,
  precision: 0.0005,
};

export const LIQUID_SPRING: SpringConfig = {
  stiffness: 95,
  damping: 20,
  mass: 1.0,
  precision: 0.0005,
};

export const JELLY_SPRING: SpringConfig = {
  stiffness: 150,
  damping: 18,
  mass: 1.05,
  precision: 0.0005,
};

export const ORGANIC_BOUNCE_SPRING: SpringConfig = {
  stiffness: 180,
  damping: 20,
  mass: 1.0,
  precision: 0.0005,
};

export const SNAPPY_SPRING: SpringConfig = {
  stiffness: 260,
  damping: 30,
  mass: 1.0,
  precision: 0.0005,
};

export const GENTLE_SPRING: SpringConfig = {
  stiffness: 90,
  damping: 19,
  mass: 1.0,
  precision: 0.0005,
};

export interface SpringParams {
  /** Stiffness k (1/s²). */
  stiffness: number;
  /** Damping ratio ζ (1 = critically damped, < 1 = bouncy). */
  damping: number;
}

/**
 * Shared spring presets for avatar prop / colour transitions.
 * ζ < 1 → soft overshoot then settle (water-balloon / jelly), without the
 * wild wobble of body secondary motion (`DEFAULT_JELLY.damping ≈ 0.18`).
 * Gaze and blink keep their own faster springs elsewhere.
 */
/** Scalar props (scale, surface params, eye layout, pupil amount…). Soft jelly settle. */
export const PROP_SPRING: SpringParams = { stiffness: 95, damping: 0.62 };
/** OKLab colour channels — a touch softer / slower than scalars. */
export const COLOR_SPRING: SpringParams = { stiffness: 72, damping: 0.68 };
/** Slow fades (e.g. shell / layer counts). */
export const SLOW_PROP_SPRING: SpringParams = { stiffness: 48, damping: 0.72 };
/** Accessory pop-in / scale punches. */
export const POP_SPRING: SpringParams = { stiffness: 210, damping: 0.55 };

export interface SpringState {
  x: number;
  v: number;
}


/** How a spring integrates (see `integrateSpring`). */
export interface SpringModel {
  stiffness: number;
  /** ζ (mode 'ratio') or absolute coefficient c (mode 'coefficient'). */
  damping: number;
  mode: 'ratio' | 'coefficient';
  /** Default 1. */
  mass?: number;
  /** dt is clamped to this per update. */
  maxDt: number;
  /** Maximum sub-step (s). */
  subStep: number;
  /** When set: snap to the target once |Δx| and |v| are below it. */
  snapPrecision?: number;
}

/** Physical model used by `Spring1D` / `Spring2D` (`SpringConfig`). */
export function coefficientModel(cfg: SpringConfig): SpringModel {
  return { stiffness: cfg.stiffness, damping: cfg.damping, mode: 'coefficient', mass: cfg.mass ?? 1.0, maxDt: 0.064, subStep: 0.002, snapPrecision: cfg.precision ?? 0.0005 };
}

/** Ratio model used by `Spring` / `stepSpring` (`SpringParams`). */
export function ratioModel(p: SpringParams): SpringModel {
  return { stiffness: p.stiffness, damping: p.damping, mode: 'ratio', maxDt: 0.1, subStep: 1 / 240 };
}

/**
 * Advance spring state in place: `x`, `v`, `target` are same-length arrays;
 * `force` is an extra acceleration per dimension (or one for all).
 */
export function integrateSpring(x: number[], v: number[], target: ArrayLike<number>, m: SpringModel, dt: number, force: number | ArrayLike<number> = 0): void {
  const T = Math.min(dt, m.maxDt);
  if (!(T > 0)) return;
  const k = m.stiffness;
  const c = m.mode === 'ratio' ? 2 * m.damping * Math.sqrt(k) : m.damping;
  const invMass = 1 / (m.mass ?? 1);
  const n = Math.max(1, Math.ceil(T / m.subStep));
  const h = T / n;
  const ratio = m.mode === 'ratio';
  const dims = x.length;
  for (let d = 0; d < dims; d++) {
    const f = typeof force === 'number' ? force : (force[d] ?? 0);
    const t = target[d]!;
    let xd = x[d]!;
    let vd = v[d]!;
    for (let i = 0; i < n; i++) {
      // identical operation order to the former per-class solvers
      const a = ratio ? -k * (xd - t) - c * vd + f : f ? (-k * (xd - t) + -c * vd + f) * invMass : (-k * (xd - t) + -c * vd) * invMass;
      vd += a * h;
      xd += vd * h;
    }
    x[d] = xd;
    v[d] = vd;
  }
  if (m.snapPrecision !== undefined) {
    let dx2 = 0;
    let v2 = 0;
    for (let d = 0; d < dims; d++) {
      const e = x[d]! - target[d]!;
      dx2 += e * e;
      v2 += v[d]! * v[d]!;
    }
    const dist = dims === 1 ? Math.abs(x[0]! - target[0]!) : Math.sqrt(dx2);
    const speed = dims === 1 ? Math.abs(v[0]!) : Math.sqrt(v2);
    if (dist < m.snapPrecision && speed < m.snapPrecision) {
      for (let d = 0; d < dims; d++) {
        x[d] = target[d]!;
        v[d] = 0;
      }
    }
  }
}

/** N-dimensional spring (position, velocity, movable target). */
export class VectorSpring {
  readonly x: number[];
  readonly v: number[];
  readonly target: number[];
  model: SpringModel;
  constructor(initial: number[], model: SpringModel) {
    this.x = [...initial];
    this.v = initial.map(() => 0);
    this.target = [...initial];
    this.model = model;
  }
  setTarget(t: ArrayLike<number>): this {
    for (let d = 0; d < this.target.length; d++) this.target[d] = t[d]!;
    return this;
  }
  snap(p: ArrayLike<number>): this {
    for (let d = 0; d < this.x.length; d++) {
      this.x[d] = this.target[d] = p[d]!;
      this.v[d] = 0;
    }
    return this;
  }
  update(dt: number, force: number | ArrayLike<number> = 0): number[] {
    integrateSpring(this.x, this.v, this.target, this.model, dt, force);
    return this.x;
  }
  isSettled(precision = this.model.snapPrecision ?? 1e-4): boolean {
    let dx2 = 0;
    let v2 = 0;
    for (let d = 0; d < this.x.length; d++) {
      const e = this.x[d]! - this.target[d]!;
      dx2 += e * e;
      v2 += this.v[d]! * this.v[d]!;
    }
    return Math.sqrt(dx2) < precision && Math.sqrt(v2) < precision;
  }
}

const sx = [0];
const sv = [0];
const st = [0];
/** Scratch ratio model for `stepSpring` (rewritten per call: no per-step allocation). */
const sm: SpringModel = ratioModel({ stiffness: 0, damping: 0 });

/**
 * Advance a damped (ratio) spring toward `target` by `dt` seconds (semi-implicit
 * Euler, sub-stepped so it is stable at low frame rates). `force` is an extra
 * external acceleration applied over the step (inertia, pokes, idle jiggle).
 */
export function stepSpring(s: SpringState, target: number, p: SpringParams, dt: number, force = 0): SpringState {
  if (!(dt > 0)) return s;
  sx[0] = s.x;
  sv[0] = s.v;
  st[0] = target;
  sm.stiffness = p.stiffness;
  sm.damping = p.damping;
  integrateSpring(sx, sv, st, sm, dt, force);
  s.x = sx[0]!;
  s.v = sv[0]!;
  return s;
}

/** A scalar (ratio) spring with a movable target — the building block for tweens. */
export class Spring implements SpringState {
  x: number;
  v = 0;
  target: number;
  params: SpringParams;
  constructor(value: number, params: SpringParams = PROP_SPRING) {
    this.params = params;
    this.x = value;
    this.target = value;
  }
  set(target: number): this {
    this.target = target;
    return this;
  }
  /** Jump to a value with no motion. */
  snap(value: number): this {
    this.x = this.target = value;
    this.v = 0;
    return this;
  }
  impulse(dv: number): this {
    this.v += dv;
    return this;
  }
  update(dt: number, force = 0): number {
    stepSpring(this, this.target, this.params, dt, force);
    return this.x;
  }
  /** True when (practically) at rest on the target. */
  get settled(): boolean {
    return Math.abs(this.x - this.target) < 1e-4 && Math.abs(this.v) < 1e-3;
  }
}

/** 2D (coefficient) spring — Vector2D API over `VectorSpring`. */
export class Spring2D {
  private readonly s: VectorSpring;
  private readonly current: Vector2D;
  private readonly velocity: Vector2D;
  private config: Required<SpringConfig>;

  constructor(xOrPos: number | IVector2D = 0, yOrConfig: number | SpringConfig = 0, optionalConfig?: SpringConfig) {
    let initialX = 0;
    let initialY = 0;
    let cfg: SpringConfig = DEFAULT_GAZE_SPRING;
    if (typeof xOrPos === 'object' && xOrPos !== null) {
      initialX = xOrPos.x;
      initialY = xOrPos.y;
      if (typeof yOrConfig === 'object') cfg = yOrConfig as SpringConfig;
    } else if (typeof xOrPos === 'number') {
      initialX = xOrPos;
      if (typeof yOrConfig === 'number') {
        initialY = yOrConfig;
        if (optionalConfig) cfg = optionalConfig;
      } else if (typeof yOrConfig === 'object') {
        cfg = yOrConfig as SpringConfig;
      }
    }
    this.config = {
      stiffness: cfg.stiffness ?? DEFAULT_GAZE_SPRING.stiffness,
      damping: cfg.damping ?? DEFAULT_GAZE_SPRING.damping,
      mass: cfg.mass ?? 1.0,
      precision: cfg.precision ?? 0.0005,
    };
    this.s = new VectorSpring([initialX, initialY], coefficientModel(this.config));
    this.current = Vector2D.create(initialX, initialY);
    this.velocity = Vector2D.zero();
  }

  private sync(): Vector2D {
    this.current.set(this.s.x[0]!, this.s.x[1]!);
    this.velocity.set(this.s.v[0]!, this.s.v[1]!);
    return this.current;
  }

  get x(): number {
    return this.s.x[0]!;
  }

  get y(): number {
    return this.s.x[1]!;
  }

  setTarget(targetOrX: number | IVector2D, targetY?: number): void {
    if (typeof targetOrX === 'object' && targetOrX !== null) this.s.setTarget([targetOrX.x, targetOrX.y]);
    else if (typeof targetOrX === 'number') this.s.setTarget([targetOrX, targetY ?? targetOrX]);
  }

  snapTo(positionOrX: number | IVector2D = 0, targetY?: number): void {
    if (typeof positionOrX === 'object' && positionOrX !== null) this.s.snap([positionOrX.x, positionOrX.y]);
    else if (typeof positionOrX === 'number') this.s.snap([positionOrX, targetY ?? positionOrX]);
    this.sync();
  }

  reset(positionOrX: number | IVector2D = 0, targetY?: number): void {
    this.snapTo(positionOrX, targetY);
  }

  getPosition(): Vector2D {
    return this.current;
  }

  getVelocity(): Vector2D {
    return this.velocity;
  }

  isSettled(): boolean {
    return this.s.isSettled(this.config.precision);
  }

  /** Advances the simulation by deltaTime seconds (sub-stepped). */
  update(deltaTimeSeconds: number): Vector2D {
    if (!(Math.min(deltaTimeSeconds, 0.064) > 0)) return this.current;
    this.s.update(deltaTimeSeconds);
    return this.sync();
  }

  step(deltaTimeSeconds: number): Vector2D {
    return this.update(deltaTimeSeconds);
  }
}

/** 1D (coefficient) spring for scalar channels (openness, roundness, smile…) over `VectorSpring`. */
export class Spring1D {
  private readonly s: VectorSpring;
  public config: Required<SpringConfig>;

  constructor(initialValue: number = 0, config: SpringConfig = DEFAULT_GAZE_SPRING) {
    this.config = {
      stiffness: config.stiffness,
      damping: config.damping,
      mass: config.mass ?? 1.0,
      precision: config.precision ?? 0.0005,
    };
    this.s = new VectorSpring([initialValue], coefficientModel(this.config));
    this.mk = [this.config.stiffness, this.config.damping, this.config.mass];
  }

  private mk: [number, number, number];

  get current(): number {
    return this.s.x[0]!;
  }
  set current(v: number) {
    this.s.x[0] = v;
  }
  get velocity(): number {
    return this.s.v[0]!;
  }
  set velocity(v: number) {
    this.s.v[0] = v;
  }
  get target(): number {
    return this.s.target[0]!;
  }
  set target(v: number) {
    this.s.target[0] = v;
  }

  setTarget(target: number): void {
    this.s.target[0] = target;
  }

  snapTo(value: number): void {
    this.s.snap([value]);
  }

  isSettled(): boolean {
    return Math.abs(this.current - this.target) < this.config.precision && Math.abs(this.velocity) < this.config.precision;
  }

  update(deltaTimeSeconds: number): number {
    // `config` is public and mutable: rebuild the model only when it changed (no per-frame allocation)
    const c = this.config;
    if (c.stiffness !== this.mk[0] || c.damping !== this.mk[1] || c.mass !== this.mk[2]) {
      this.mk = [c.stiffness, c.damping, c.mass];
      this.s.model = coefficientModel(c);
    }
    this.s.update(deltaTimeSeconds);
    return this.current;
  }
}
