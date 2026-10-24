import type { ChannelSchemaMap, ChannelDefinition, BlendMode } from './ChannelSchema.ts';
import {
  lerpScalar,
  lerpBoolean,
  lerpEnum,
  lerpColor,
  blendAdditiveScalar,
  blendMultiplyScalar,
  blendOverrideScalar,
} from './Interpolators.ts';

/**
 * ChannelBuffer: High-performance storage and blending container for a node's channels.
 * Backs numeric channels and discrete channels with dirty tracking.
 */
export class ChannelBuffer {
  public readonly schema: ChannelSchemaMap;
  private readonly baseValues: Map<string, any> = new Map();
  private readonly values: Map<string, any> = new Map();
  private readonly defaultValues: Map<string, any> = new Map();
  private dirty: boolean = true;

  constructor(schema: ChannelSchemaMap, initialValues?: Record<string, any>) {
    this.schema = schema;

    for (const [key, def] of Object.entries(schema)) {
      this.defaultValues.set(key, def.defaultValue);
      const val = initialValues?.[key] !== undefined ? initialValues[key] : def.defaultValue;
      this.baseValues.set(key, val);
      this.values.set(key, val);
    }
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  clearDirty(): void {
    this.dirty = false;
  }

  markDirty(): void {
    this.dirty = true;
  }

  get<T = any>(channelName: string): T {
    return this.values.get(channelName);
  }

  getBase<T = any>(channelName: string): T {
    return this.baseValues.get(channelName);
  }

  set(channelName: string, value: any): boolean {
    const prevBase = this.baseValues.get(channelName);
    if (prevBase !== value) {
      this.baseValues.set(channelName, value);
      this.values.set(channelName, value);
      this.dirty = true;
      return true;
    }
    return false;
  }

  setValues(overrides: Record<string, any>): void {
    for (const [key, val] of Object.entries(overrides)) {
      if (this.schema[key]) {
        this.set(key, val);
      }
    }
  }

  resetToDefaults(): void {
    for (const [key, def] of Object.entries(this.schema)) {
      this.set(key, def.defaultValue);
    }
  }

  resetToRestingState(): void {
    let changed = false;
    for (const [key, val] of this.baseValues.entries()) {
      if (this.values.get(key) !== val) {
        this.values.set(key, val);
        changed = true;
      }
    }
    if (changed) {
      this.dirty = true;
    }
  }


  toObject(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [k, v] of this.values.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  clone(): ChannelBuffer {
    const buf = new ChannelBuffer(this.schema);
    buf.copyFrom(this);
    return buf;
  }

  /** Copy base + current values from another buffer with the same schema (pool-friendly). */
  copyFrom(source: ChannelBuffer): void {
    for (const [k, v] of source.baseValues.entries()) {
      this.baseValues.set(k, v);
      this.values.set(k, source.values.get(k));
    }
    this.dirty = source.dirty;
  }

  /**
   * Blends delta values into this buffer according to each channel's declared blendMode and weight.
   */
  applyDelta(deltas: Record<string, any>, weight: number = 1.0): void {
    if (weight <= 0) return;
    for (const key in deltas) this.applyChannelDelta(key, deltas[key], weight);
  }

  /** Single-channel `applyDelta` (no per-call object; same blending). */
  applyChannelDelta(key: string, deltaVal: any, weight: number = 1.0): void {
    if (weight <= 0) return;
    const def = this.schema[key];
    if (!def) {
      const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
      if (nodeEnv !== 'production') {
        throw new Error(`ChannelBuffer.applyDelta: unknown channel "${key}"`);
      }
      return;
    }
    if (deltaVal === undefined) return;

    const baseVal = this.baseValues.get(key) ?? def.defaultValue;
    const currentVal = this.values.get(key) ?? baseVal;
    let blendedVal = currentVal;

    if (def.blend) {
      blendedVal = def.blend(baseVal, deltaVal, weight);
    } else if (def.type === 'float') {
      if (def.blendMode === 'additive') {
        const p = def.period;
        // periodic (angle): blend the shortest equivalent delta, so fading a full turn never unwinds
        const d = p && weight < 1 ? deltaVal - p * Math.round(deltaVal / p) : deltaVal;
        blendedVal = currentVal + d * weight;
      } else if (def.blendMode === 'multiply') {
        const factor = 1.0 + (deltaVal - 1.0) * weight;
        blendedVal = currentVal * factor;
      } else {
        // from the value so far: older layers crossfade into newer ones (single layer: current = base)
        blendedVal = blendOverrideScalar(currentVal, deltaVal, weight);
      }
    } else {
      // Discrete or color channel override
      blendedVal = weight >= 0.5 ? deltaVal : baseVal;
    }

    this.values.set(key, blendedVal);
    this.dirty = true;
  }

  /**
   * Interpolates all channels between this buffer and a target buffer by factor t in [0, 1].
   */
  interpolate(target: ChannelBuffer, t: number, out?: ChannelBuffer): ChannelBuffer {
    const destination = out || this;
    const clampedT = Math.max(0, Math.min(1, t));

    for (const [key, def] of Object.entries(this.schema)) {
      const vA = this.baseValues.get(key);
      const vB = target.baseValues.get(key) ?? target.get(key);

      if (vA === undefined || vB === undefined) continue;

      let result: any;
      if (def.interpolate) {
        result = def.interpolate(vA, vB, clampedT);
      } else if (def.type === 'float') {
        result = lerpScalar(vA, vB, clampedT);
      } else if (def.type === 'color') {
        result = lerpColor(vA, vB, clampedT);
      } else if (def.type === 'boolean') {
        result = lerpBoolean(vA, vB, clampedT);
      } else {
        result = lerpEnum(vA, vB, clampedT);
      }

      destination.set(key, result);
    }

    return destination;
  }
}
