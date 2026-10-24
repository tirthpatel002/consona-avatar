import { hypot2 } from '../math/hypot.ts';
import { Spring2D, Spring1D, type SpringConfig } from '../math/Spring.ts';
import { Vector2D } from '../math/Vector2D.ts';
import { clamp } from '../math/Interpolation.ts';
import type { IAvatarController } from './IAvatarController.ts';
import type { AvatarInstance } from '../engine/AvatarInstance.ts';
import type { UpdateContext } from '../types/Lifecycle.ts';
import { PointerObserver } from './PointerObserver.ts';

/**
 * THE gaze controller of core, shared by every family. Two modes (config):
 *
 *  - `mode: 'eyes'` (scene-graph avatars, e.g. Consona): pointer → one spring →
 *    eye node gaze channels + head-group yaw/pitch/roll (+ optional squash),
 *    via `bindings`. Runs as an `IAvatarController` (`update(ctx)`).
 *  - `mode: 'body'` (body avatars, e.g. Allie): eyes are embedded in the body,
 *    so gaze moves the WHOLE body (`solve(input)` → body angles), see below.
 *
 * Body mode: gaze moves only the WHOLE body: it turns (yaw), tilts (pitch) and
 * leans (roll). Two spring layers share the turn so it still reads lively:
 *
 *   lead (fast, slight overshoot) + body (slow, more overshoot), both past a small dead zone
 *
 * Renderer-agnostic: a normalized target (x right, y up, -1..1 ≈ the range)
 * becomes body angles. With no target it drifts back to neutral and wanders
 * with ballistic saccades; a still pointer slowly loses attention. Behaviors
 * blend the gaze out (`weight`), e.g. 0 during a spin.
 */

export interface AvatarGazeOptions {
  /** Master switch (default true). */
  enabled?: boolean;
  /** Track the pointer (default true). `lookAt()` targets work either way. */
  followPointer?: boolean;
  /** Overall gaze strength 0..1.5 (default 1). */
  strength?: number;
  /** Body turn / tilt / lean limits in radians (default 0.82 / 0.46 / 0.2). */
  bodyYaw?: number;
  bodyPitch?: number;
  bodyRoll?: number;
  /** Share of the turn taken by the fast lead layer, 0..1 (default 0.4). */
  lead?: number;
  /** Dead zone (fraction of the range; default 0.02): smaller looks keep the body still. */
  deadZone?: number;
  /** Spring stiffness multiplier for all layers (default 1.45). */
  stiffness?: number;
  /** Idle wander + saccades when there is no target (default true). */
  idle?: boolean;
  /** Wander amplitude 0..1 (default 0.35). */
  idleAmount?: number;
  /**
   * Response gain (default 1.6): small/medium pointer offsets map to larger
   * turns, softly saturating (tanh) at the limits so it never over-rotates.
   * 1 ≈ linear.
   */
  gain?: number;
  /** Seconds a still pointer holds full attention (default 6). */
  attentionSpan?: number;
}

export const DEFAULT_GAZE: Required<AvatarGazeOptions> = {
  enabled: true,
  followPointer: true,
  strength: 1,
  bodyYaw: 0.82,
  bodyPitch: 0.46,
  bodyRoll: 0.2,
  lead: 0.4,
  deadZone: 0.02,
  stiffness: 1.45,
  idle: true,
  idleAmount: 0.35,
  gain: 1.6,
  attentionSpan: 6,
};

/** Spring tuning per layer (ζ < 1: natural overshoot; the slower layer lags more). */
export const GAZE_LAYER_SPRINGS = {
  lead: { stiffness: 95, damping: 11 }, // ζ ≈ 0.56
  body: { stiffness: 40, damping: 6.6 }, // ζ ≈ 0.52
} as const;

export interface GazeOutput {
  /** Body rotation (radians, three.js convention: yaw +y, pitch +x = nod down, roll +z). */
  body: { yaw: number; pitch: number; roll: number };
  /** Current normalized layer positions (for tests / debugging). */
  layers: { lead: { x: number; y: number }; body: { x: number; y: number } };
  /** Attention 0..1. */
  attention: number;
  /** True while idling (no target). */
  idling: boolean;
}

