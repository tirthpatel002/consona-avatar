import { hypot3 } from '../math/hypot.ts';
import type { BehaviorDefinition, AvatarRig } from '../types/AvatarDefinition.ts';
import { ScopedRegistry } from '../registry/ScopedRegistry.ts';
import { Easing } from '../math/Interpolation.ts';

/**
 * Behavior registry + helpers. The engine ships no concrete behaviors (the state
 * machine auto-creates an empty `idle`); avatar packages register theirs or
 * pass them per definition via `AvatarDefinition.behaviors`.
 */

const registry = new ScopedRegistry<BehaviorDefinition>();

/** Register (or replace) an behavior. `family` scopes it to one avatar family (default: shared by all). */
export function registerBehavior(behavior: BehaviorDefinition, family?: string): void {
  registry.set(behavior.name, behavior, family);
}

/** Behaviors visible to `family` (shared + family-scoped; scoped shadow shared). No family = shared only. */
export function listBehaviors(family?: string): BehaviorDefinition[] {
  return registry.values(family);
}

/** Identity helper for authoring typed custom behaviors. */
export function defineBehavior<R extends AvatarRig = AvatarRig>(def: BehaviorDefinition<R>): BehaviorDefinition<R> {
  return def;
}

/** Smoothstep easing. */
export const avatarEase = Easing.smoothstep;

/** 0 -> 1 -> 0 envelope over `dur`, ramping at `rate` per second at both ends. */
export const avatarEnvelope = (t: number, dur: number, rate: number): number => Math.max(0, Math.min(1, t * rate, (dur - t) * rate));

// ---------- spin / rotation helpers (renderer-agnostic quaternion maths) ----------

/** Named axes for spins (studio presets). */
export const AVATAR_AXIS_PRESETS: Record<string, [number, number, number]> = {
  X: [1, 0, 0],
  Y: [0, 1, 0],
  Z: [0, 0, 1],
  XY: [1, 1, 0],
  XZ: [1, 0, 1],
  YZ: [0, 1, 1],
  XYZ: [1, 1, 1],
};

/**
 * Normalize an axis given as a vector `[x, y, z]`, `{x, y, z}` or a name
 * ('x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz', any case). Zero / invalid → Y.
 */
export function parseAvatarAxis(axis: unknown): [number, number, number] {
  let v: [number, number, number] | null = null;
  if (typeof axis === 'string') v = AVATAR_AXIS_PRESETS[axis.toUpperCase()] ?? null;
  else if (Array.isArray(axis) && axis.length >= 3) v = [Number(axis[0]), Number(axis[1]), Number(axis[2])];
  else if (axis && typeof axis === 'object' && 'x' in axis) {
    const a = axis as { x: number; y: number; z: number };
    v = [Number(a.x), Number(a.y), Number(a.z)];
  }
  if (!v || v.some((n) => !Number.isFinite(n))) return [0, 1, 0];
  const m = hypot3(v[0], v[1], v[2]);
  return m < 1e-9 ? [0, 1, 0] : [v[0] / m, v[1] / m, v[2] / m];
}

/** Quaternion [x, y, z, w] for a rotation of `angle` radians about a unit `axis`. */
export function axisAngleQuaternion(axis: [number, number, number], angle: number): [number, number, number, number] {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

/** Rotate a vector by a quaternion [x, y, z, w]. */
export function rotateByQuaternion(q: [number, number, number, number], v: [number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [x, y, z] = v;
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}

/** Easings for parameterized behaviors (0..1 → 0..1, exact at both ends). */
export const AVATAR_EASINGS: Record<string, (k: number) => number> = {
  linear: Easing.linear,
  smooth: avatarEase,
  easeIn: Easing.easeInCubic,
  easeOut: (k) => 1 - Math.pow(1 - k, 3),
  easeInOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: Easing.easeOutBack,
  elastic: Easing.easeOutElastic,
};

export function avatarEasing(name: unknown): (k: number) => number {
  return (typeof name === 'string' && AVATAR_EASINGS[name]) || avatarEase;
}

/** Spin parameters with defaults resolved (axis normalized). */
export function resolveSpinParams(params: Record<string, unknown> = {}): { axis: [number, number, number]; turns: number; easing: (k: number) => number; easingName: string } {
  const turns = typeof params.turns === 'number' && Number.isFinite(params.turns) ? params.turns : 1;
  const easingName = typeof params.easing === 'string' && AVATAR_EASINGS[params.easing] ? params.easing : 'smooth';
  return { axis: parseAvatarAxis(params.axis ?? 'y'), turns, easing: avatarEasing(easingName), easingName };
}

/** Spin orientation at progress `k` (0..1): quaternion [x, y, z, w]. */
export function spinQuaternion(params: Record<string, unknown>, k: number): [number, number, number, number] {
  const p = resolveSpinParams(params);
  return axisAngleQuaternion(p.axis, p.easing(Math.min(1, Math.max(0, k))) * p.turns * Math.PI * 2);
}

/** Behavior definition by name: the definition's own behaviors first, then the registry. */
export function getBehavior(name: string, def?: { behaviors?: BehaviorDefinition[]; family?: string }): BehaviorDefinition | undefined {
  return def?.behaviors?.find((a) => a.name === name) ?? registry.get(name, def?.family);
}

/** Default params of an behavior from its `params` hints. */
export function defaultBehaviorParams(behavior: BehaviorDefinition | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(behavior?.params ?? {})) out[k] = Array.isArray(p.default) ? [...p.default] : p.default;
  return out;
}
