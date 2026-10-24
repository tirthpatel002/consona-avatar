import { ScopedRegistry } from '../registry/ScopedRegistry.ts';
import type { AvatarAnchorName } from '../atom/atom.ts';

/**
 * Channels: THE persistent dynamic primitive. A channel is a typed, eased
 * value that holds until changed: `valence` and `energy` in every avatar,
 * plus any channel a family or plugin declares (a posture level, a measured rhythm…).
 *
 *  - `level`: a number in [min, max] that eases (critically damped, no
 *    overshoot, continuous when retargeted) toward its target over `settle` s.
 *  - `rhythm`: a periodic signal: its target is a RATE (cycles per minute);
 *    the phase is integrated (a changing rate never jumps the beat), the rate
 *    glides over `settle` s, and `value` is `envelope(phase)` × a fade
 *    (shown while it has a rate, fading out over `fade` s when cleared).
 *
 * Targets are layered: a preset's target < `set()` < a running behavior's
 * (`AvatarBehaviorDefinition.channels`). For a rhythm a `set()` rate is a
 * measurement and wins over the behavior's fallback rate.
 *
 * A channel may carry an EXPRESSION applied by the resolver at weight
 * `clamp(value, 0, 1)` (a signed level, min < 0 like `valence`: `clamp(value, −1, 1)`,
 * its pose / sway / params / gaze / blink mirrored below 0; eye pose, mouth,
 * atoms, limb tone and tint only above 0): a relative pose (+ slow sway), an eye pose and mouth
 * (used when the behavior shows none), limb tone, gaze / blink multipliers and
 * atoms shown at an anchor. Channels are indexed into fixed slots when the
 * avatar is created / a plugin is attached; per frame everything is indexed,
 * nothing allocates, and settled channels cost one branch.
 */
export type ChannelKind = 'level' | 'rhythm';

export interface ChannelAtomSpec {
  id: string;
  /** Attach point (default: the atom's own). */
  anchor?: AvatarAnchorName;
  offset?: readonly [number, number, number];
  rotate?: readonly [number, number, number];
}

export interface ChannelExpression {
  /** Relative pose at full weight: root y, body scale (×), body / head rotation (XYZ Euler radians). */
  pose?: { y?: number; scale?: number | readonly [number, number, number]; body?: readonly [number, number, number]; head?: readonly [number, number, number] };
  /** Slow sway on top (radians about body X / Z, period s). */
  sway?: { period: number; pitch?: number; roll?: number };
  /** Eye pose overlaid (relative) when the behavior shows none. */
  eyes?: { pose: string; weight?: number };
  /** Mouth shape when the behavior shows none (above half weight). */
  mouth?: string;
  /** Limb tone: calm 1 = still, slack 1 = limp. */
  limbs?: { calm?: number; slack?: number };
  /** Gaze participation multiplier at full weight (default 1). */
  gaze?: number;
  /** Blink rate multiplier at full weight (default 1). */
  blinkRate?: number;
  /** Atoms shown at the channel's weight. */
  atoms?: readonly ChannelAtomSpec[];
  /**
   * Numeric config params at full weight (e.g. `{ 'plush.clumping': 0.6 }`): the runtime moves each from
   * the definition's value toward it by the channel's weight, through the live definition like preset
   * targets (written only while the weight moves; paths the renderer can't change live are skipped).
   */
  params?: Readonly<Record<string, number>>;
  /** Body colour at full weight (after the valence tint, OKLab): lean toward `color` by `amount`, chroma × `saturation`, lightness + `lift`. */
  tint?: ChannelTint;
}

export interface ChannelTint {
  /** sRGB hex. */
  color: string;
  /** 0..1 (default 0.25). */
  amount?: number;
  /** Chroma multiplier (default 1). */
  saturation?: number;
  /** Lightness offset (default 0). */
  lift?: number;
}

export interface ChannelSpec extends ChannelExpression {
  id: string;
  label?: string;
  description?: string;
  /** Default 'level'. */
  kind?: ChannelKind;
  /** Level range (default 0..1) / rhythm rate range (default 1..600 per minute). */
  min?: number;
  max?: number;
  /** Level value with no target (default 0, clamped to the range). */
  rest?: number;
  /** Level: seconds to ~99% of a new target (default 0.8; 0 = instant). Rhythm: rate glide time constant (default 1.5). */
  settle?: number;
  /** Rhythm: fade in / out of the signal (s, default 0.8). */
  fade?: number;
  /** Rhythm: wave at phase 0..1 (peak 1; default a smooth sine pulse). */
  envelope?: (phase: number) => number;
}

