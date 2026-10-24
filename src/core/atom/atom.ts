import { ScopedRegistry } from '../registry/ScopedRegistry.ts';
import type { ColorLike } from '../types/AvatarDefinition.ts';

/**
 * Atoms: objects an avatar holds or wears for a while (a cup, a hat, a
 * book…). Renderer-agnostic: a atom is a definition (what it is and where
 * it attaches) plus a live show / hide state that BEHAVIORS drive through the
 * pose layer (`ctx.pose.atom(id, weight).at(anchor)`), never a definition
 * edit. Renderers build the visual for `kind` once, lazily, and place it on
 * the family's anchor each frame (Three: `adapters/three/atoms`).
 *
 * Anchors are abstract attach points every family maps onto its own rig:
 * `hand` (whatever holds things: a hand pivot, a tentacle tip), `head` (top
 * of the head), `mouth`, `chest` (front of the body), `base` (the floor under
 * the avatar). Families may add their own names.
 */
export type AvatarAnchorName = 'hand' | 'hand.left' | 'hand.right' | 'head' | 'mouth' | 'chest' | 'base' | (string & {});

/** The shared anchor vocabulary (families map each onto their rig). `hand.left` / `hand.right`: a specific side's hand (seen from the front; default: `hand`). */
export const AVATAR_ANCHORS: readonly AvatarAnchorName[] = ['hand', 'hand.left', 'hand.right', 'head', 'mouth', 'chest', 'base'];

export interface AtomDefinition {
  id: string;
  label?: string;
  /** Visual builder key (renderers register one builder per kind). */
  kind: string;
  /** Default attach point. */
  anchor: AvatarAnchorName;
  /** Distance along the anchor's outward normal (body units, e.g. half the atom's thickness so it rests ON a tip). */
  standoff?: number;
  /** Offset from the anchor (body units, body axes; anchor axes when `align`). */
  offset?: readonly [number, number, number];
  /** Rest rotation (XYZ Euler radians). */
  rotation?: readonly [number, number, number];
  /** Uniform size (default 1). */
  scale?: number;
  /**
   * `'avatar'`: dressed in the avatar's own surface (its fur / plush, short
   * pile) where the visual allows it, instead of the visual's own material.
   */
  surface?: 'avatar';
  /** Align the atom's +Y with the anchor's outward normal (default false: stays upright). */
  align?: boolean;
  /** Fade / scale in-out time in s (default 0.2): an behavior that stops showing it lets it fade over this. */
  transition?: number;
  /** Named colours the visual uses (e.g. `{ shell: '#fff', fill: '#f66' }`). */
  colors?: Readonly<Record<string, ColorLike>>;
}

/** Default fade time of a atom (s). */
export const ATOM_TRANSITION = 0.2;

const registry = new ScopedRegistry<AtomDefinition>();

/** Identity helper for authoring typed atoms. */
export function defineAtom(def: AtomDefinition): AtomDefinition {
  return def;
}

/** Register (or replace) a atom. `family` scopes it (a family entry shadows the shared one). */
export function registerAtom(def: AtomDefinition, family?: string): void {
  registry.set(def.id, def, family);
}

/** The atom `id` as seen by `family`. */
export function getAtom(id: string, family?: string): AtomDefinition | undefined {
  return registry.get(id, family);
}

/** Atoms visible to `family` (shared + family-scoped). */
export function listAtoms(family?: string): AtomDefinition[] {
  return registry.values(family);
}
