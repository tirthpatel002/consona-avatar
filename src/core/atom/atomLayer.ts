import { moveToward } from '../math/Interpolation.ts';
import { ATOM_TRANSITION, getAtom, listAtoms } from './atom.ts';
import type { AvatarAnchorName, AtomDefinition } from './atom.ts';

/**
 * Behavior-side atom / reach channels of the pose layer and their live state.
 *
 * Behaviors write requests every frame (reset each frame, like the pose):
 *
 *   pose.atom('cup', w).at('hand');           // show the cup on the hand at weight w
 *   pose.reach('mouth', w, 0.4);              // bring the hand toward the mouth
 *   pose.reach('head', w, 1).side('left').offset(-0.7, 0, 0.3); // the left hand beside the head
 *
 * The state machine folds them into `AtomTracker` / `AvatarReachState`:
 * rate-limited, so a atom an behavior stops writing fades out over its
 * `transition` where it is, and an interrupted reach relaxes instead of
 * snapping. Hand-offs between behaviors writing the same atom are seamless.
 */

/** One atom request of this frame (pooled; chain `.at()`, `.offset()`, `.rotate()`, `.size()`). */
export class AtomWrite {
  id = '';
  weight = 0;
  anchor: AvatarAnchorName | null = null;
  ox = 0;
  oy = 0;
  oz = 0;
  rx = 0;
  ry = 0;
  rz = 0;
  scale = 1;
  reset(id: string, weight: number): this {
    this.id = id;
    this.weight = weight;
    this.anchor = null;
    this.ox = this.oy = this.oz = 0;
    this.rx = this.ry = this.rz = 0;
    this.scale = 1;
    return this;
  }
  /** Attach point (default: the atom's own `anchor`). */
  at(anchor: AvatarAnchorName): this {
    this.anchor = anchor;
    return this;
  }
  /** Extra offset (body units), added to the definition's. */
  offset(x: number, y: number, z: number): this {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    return this;
  }
  /** Extra rotation (XYZ Euler radians), after the definition's. */
  rotate(x: number, y: number, z: number): this {
    this.rx = x;
    this.ry = y;
    this.rz = z;
    return this;
  }
  /** Size multiplier (e.g. shrink while being eaten). */
  size(s: number): this {
    this.scale = s;
    return this;
  }
}

/** Live state of one atom (renderers read it; `shown` 0 = hidden, nothing to draw). */
export interface AtomState {
  readonly id: string;
  /** Registered definition (undefined: unknown atom, renderers skip it). */
  readonly def: AtomDefinition | undefined;
  anchor: AvatarAnchorName;
  /** 0..1 visibility (rate-limited toward the requested weight). */
  shown: number;
  /** Requested weight this frame (0 when no behavior writes it). */
  target: number;
  ox: number;
  oy: number;
  oz: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
}

/** Folds per-frame atom requests into live, smoothly fading atom states (allocation-free after first use). */
export class AtomTracker {
  /** Every atom used so far (hidden ones have `shown` 0). */
  readonly states: AtomState[] = [];
  private readonly family: string | undefined;

  private readonly local = new Map<string, AtomDefinition>();

  constructor(family?: string) {
    this.family = family;
  }

  /** Define an atom for this avatar only (plugin content); shadows the registry. */
  define(def: AtomDefinition): void {
    this.local.set(def.id, def);
  }

  /** Atom `id` as this avatar sees it. */
  lookup(id: string): AtomDefinition | undefined {
    return this.local.get(id) ?? getAtom(id, this.family);
  }

  /** Atom ids this avatar can show (registry + its own). */
  ids(): string[] {
    const out = listAtoms(this.family).map((a) => a.id);
    for (const id of this.local.keys()) if (!out.includes(id)) out.push(id);
    return out;
  }

  get(id: string): AtomState | undefined {
    for (let i = 0; i < this.states.length; i++) if (this.states[i]!.id === id) return this.states[i];
    return undefined;
  }

