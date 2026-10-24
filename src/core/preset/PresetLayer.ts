import { getPreset, isPresetRebuildPath, presetWarn } from './presets.ts';
import type { PresetCycle, PresetValue, RegisteredPreset } from './presets.ts';

export interface PresetLayerOptions {
  family?: string;
  /** Resolve a preset id (default: the registry for `family`); the runtime passes its avatar's own view (plugin presets). */
  lookup?: (id: string) => RegisteredPreset | undefined;
  /** Seed of cycle variation / noise / variations / periodic behaviors (deterministic). */
  seed?: number;
  /** Numeric config (base) value of `path`. Called per frame: must not allocate. */
  base: (path: string, slot: PresetSlot) => number;
  /** Can the renderer modulate `path` in place? (false → dropped with a dev warning). */
  accepts?: (path: string) => boolean;
  /** Renderer handle cached on the slot (resolved once per preset switch, not per frame). */
  bind?: (path: string) => unknown;
  /** A slot stopped overriding `path` (faded back to its base): restore the config value. */
  onRelease?: (slot: PresetSlot) => void;
  /** Variant switch (`undefined` = back to the config value). */
  onVariant?: (path: string, value: PresetValue | undefined) => void;
  /** Periodic preset behavior. */
  onBehavior?: (behavior: string) => void;
}

/** One modulated numeric path. `value` is the resolved (absolute) override this frame. */
export interface PresetSlot {
  readonly path: string;
  value: number;
  ref: unknown;
  /** Value captured when the current transition started (live state). */
  from: number;
  owned: boolean;
  hasTarget: boolean;
  target: number;
  cycle: PresetCycle | null;
  seed: number;
}

interface VariationState {
  path: string;
  value: PresetValue;
  every: [number, number];
  hold: number;
  next: number;
  holding: number;
}
interface BehaviorState {
  behavior: string;
  every: [number, number];
  next: number;
}

const TAU = Math.PI * 2;
const DEFAULT_ENTER = 0.3;
const smooth = (t: number) => t * t * (3 - 2 * t);
const frac = (x: number) => x - Math.floor(x);

/** 32-bit integer hash (deterministic, allocation-free). */
export function hash32(a: number, b = 0): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
export function hashString(s: string, seed = 0): number {
  let h = seed | 0;
  for (let i = 0; i < s.length; i++) h = hash32(h, s.charCodeAt(i));
  return h;
}
/** Hash → [-1, 1]. */
const unit = (a: number, b: number) => (hash32(a, b) / 0xffffffff) * 2 - 1;
/** Smooth 1-D value noise in [-1, 1]. */
function noise(seed: number, u: number): number {
  const i = Math.floor(u);
  const f = smooth(u - i);
  const a = unit(seed, i);
  return a + (unit(seed, i + 1) - a) * f;
}

/** A cycle's value at `time` (seconds since the preset started). */
export function evaluatePresetCycle(c: PresetCycle, time: number, seed = 0): number {
  const u = time / c.period + (c.phase ?? 0);
  const amp = c.amp ?? 1;
  let w: number;
  switch (c.wave ?? 'sine') {
    case 'triangle':
      w = 1 - 4 * Math.abs(frac(u + 0.25) - 0.5);
      break;
    case 'noise':
      w = noise(seed, u);
      break;
    case 'keyframes': {
      const k = c.keys;
      if (!k || k.length === 0) {
        w = 0;
        break;
      }
      const x = frac(u) * k.length;
      const i = Math.floor(x);
      const a = k[i]!;
      w = a + (k[(i + 1) % k.length]! - a) * (x - i);
      break;
    }
    default:
      w = Math.sin(u * TAU);
  }
  if (c.variation) w *= 1 + c.variation * noise(seed ^ 0x5bd1e995, u);
  return w * amp;
}

/**
 * Per-avatar preset evaluator. `set(id)` switches presets (crossfading from the
 * live values, mid-cycle included); `step(dt)` advances and writes each
 * modulated path's resolved value into its `slot.value`. Allocation-free per
 * frame (slots / schedules are created on preset switches only). Renderers read
 * `slots` (numbers) and receive variant switches through `onVariant`.
 */