export interface GazeInput {
  dt: number;
  /** Normalized target, or null for none. */
  target: { x: number; y: number } | null;
  /** True when the target moved this frame (resets attention). */
  moved?: boolean;
  /** Body participation 0..1 (behaviors blend the gaze out). */
  weight?: number;
}


/** Clamp a vector to the unit disc (radial limit, keeps direction). */
export function clampToDisc(x: number, y: number, r = 1): { x: number; y: number } {
  const m = hypot2(x, y);
  return m > r ? { x: (x / m) * r, y: (y / m) * r } : { x, y };
}

/** Radial soft dead zone: 0 inside `dz`, then ramps to the full value at the rim. */
export function deadZone(x: number, y: number, dz: number): { x: number; y: number } {
  const m = hypot2(x, y);
  if (m <= dz || m === 0) return { x: 0, y: 0 };
  const ramp = m <= 1 ? (m - dz) / Math.max(1e-6, 1 - dz) : m;
  return { x: (x * ramp) / m, y: (y * ramp) / m };
}

/**
 * Radial response curve: magnitude m → tanh(gain·m)/tanh(gain) (≈ linear for
 * gain → 1, steeper near the centre for larger gains), always within the unit
 * disc and reaching exactly 1 at the rim. Direction is kept.
 */
export function responseCurve(x: number, y: number, gain = 1): { x: number; y: number } {
  const c = clampToDisc(x, y, 1);
  const m = hypot2(c.x, c.y);
  if (m === 0 || gain <= 1.0001) return c;
  const r = Math.tanh(gain * m) / Math.tanh(gain);
  return { x: (c.x / m) * r, y: (c.y / m) * r };
}

/** Seeded RNG (mulberry32) so idle wander is reproducible in tests. */
export function gazeRng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LookAtBindings {
  /** Node that receives gazeX / gazeY / pointerX / pointerY */
  eyeNodeId: string;
  /** Node whose baseTransform receives yaw/pitch/roll */
  headGroupNodeId: string;
  /** Optional mesh node for squash/stretch (avatar-specific; omit to disable) */
  squashNodeId?: string;
  gazeX?: string;
  gazeY?: string;
  pointerX?: string;
  pointerY?: string;
  gazeExcursion?: string;
  scaleX?: string;
  scaleY?: string;
}

export interface LookAtControllerConfig {
  bindings: LookAtBindings;
  maxEyeGazeExcursion?: number;
  maxHeadYawRad?: number;
  maxHeadPitchRad?: number;
  springConfig?: SpringConfig;
  /** When false, skip squash/stretch even if squashNodeId is set */
  enableSquash?: boolean;
}

export type GazeMode = 'eyes' | 'body';

export type GazeControllerConfig =
  | ({ mode: 'eyes' } & LookAtControllerConfig)
  | ({ mode: 'body' } & AvatarGazeOptions);

/** One gaze controller for every family (see the module doc for the two modes). */
export class GazeController implements IAvatarController {
  readonly id = 'pointer-gaze';
  readonly mode: GazeMode;

  constructor(config: GazeControllerConfig, seed = Math.floor(Math.random() * 1e9)) {
    this.mode = config.mode;
    if (config.mode === 'eyes') {
      const { mode: _m, ...eyes } = config;
      this.options = { ...DEFAULT_GAZE };
      this.initEyes(eyes);
    } else {
      const { mode: _m, ...options } = config;
      this.options = { ...DEFAULT_GAZE, ...options };
      this.rnd = gazeRng(seed);
      this.lead = this.spring('lead');
      this.body = this.spring('body');
    }
  }

  // ======================= eyes mode (IAvatarController) =======================


  private instance?: AvatarInstance;
  private observer!: PointerObserver;
  private pointerSpring!: Spring2D;
  private bindings!: LookAtBindings;
  private maxEyeGazeExcursion!: number;
  private maxHeadYawRad!: number;
  private maxHeadPitchRad!: number;
  private enableSquash!: boolean;
  private _enabled: boolean = true;
  /** Throttled container measurement (eyes mode): re-read at most every 500 ms or when the container changes. */
  private measuredContainer: unknown = null;
  private measuredWidth = 0;
  private lastMeasure = -Infinity;