/** Core channels every avatar has (fixed slots 0 and 1). */
export const VALENCE_CHANNEL: ChannelSpec = { id: 'valence', label: 'Valence', description: 'How it feels: −1 low … +1 bright (tints colour and glow)', min: -1, max: 1, settle: 4 };
export const ENERGY_CHANNEL: ChannelSpec = { id: 'energy', label: 'Energy', description: 'Arousal: −1 drained … +1 lively', min: -1, max: 1, settle: 2 };
export const CORE_CHANNELS: readonly ChannelSpec[] = [VALENCE_CHANNEL, ENERGY_CHANNEL];
/** Ids of the core channels every avatar has. */
export type CoreChannelId = 'valence' | 'energy';
export const CHANNEL_VALENCE = 0;
export const CHANNEL_ENERGY = 1;

const registry = new ScopedRegistry<ChannelSpec>();
/** Register (or replace) a channel every avatar of `family` gets (no family = every avatar). */
export function registerChannel(spec: ChannelSpec, family?: string): void {
  registry.set(spec.id, spec, family);
}
export function listChannels(family?: string): ChannelSpec[] {
  return registry.values(family);
}

const sinePulse = (p: number) => 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** One installed channel (fixed slot). Read fields; write through the bank. */
export class ChannelSlot {
  readonly spec: ChannelSpec;
  readonly rhythm: boolean;
  readonly min: number;
  readonly max: number;
  /** Live value (level: eased value; rhythm: envelope × fade, 0..1). */
  value: number;
  /** Effective target (level value / rhythm rate; NaN = rhythm hidden). */
  target: number;
  velocity = 0;
  /** Layers (NaN = none). */
  preset = NaN;
  held = NaN;
  transient = NaN;
  /** Rhythm state: live rate (per minute), phase 0..1, completed cycles, fade 0..1. */
  rate = 0;
  phase = 0;
  cycles = 0;
  visibility = 0;
  /** Bumped whenever `value` changed. */
  revision = 0;
  readonly omega: number;
  readonly envelope: (phase: number) => number;

  constructor(spec: ChannelSpec) {
    this.spec = spec;
    this.rhythm = spec.kind === 'rhythm';
    this.min = spec.min ?? (this.rhythm ? 1 : 0);
    this.max = spec.max ?? (this.rhythm ? 600 : 1);
    const settle = spec.settle ?? (this.rhythm ? 1.5 : 0.8);
    this.omega = this.rhythm ? Math.max(0.01, settle) : settle > 0 ? 6.6 / Math.max(0.05, settle) : Infinity;
    this.envelope = spec.envelope ?? sinePulse;
    this.value = this.rhythm ? 0 : clamp(spec.rest ?? 0, this.min, this.max);
    this.target = this.rhythm ? NaN : this.value;
  }

  /** Recompute the effective target from the layers. */
  retarget(): void {
    const t = this.rhythm
      ? !Number.isNaN(this.held) ? this.held : !Number.isNaN(this.transient) ? this.transient : this.preset
      : !Number.isNaN(this.transient) ? this.transient : !Number.isNaN(this.held) ? this.held : !Number.isNaN(this.preset) ? this.preset : (this.spec.rest ?? 0);
    this.target = Number.isNaN(t) ? NaN : clamp(t, this.min, this.max);
    // a rhythm that starts showing starts at its rate (no glide from a stale one)
    if (this.rhythm && !Number.isNaN(this.target) && this.visibility === 0) this.rate = this.target;
  }

  /** True while it changes (or a rhythm shows). */
  get moving(): boolean {
    return this.rhythm ? this.visibility > 0 || !Number.isNaN(this.target) : this.value !== this.target || this.velocity !== 0;
  }

