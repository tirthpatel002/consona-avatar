import * as THREE from 'three';
import type { ResolvedAvatarDefinition } from '../../../core/define/resolveAvatar.ts';
import type { AvatarAnchorName } from '../../../core/atom/atom.ts';
import { DEFAULT_MOUTH } from '../../../core/face/mouth.ts';

/**
 * Rig anchors: where the abstract attach points of `core/atom` (`hand`,
 * `head`, `mouth`, `chest`, `base`…) are on a Three rig, in the rig's
 * `procedural` (body) space — the space atoms and limbs live in.
 *
 * A family maps names onto its rig with `registerAnchors(family, provider)`
 * (e.g. `hand` = a tentacle tip) and falls back to `defaultAnchor` for the
 * rest: surface points from the body samplers (cached until the body or the
 * face layout changes), the hand pivot, or the first simulated limb.
 */
export interface RigAnchorFrame {
  position: THREE.Vector3;
  /** Outward unit normal (atoms can stand off along it / align to it). */
  normal: THREE.Vector3;
}

export function createAnchorFrame(): RigAnchorFrame {
  return { position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0) };
}

/** Limbs a atom drawer simulates (e.g. `tentacles`): live tips in procedural space. */
export interface RigLimbs {
  readonly count: number;
  /** Tip of limb `index` (position + outward tangent); false if absent. */
  tip(index: number, out: RigAnchorFrame): boolean;
  /** Points per limb (root = 0 … tip = points − 1). */
  readonly points: number;
  /** Point `k` of limb `index` (procedural space); false if absent. */
  point(index: number, k: number, out: THREE.Vector3): boolean;
}

/** What providers read: live rig state (parts fill it in as they build; `def` is the shown definition). */
export interface RigAnchorSource {
  /** The definition shown this frame (the controller updates it). */
  def: ResolvedAvatarDefinition;
  readonly bodyCenterY: number;
  readonly procedural: THREE.Object3D;
  readonly geometry?: THREE.BufferGeometry;
  readonly limbs?: RigLimbs;
  /** Hand pivot (e.g. an accessory nub), if any. */
  readonly hand?: THREE.Object3D;
  surfaceAt?(x: number, y: number, point: THREE.Vector3, normal: THREE.Vector3): boolean;
  surfaceRadial?(origin: THREE.Vector3, dir: THREE.Vector3): number | null;
}

export type AnchorProvider = (name: AvatarAnchorName, src: RigAnchorSource, out: RigAnchorFrame) => boolean;

const providers = new Map<string, AnchorProvider>();

/** A family's anchor mapping (fall back to `defaultAnchor` for names it doesn't map). */
export function registerAnchors(family: string, provider: AnchorProvider): void {
  providers.set(family, provider);
}

// ---------- surface lookups (cached: raycasts only when the body / layout changes; no per-frame allocation) ----------
interface SurfaceEntry {
  kind: number;
  x: number;
  y: number;
  attr: unknown;
  version: number;
  ok: boolean;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}
const surfaceCache = new WeakMap<RigAnchorSource, SurfaceEntry[]>();
const UP = new THREE.Vector3(0, 1, 0);
const TMP_O = new THREE.Vector3();
const TMP_W = new THREE.Vector3();

/** The cache entry of (kind, x, y) (created once). */
function entryOf(src: RigAnchorSource, kind: number, x: number, y: number): SurfaceEntry {
  let list = surfaceCache.get(src);
  if (!list) surfaceCache.set(src, (list = []));
  let e: SurfaceEntry | undefined;
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (c.kind === kind && c.x === x && c.y === y) e = c;
  }
  // bounded: slider drags (e.g. mouth height) leave old keys behind
  if (!e && list.length >= 16) list.shift();
  if (!e) list.push((e = { kind, x, y, attr: null, version: -1, ok: false, position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0) }));
  return e;
}
function current(src: RigAnchorSource, e: SurfaceEntry): boolean {
  const attr = src.geometry?.getAttribute('position');
  const version = (attr as THREE.BufferAttribute | undefined)?.version ?? 0;
  if (e.attr === attr && e.version === version) return true;
  e.attr = attr;
  e.version = version;
  return false;
}
function finish(e: SurfaceEntry, out: RigAnchorFrame): boolean {
  if (!e.ok) return false;
  out.position.copy(e.position);
  out.normal.copy(e.normal);
  return true;
}