  private initEyes(config: LookAtControllerConfig): void {
    if (!config.bindings?.eyeNodeId || !config.bindings?.headGroupNodeId) {
      throw new Error('GazeController(eyes): bindings.eyeNodeId and bindings.headGroupNodeId are required');
    }
    this.bindings = {
      gazeX: 'gazeX',
      gazeY: 'gazeY',
      pointerX: 'pointerX',
      pointerY: 'pointerY',
      gazeExcursion: 'gazeExcursion',
      scaleX: 'scaleX',
      scaleY: 'scaleY',
      ...config.bindings,
    };
    this.maxEyeGazeExcursion = config.maxEyeGazeExcursion ?? 8.5;
    this.maxHeadYawRad = config.maxHeadYawRad ?? 0.44;
    this.maxHeadPitchRad = config.maxHeadPitchRad ?? 0.44;
    this.enableSquash = config.enableSquash !== false && Boolean(this.bindings.squashNodeId);

    this.observer = new PointerObserver(() => {
      const el = this.instance?.renderer?.getContainer?.();
      if (el) return el;
      return typeof window !== 'undefined' ? window : ({} as any);
    });

    this.pointerSpring = new Spring2D(
      Vector2D.zero(),
      config.springConfig ?? { stiffness: 260, damping: 24, mass: 1 }
    );
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(val: boolean) {
    if (this._enabled === val) return;
    this._enabled = val;
    if (val) {
      this.observer.start((normPos) => {
        this.pointerSpring.setTarget(normPos);
      });
    } else {
      this.observer.stop();
      this.pointerSpring.reset(Vector2D.zero());
      this.resetTargets();
    }
  }

  attach(instance: AvatarInstance): void {
    this.instance = instance;
    if (this._enabled) {
      this.observer.start((normPos) => {
        this.pointerSpring.setTarget(normPos);
      });
    }
  }

  setTargetPosition(pos: { x: number; y: number }): void {
    if (!this._enabled) return;
    this.pointerSpring.setTarget(pos);
  }

  update(context: UpdateContext): void {
    if (this.mode !== 'eyes' || !this._enabled || !this.instance) return;

    const currentNorm = this.pointerSpring.update(context.deltaTime);
    const velocity = this.pointerSpring.getVelocity();
    const b = this.bindings;

    const container = this.instance.renderer?.getContainer?.() ?? null;
    // layout read is only needed when the container (or its size) changes; measuring
    // every frame forces layout bookkeeping while the renderer writes styles
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (container !== this.measuredContainer || now - this.lastMeasure > 500) {
      this.measuredContainer = container;
      this.lastMeasure = now;
      this.measuredWidth = container?.getBoundingClientRect?.()?.width ?? 0;
    }
    const clientWidth = this.measuredWidth;
    const pixelSize =
      clientWidth && clientWidth > 0 ? clientWidth : (this.instance.pixelSize ?? 64);
    const sizeScale = Math.max(0.4, Math.min(1.0, Math.pow(Math.max(16, pixelSize) / 100, 0.45)));

    const eyeNode = this.instance.scene.find(b.eyeNodeId);
    let excursion = this.maxEyeGazeExcursion;
    if (eyeNode) {
      excursion = eyeNode.channels.get<number>(b.gazeExcursion!) ?? this.maxEyeGazeExcursion;
      const effectiveExcursion = excursion * sizeScale;
      eyeNode.channels.set(b.gazeX!, currentNorm.x * effectiveExcursion);
      eyeNode.channels.set(b.gazeY!, currentNorm.y * effectiveExcursion);
      eyeNode.channels.set(b.pointerX!, currentNorm.x * sizeScale);
      eyeNode.channels.set(b.pointerY!, currentNorm.y * sizeScale);
    }

    const excursionRatio = Math.max(0, excursion / 12.0);
    const headFactor =
      (excursionRatio <= 1.0
        ? Math.pow(excursionRatio, 1.2)
        : 1.0 + (excursionRatio - 1.0) * 0.35) * sizeScale;

    const headGroupNode = this.instance.scene.find(b.headGroupNodeId);
    if (headGroupNode) {
      headGroupNode.baseTransform.rotation[1] = currentNorm.x * this.maxHeadYawRad * headFactor;
      headGroupNode.baseTransform.rotation[0] = -currentNorm.y * this.maxHeadPitchRad * headFactor;
      const gazeRoll = -currentNorm.x * 0.16;
      const inertialRoll = (-velocity.x * 0.08 * Math.PI) / 180;
      headGroupNode.baseTransform.rotation[2] = (gazeRoll + inertialRoll) * headFactor;
      headGroupNode.baseTransform.position[0] =
        (currentNorm.x * 3.2 + velocity.x * 0.018) * headFactor;
      headGroupNode.baseTransform.position[1] =
        (currentNorm.y * 3.2 + velocity.y * 0.018) * headFactor;
      headGroupNode.markDirty();
    }

    if (this.enableSquash && b.squashNodeId) {
      const speed = Math.abs(velocity.x) + Math.abs(velocity.y);
      if (speed > 0.001) {
        const squashNode = this.instance.scene.find(b.squashNodeId);
        if (squashNode) {
          const squashX =
            1.0 + (Math.abs(velocity.x) * 0.016 - Math.abs(velocity.y) * 0.008) * headFactor;
          const squashY =
            1.0 - (Math.abs(velocity.x) * 0.01 - Math.abs(velocity.y) * 0.016) * headFactor;
          squashNode.channels.set(b.scaleX!, Math.max(0.7, Math.min(1.3, squashX)));
          squashNode.channels.set(b.scaleY!, Math.max(0.7, Math.min(1.3, squashY)));
        }
      }
    }
  }

  detach(): void {
    this.observer.stop();
    this.instance = undefined;
  }

  private resetTargets(): void {
    if (!this.instance) return;
    const b = this.bindings;
    const eyeNode = this.instance.scene.find(b.eyeNodeId);
    if (eyeNode) {
      eyeNode.channels.set(b.gazeX!, 0);
      eyeNode.channels.set(b.gazeY!, 0);
      eyeNode.channels.set(b.pointerX!, 0);
      eyeNode.channels.set(b.pointerY!, 0);
    }
    const headGroupNode = this.instance.scene.find(b.headGroupNodeId);
    if (headGroupNode) {
      headGroupNode.baseTransform.rotation = [0, 0, 0];
      headGroupNode.baseTransform.position = [0, 0, 0];
      headGroupNode.markDirty();
    }
    if (b.squashNodeId) {
      const squashNode = this.instance.scene.find(b.squashNodeId);
      if (squashNode) {
        squashNode.channels.set(b.scaleX!, 1.0);
        squashNode.channels.set(b.scaleY!, 1.0);
      }
    }
  }

  // ======================= body mode =======================

  /** Body-mode tuning. */
  options: Required<AvatarGazeOptions>;
  private lead!: Spring2D;
  private body!: Spring2D;
  private readonly weight = new Spring1D(1, { stiffness: 60, damping: 15 });
  private readonly att = new Spring1D(1, { stiffness: 6, damping: 5 });
  private still = 0;
  private noTarget = 0;
  private wanderT = 0;
  private readonly wander = { x: 0, y: 0 };
  private rnd: () => number = Math.random;
  private readonly out: GazeOutput = {
    body: { yaw: 0, pitch: 0, roll: 0 },
    layers: { lead: { x: 0, y: 0 }, body: { x: 0, y: 0 } },
    attention: 1,
    idling: true,
  };


  private spring(layer: keyof typeof GAZE_LAYER_SPRINGS, from?: Spring2D): Spring2D {
    const c = GAZE_LAYER_SPRINGS[layer];
    const k = Math.max(0.05, this.options.stiffness);
    // damping scales with sqrt(k) so the damping ratio (overshoot character) is preserved
    const s = new Spring2D(from ? { x: from.x, y: from.y } : { x: 0, y: 0 }, { stiffness: c.stiffness * k, damping: c.damping * Math.sqrt(k), precision: 1e-5 });
    if (from) s.setTarget(from.getPosition());
    return s;
  }

  setOptions(options: AvatarGazeOptions): void {
    const prevK = this.options.stiffness;
    this.options = { ...DEFAULT_GAZE, ...options };
    if (this.options.stiffness !== prevK) {
      this.lead = this.spring('lead', this.lead);
      this.body = this.spring('body', this.body);
    }
  }

  /** Body mode: advance the layered solver one frame and return body angles. */
  solve(input: GazeInput): GazeOutput {
    const o = this.options;
    const dt = Math.max(0, input.dt);
    const out = this.out;
    this.weight.setTarget(clamp(input.weight ?? 1, 0, 1));
    this.weight.update(dt);
    const target = o.enabled ? input.target : null;

    // attention: a still target slowly loses interest (wander mixes back in)
    if (target && !input.moved) this.still += dt;
    else this.still = 0;
    this.att.setTarget(target ? (this.still > o.attentionSpan ? 0.35 : 1) : 0);
    this.att.update(dt);
    const attention = clamp(this.att.current, 0, 1);

    // idle wander: ballistic fixation jumps (saccades) around the centre
    this.noTarget = target ? 0 : this.noTarget + dt;
    const wandering = o.enabled && o.idle && (!target || attention < 0.99);
    if (wandering) {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        const a = this.rnd() * Math.PI * 2;
        const r = Math.sqrt(this.rnd()) * o.idleAmount;
        // fixations return to the centre now and then
        const centre = this.rnd() < 0.3;
        this.wander.x = centre ? 0 : Math.cos(a) * r;
        this.wander.y = centre ? 0 : Math.sin(a) * r * 0.6;
        this.wanderT = 0.7 + this.rnd() * 1.8;
      }
    } else {
      this.wander.x = this.wander.y = 0;
      this.wanderT = 0.25;
    }
    let tx = 0;
    let ty = 0;
    if (target) {
      const g = responseCurve(target.x * o.strength, target.y * o.strength, o.gain);
      tx = g.x * attention + this.wander.x * (1 - attention);
      ty = g.y * attention + this.wander.y * (1 - attention);
    } else if (wandering && this.noTarget > 0.8) {
      tx = this.wander.x;
      ty = this.wander.y;
    }
    // both layers only respond beyond the dead zone
    const b = deadZone(tx, ty, o.deadZone);
    this.lead.setTarget(b.x, b.y);
    this.body.setTarget(b.x, b.y);
    const lp = this.lead.update(dt);
    const bp = this.body.update(dt);
    const w = clamp(this.weight.current, 0, 1);
    const lv = this.lead.getVelocity();
    const ls = clamp(o.lead, 0, 1);
    const x = lp.x * ls + bp.x * (1 - ls);
    const y = lp.y * ls + bp.y * (1 - ls);
    out.body.yaw = x * o.bodyYaw * w;
    out.body.pitch = -y * o.bodyPitch * w;
    // lean toward the side + a little inertial roll from the lead's turn velocity
    out.body.roll = (-x * o.bodyRoll - lv.x * 0.012) * w;
    out.layers.lead.x = lp.x;
    out.layers.lead.y = lp.y;
    out.layers.body.x = bp.x;
    out.layers.body.y = bp.y;
    out.attention = attention;
    out.idling = !target;
    return out;
  }