  step(writes: readonly AtomWrite[], count: number, dt: number): void {
    const states = this.states;
    for (let i = 0; i < states.length; i++) states[i]!.target = 0;
    for (let i = 0; i < count; i++) {
      const w = writes[i]!;
      let s = this.get(w.id);
      if (!s) {
        const def = this.lookup(w.id);
        s = { id: w.id, def, anchor: def?.anchor ?? 'hand', shown: 0, target: 0, ox: 0, oy: 0, oz: 0, rx: 0, ry: 0, rz: 0, scale: 1 };
        states.push(s);
      }
      s.target = Math.max(s.target, Math.min(1, Math.max(0, w.weight)));
      // placement follows the latest request; when nobody writes it the atom fades where it is
      s.anchor = w.anchor ?? s.def?.anchor ?? s.anchor;
      s.ox = w.ox; s.oy = w.oy; s.oz = w.oz;
      s.rx = w.rx; s.ry = w.ry; s.rz = w.rz;
      s.scale = w.scale;
    }
    for (let i = 0; i < states.length; i++) {
      const s = states[i]!;
      const tr = s.def?.transition ?? ATOM_TRANSITION;
      s.shown = tr > 0 ? moveToward(s.shown, s.target, dt / tr) : s.target;
    }
  }

  /** Hide everything at once (seek / reset). */
  reset(): void {
    for (const s of this.states) s.shown = s.target = 0;
  }
}

/** Live reach: "bring the hand toward `target`" (families map it onto their rig, e.g. a tentacle pull). */
/** Which hand: seen from the front ('right' = screen right, +x in body space). */
export type AvatarSide = 'left' | 'right';

/** This frame's reach request (chain `.side()`, `.offset()`). */
export class AvatarReachWrite {
  target: AvatarAnchorName | null = null;
  weight = 0;
  approach = 0;
  limbSide: AvatarSide | null = null;
  ox = 0;
  oy = 0;
  oz = 0;
  reset(target: AvatarAnchorName | null, weight: number, approach: number): this {
    this.target = target;
    this.weight = weight;
    this.approach = approach;
    this.limbSide = null;
    this.ox = this.oy = this.oz = 0;
    return this;
  }
  /** Reach with this side's hand (default: the family's). */
  side(side: AvatarSide): this {
    this.limbSide = side;
    return this;
  }
  /** Shift the reach point (body units, body axes), e.g. a waving sweep. */
  offset(x: number, y: number, z: number): this {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    return this;
  }
}

export interface AvatarReachState {
  /** Anchor to reach toward (kept while the weight relaxes). */
  target: AvatarAnchorName | null;
  /** 0..1 (rate-limited). */
  weight: number;
  /** 0 = the family's comfortable hold point near the target, 1 = at the anchor itself. */
  approach: number;
  /** Hand to reach with (null = the family's default); kept while relaxing, like the offset. */
  side: AvatarSide | null;
  /** Extra reach point offset (body units, body axes). */
  ox: number;
  oy: number;
  oz: number;
}

/** A resting reach state. */
export function createReachState(): AvatarReachState {
  return { target: null, weight: 0, approach: 0, side: null, ox: 0, oy: 0, oz: 0 };
}

export const AVATAR_REACH_TRANSITION = 0.35;

/** Fold this frame's reach request into the live state. */
export function stepReach(state: AvatarReachState, write: AvatarReachWrite, dt: number): void {
  const target = write.target;
  const w = target ? Math.min(1, Math.max(0, write.weight)) : 0;
  if (target && w > 0) {
    // a different hand starts from rest (its own weight ramp), never by teleporting the reach
    if (write.limbSide !== state.side && state.weight > 0) state.weight = 0;
    state.target = target;
    state.side = write.limbSide;
    state.ox = write.ox;
    state.oy = write.oy;
    state.oz = write.oz;
    state.approach = moveToward(state.approach, Math.min(1, Math.max(0, write.approach)), dt / AVATAR_REACH_TRANSITION);
  }
  state.weight = moveToward(state.weight, w, dt / AVATAR_REACH_TRANSITION);
  if (state.weight === 0) state.approach = 0;
}