/** Front-most body surface point at procedural (x, y), cached. */
export function surfaceAnchor(src: RigAnchorSource, x: number, y: number, out: RigAnchorFrame): boolean {
  const e = entryOf(src, 0, x, y);
  if (!current(src, e)) e.ok = !!src.surfaceAt?.(x, y, e.position, e.normal);
  return finish(e, out);
}

/** Top of the head: the body surface straight above the body centre, cached. */
export function topAnchor(src: RigAnchorSource, out: RigAnchorFrame): boolean {
  const e = entryOf(src, 1, 0, 0);
  if (!current(src, e)) {
    const d = src.surfaceRadial?.(TMP_O.set(0, src.bodyCenterY, 0), UP);
    e.ok = d != null;
    if (d != null) e.position.set(0, src.bodyCenterY + d, 0);
    e.normal.copy(UP);
  }
  return finish(e, out);
}

/** Bottom of the body (the point under it), cached. */
export function baseAnchor(src: RigAnchorSource, out: RigAnchorFrame): boolean {
  const e = entryOf(src, 2, 0, 0);
  if (!current(src, e)) {
    const g = src.geometry;
    e.ok = !!g;
    if (g) {
      g.computeBoundingBox();
      e.position.set(0, g.boundingBox!.min.y, 0);
    }
    e.normal.copy(UP);
  }
  return finish(e, out);
}

/**
 * Generic anchors: `head` = top of the body, `mouth` = surface at the mouth
 * (or where it would be), `chest` = front at the body centre, `base` = under
 * the body, `hand` = the hand pivot, else the first limb tip, else the front
 * right of the body.
 */
export function defaultAnchor(name: AvatarAnchorName, src: RigAnchorSource, out: RigAnchorFrame): boolean {
  const cy = src.bodyCenterY;
  switch (name) {
    case 'head':
      return topAnchor(src, out);
    case 'mouth': {
      const m = src.def.mouth;
      return surfaceAnchor(src, 0, cy + src.def.anchor.y + (m ? m.height : DEFAULT_MOUTH.height), out);
    }
    case 'chest':
      return surfaceAnchor(src, 0, cy, out);
    case 'base':
      return baseAnchor(src, out);
    case 'hand.left':
    case 'hand.right':
      // one hand only: both sides resolve to it (families with two map them)
      return defaultAnchor('hand', src, out);
    case 'hand': {
      if (src.hand) {
        src.procedural.updateWorldMatrix(true, false);
        src.hand.getWorldPosition(TMP_W);
        src.procedural.worldToLocal(out.position.copy(TMP_W));
        out.normal.set(out.position.x, out.position.y - cy, out.position.z).normalize();
        return true;
      }
      if (src.limbs && src.limbs.count > 0) return src.limbs.tip(0, out);
      return surfaceAnchor(src, 0.45, cy - 0.15, out);
    }
    default:
      return false;
  }
}

/** Per-rig anchor resolver: the family's provider, else the generic one. */
export class RigAnchors {
  readonly source: RigAnchorSource;
  private readonly provider: AnchorProvider;
  constructor(source: RigAnchorSource, family?: string) {
    this.source = source;
    this.provider = (family && providers.get(family)) || defaultAnchor;
  }
  /** Anchor `name` in procedural space; false when the rig has no such point. */
  resolve(name: AvatarAnchorName, out: RigAnchorFrame): boolean {
    return this.provider(name, this.source, out);
  }
}