  /** Snap every layer to neutral. */
  reset(): void {
    for (const s of [this.lead, this.body]) s.reset({ x: 0, y: 0 });
  }
}

/**
 * Normalized gaze target for a world-space direction from the eyes toward a
 * point (any frame where +z faces out of the avatar and +y is up): yaw/pitch
 * angles divided by the reference range (default ±45° / ±36°).
 */
export function gazeTargetFromDirection(dx: number, dy: number, dz: number, yawRange = Math.PI / 4, pitchRange = Math.PI / 5): { x: number; y: number } {
  const yaw = Math.atan2(dx, Math.max(1e-4, dz));
  const pitch = Math.atan2(dy, Math.max(1e-4, hypot2(dx, dz)));
  return { x: clamp(yaw / yawRange, -1.5, 1.5), y: clamp(pitch / pitchRange, -1.5, 1.5) };
}

/**
 * Idle orbital gaze path (normalized), with micro tremor — used by scene-graph
 * idle animations (e.g. Consona's look-around).
 * @param t Elapsed time in seconds
 * @param frequency Angular velocity in rad/s
 * @param radiusX Horizontal excursion amplitude
 * @param radiusY Vertical excursion amplitude
 */
export function evaluateOrbitalGaze(t: number, frequency: number = 2.5, radiusX: number = 0.75, radiusY: number = 0.55): Vector2D {
  const angle = t * frequency;
  const microTremorX = Math.sin(angle * 2.3) * 0.04;
  const microTremorY = Math.cos(angle * 1.9) * 0.03;
  return Vector2D.create(Math.cos(angle) * radiusX + microTremorX, Math.sin(angle) * radiusY + microTremorY);
}