  /** Advance; true when `value` changed. */
  step(dt: number): boolean {
    if (!this.moving || dt <= 0) return false;
    if (this.rhythm) {
      const target = this.target, shown = !Number.isNaN(target);
      if (shown) this.rate += (target - this.rate) * (1 - Math.exp(-dt / this.omega));
      const fade = this.spec.fade ?? 0.8;
      const vis = shown ? Math.min(1, this.visibility + dt / fade) : Math.max(0, this.visibility - dt / fade);
      this.visibility = vis;
      const p = this.phase + (dt * this.rate) / 60;
      const wraps = Math.floor(p);
      this.cycles += wraps;
      this.phase = p - wraps;
      const v = vis > 0 ? this.envelope(this.phase) * vis * vis * (3 - 2 * vis) : 0;
      if (v === this.value) return false;
      this.value = v;
      this.revision++;
      return true;
    }
    const w = this.omega;
    if (w === Infinity) {
      this.value = this.target;
      this.velocity = 0;
    } else {
      // exact critically damped step (stable for any dt)
      const x0 = this.value - this.target, v0 = this.velocity;
      const e = Math.exp(-w * dt);
      const x = (x0 + (v0 + w * x0) * dt) * e;
      const v = (v0 - w * (v0 + w * x0) * dt) * e;
      if (Math.abs(x) < 1e-4 && Math.abs(v) < 1e-4) {
        this.value = this.target;
        this.velocity = 0;
      } else {
        this.value = this.target + x;
        this.velocity = v;
      }
    }
    this.revision++;
    return true;
  }

  /** Jump to the target (no ease). */
  snap(): void {
    if (this.rhythm) return;
    if (this.value !== this.target) this.revision++;
    this.value = this.target;
    this.velocity = 0;
  }
}

/**
 * The channels of one avatar, in fixed slots (core channels first). Install
 * (by id) at creation / plugin attach; per frame use slot indices.
 */
export class ChannelBank {
  readonly slots: ChannelSlot[] = [];
  /** Bumped whenever any target changes (set / preset / behavior). */
  revision = 0;
  private readonly byId = new Map<string, number>();

  constructor(specs: readonly ChannelSpec[] = []) {
    // a family may re-register a core channel (same id, e.g. `valence`) to give it an expression on that family
    for (const s of CORE_CHANNELS) this.install(specs.find((f) => f.id === s.id) ?? s);
    for (const s of specs) this.install(s);
  }

  /** Install a channel (or return its existing slot). */
  install(spec: ChannelSpec): number {
    const have = this.byId.get(spec.id);
    if (have !== undefined) return have;
    const i = this.slots.length;
    this.slots.push(new ChannelSlot(spec));
    this.byId.set(spec.id, i);
    this.revision++;
    return i;
  }

  /** Slot of `id` (−1 when not installed). Resolve once, then index. */
  index(id: string): number {
    return this.byId.get(id) ?? -1;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get ids(): string[] {
    return this.slots.map((s) => s.spec.id);
  }

  private at(ch: string | number): ChannelSlot | undefined {
    return this.slots[typeof ch === 'number' ? ch : this.index(ch)];
  }

  /** Live value of a channel (0 when not installed). */
  value(ch: string | number): number {
    return this.at(ch)?.value ?? 0;
  }

  /** Effective target (level value; rhythm rate, NaN = hidden). */
  target(ch: string | number): number {
    return this.at(ch)?.target ?? NaN;
  }

  /** Set a channel (null clears the setting: back to the preset / rest; a rhythm hides). `immediate` jumps. False when not installed. */
  set(ch: string | number, value: number | null, immediate = false): boolean {
    const s = this.at(ch);
    if (!s) return false;
    const v = value === null || !Number.isFinite(value) ? NaN : value;
    if (!(Number.isNaN(v) && Number.isNaN(s.held)) && v !== s.held) this.revision++;
    s.held = v;
    s.retarget();
    if (immediate) s.snap();
    return true;
  }

  /** Behavior layer of a slot (NaN releases). Called on behavior start / end, not per frame. */
  hold(slot: number, value: number): void {
    const s = this.slots[slot];
    if (!s || Object.is(s.transient, value)) return;
    s.transient = value;
    s.retarget();
    this.revision++;
  }

  /** A preset's channel targets (ids not listed fall back to set / rest). */
  applyPreset(targets: Readonly<Record<string, number>> | undefined): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      const v = targets?.[s.spec.id];
      const nv = v === undefined ? NaN : v;
      if (Object.is(nv, s.preset)) continue;
      s.preset = nv;
      s.retarget();
      this.revision++;
    }
  }

  /** Advance every channel; true when any value changed. */
  step(dt: number): boolean {
    let changed = false;
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i]!.step(dt)) changed = true;
    return changed;
  }

  /** Everything back to rest (seek / reset): settings, behavior holds and phases cleared. */
  reset(): void {
    for (const s of this.slots) {
      s.held = s.transient = NaN;
      s.retarget();
      s.snap();
      s.visibility = s.phase = s.cycles = 0;
      if (s.rhythm) s.value = 0;
    }
    this.revision++;
  }

  /** Targets by id (snapshot; allocates — not for per-frame use). */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of this.slots) out[s.spec.id] = s.target;
    return out;
  }
}