export class PresetLayer {
  readonly family: string | undefined;
  private readonly lookup: (id: string) => RegisteredPreset | undefined;
  readonly slots: PresetSlot[] = [];
  /** Active variant switches (path → value). */
  readonly variants = new Map<string, PresetValue>();
  private readonly byPath = new Map<string, PresetSlot>();
  private readonly opts: PresetLayerOptions;
  private seed: number;
  private current = 'neutral';
  private spec: RegisteredPreset | undefined;
  private clock = 0;
  private elapsed = 0;
  private duration = 0;
  private ease: (t: number) => number = smooth;
  private rng = 1;
  private variations: VariationState[] = [];
  private behaviors: BehaviorState[] = [];
  /**
   * Whether the last `step()` (or a slot add/release / variant / behavior event)
   * changed anything a renderer would apply. Consumers that re-derive channel
   * values from the preset every frame can skip the pass when this is false —
   * the reset + re-apply pair must then be skipped together (deltas accumulate).
   */
  dirty = false;

  constructor(options: PresetLayerOptions) {
    this.opts = options;
    this.family = options.family;
    this.lookup = options.lookup ?? ((id) => getPreset(id, this.family));
    this.seed = options.seed ?? 1;
  }

  /** The preset shown (or entering). */
  get preset(): string {
    return this.current;
  }
  /** Its spec (undefined before the first `set`). */
  get active(): RegisteredPreset | undefined {
    return this.spec;
  }
  /** Seconds since the preset was entered. */
  get time(): number {
    return this.clock;
  }
  /** 0..1 progress of the running transition (1 = settled). */
  get progress(): number {
    return this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 1;
  }

  /** Resolved override of `path`, if the preset modulates it. */
  get(path: string): number | undefined {
    return this.byPath.get(path)?.value;
  }

  /**
   * Switch to preset `id` (crossfades from the live values over the preset's
   * `enter` transition, or `duration`). Unknown ids are ignored (dev warning).
   */
  set(id: string, options: { duration?: number; force?: boolean } = {}): boolean {
    const spec = this.lookup(id);
    if (!spec) {
      presetWarn(`unknown preset "${id}"${this.family ? ` for family "${this.family}"` : ''}; ignored`);
      return false;
    }
    if (id === this.current && this.spec === spec && !options.force) return true;
    this.current = id;
    this.spec = spec;
    this.clock = 0;
    this.elapsed = 0;
    this.duration = Math.max(0, options.duration ?? spec.enter?.duration ?? DEFAULT_ENTER);
    this.ease = spec.enter?.ease ?? smooth;
    this.rng = hashString(id, this.seed) || 1;

    // capture the live state (mid-cycle / mid-transition) as every slot's start
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      s.from = s.value;
      s.owned = false;
      s.hasTarget = false;
      s.cycle = null;
    }
    const t = spec.targets;
    const variants: Record<string, PresetValue> = {};
    if (t) {
      for (const path in t) {
        const v = t[path]!;
        if (typeof v === 'number') {
          const s = this.claim(path);
          if (s) {
            s.hasTarget = true;
            s.target = v;
          }
        } else if (this.allowed(path)) variants[path] = v;
      }
    }
    const c = spec.cycles;
    if (c) {
      for (const path in c) {
        const s = this.claim(path);
        if (s) s.cycle = c[path]!;
      }
    }
    // variant switches: drop the old ones, apply the new ones
    for (const path of Array.from(this.variants.keys())) {
      if (!(path in variants)) {
        this.variants.delete(path);
        this.opts.onVariant?.(path, undefined);
      }
    }
    for (const path in variants) {
      if (this.variants.get(path) !== variants[path]) {
        this.variants.set(path, variants[path]!);
        this.opts.onVariant?.(path, variants[path]);
      }
    }
    this.variations = (spec.variations ?? []).filter((v) => this.allowed(v.path)).map((v) => ({ ...v, every: v.every, next: this.between(v.every), holding: 0 }));
    this.behaviors = (spec.behaviors ?? []).map((a) => ({ behavior: a.behavior, every: a.every, next: this.between(a.every) }));
    if (this.duration === 0) this.step(0);
    return true;
  }

  /** Jump to `id` without a transition, restarting its clock and seeded schedules (deterministic replays). */
  reset(id: string = this.current): void {
    this.set(id, { duration: 0, force: true });
    for (let i = this.slots.length - 1; i >= 0; i--) if (!this.slots[i]!.owned) this.release(i);
  }

  /** Change the variation seed (takes effect on the next preset switch / reset). */
  setSeed(seed: number): void {
    this.seed = seed;
  }

  /** Advance by `dt` seconds and resolve every slot. */
  step(dt: number): void {
    this.clock += dt;
    this.elapsed += dt;
    const k = this.duration > 0 ? this.ease(Math.min(1, this.elapsed / this.duration)) : 1;
    const base = this.opts.base;
    let moved = false;
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i]!;
      let v: number;
      if (s.owned) {
        const b = s.hasTarget ? s.target : base(s.path, s);
        if (!s.cycle) v = b;
        else {
          const w = evaluatePresetCycle(s.cycle, this.clock, s.seed);
          v = s.cycle.mode === 'set' ? w : s.cycle.mode === 'mul' ? b * (1 + w) : b + w;
        }
      } else v = base(s.path, s);
      const nv = s.from + (v - s.from) * k;
      if (nv !== s.value) moved = true;
      s.value = nv;
      if (k >= 1 && !s.owned) this.release(i);
    }
    if (moved) this.dirty = true;
    if (dt > 0) {
      for (let i = 0; i < this.variations.length; i++) {
        const v = this.variations[i]!;
        if (v.holding > 0) {
          v.holding -= dt;
          if (v.holding <= 0) {
            const back = this.spec?.targets?.[v.path];
            if (back !== undefined && typeof back !== 'number') this.variants.set(v.path, back);
            else this.variants.delete(v.path);
            this.opts.onVariant?.(v.path, back !== undefined && typeof back !== 'number' ? back : undefined);
            v.next = this.between(v.every);
          }
        } else if ((v.next -= dt) <= 0) {
          v.holding = v.hold;
          this.variants.set(v.path, v.value);
          this.opts.onVariant?.(v.path, v.value);
        }
      }
      for (let i = 0; i < this.behaviors.length; i++) {
        const a = this.behaviors[i]!;
        if ((a.next -= dt) <= 0) {
          a.next = this.between(a.every);
          this.opts.onBehavior?.(a.behavior);
        }
      }
    }
  }

  private allowed(path: string): boolean {
    if (isPresetRebuildPath(path, this.family)) {
      presetWarn(`"${path}" needs a rebuild; presets never modulate it (preset "${this.current}")`);
      return false;
    }
    if (this.opts.accepts && !this.opts.accepts(path)) {
      presetWarn(`"${path}" cannot be modulated in place by this renderer (preset "${this.current}"); ignored`);
      return false;
    }
    return true;
  }

  private claim(path: string): PresetSlot | null {
    let s = this.byPath.get(path);
    if (!s) {
      if (!this.allowed(path)) return null;
      s = { path, value: 0, ref: this.opts.bind?.(path), from: 0, owned: false, hasTarget: false, target: 0, cycle: null, seed: hashString(path, this.seed) };
      const b = this.opts.base(path, s);
      s.value = b;
      s.from = b;
      this.byPath.set(path, s);
      this.slots.push(s);
      this.dirty = true;
    }
    s.owned = true;
    return s;
  }

  private release(i: number): void {
    const s = this.slots[i]!;
    const last = this.slots.pop()!;
    if (last !== s) this.slots[i] = last;
    this.byPath.delete(s.path);
    this.dirty = true;
    this.opts.onRelease?.(s);
  }

  /** Seeded value in [lo, hi]. */
  private between([lo, hi]: [number, number]): number {
    this.rng = hash32(this.rng, 0x2545f491) || 1;
    return lo + (this.rng / 0xffffffff) * (hi - lo);
  }
}
