import { moveToward } from '../math/Interpolation.ts';
import type { AvatarAnchorName } from '../atom/atom.ts';

/**
 * Messages: a short text the avatar "says" (speech bubble), attached to an
 * abstract anchor ('head' by default). Two sources, one bubble:
 *
 *  - `emit({ type: 'message', text, duration })` on the handle: shown until a `text: null` message
 *    or the optional auto-dismiss; it wins while set.
 *  - behaviors write `ctx.pose.message(text, weight, anchor)` every frame
 *    (like atoms): the message lasts as long as the behavior keeps writing it,
 *    so a hand-off / interrupt clears it on its own.
 *
 * The state is renderer-agnostic: `shown` (0..1) fades in / out over
 * `AVATAR_MESSAGE_TRANSITION`; a new text first fades the old one out.
 * Renderers draw it from the live view (`AvatarHandle.message`), positioned
 * at the projected anchor (`AvatarHandle.anchorOnScreen`).
 */
export interface AvatarMessageOptions {
  /** Anchor the bubble points at (default 'head'). */
  anchor?: AvatarAnchorName;
  /** Auto-dismiss after this many seconds (default: until cleared). */
  duration?: number;
}

/** What a renderer reads every frame (a live object, mutated in place). */
export interface AvatarMessageView {
  readonly text: string;
  readonly anchor: AvatarAnchorName;
  /** 0 hidden .. 1 fully shown. */
  readonly shown: number;
}

/** State snapshot entry (`state.message`). */
export interface AvatarMessageSnapshot {
  text: string;
  anchor: AvatarAnchorName;
}

/** Fade in / out time (s). */
export const AVATAR_MESSAGE_TRANSITION = 0.2;
export const AVATAR_MESSAGE_ANCHOR: AvatarAnchorName = 'head';

export class AvatarMessageTracker implements AvatarMessageView {
  /** Text on screen ('' = none). */
  text = '';
  anchor: AvatarAnchorName = AVATAR_MESSAGE_ANCHOR;
  shown = 0;
  private said: string | null = null;
  private saidAnchor: AvatarAnchorName = AVATAR_MESSAGE_ANCHOR;
  private saidLeft = Infinity;

  say(text: string, o: AvatarMessageOptions = {}): void {
    this.said = text;
    this.saidAnchor = o.anchor ?? AVATAR_MESSAGE_ANCHOR;
    this.saidLeft = o.duration !== undefined && o.duration > 0 ? o.duration : Infinity;
  }

  /** Clear the emitted message (behavior messages end when the behavior stops writing them). */
  clear(): void {
    this.said = null;
  }

  /**
   * Advance one frame with this frame's behavior write (`text` null = none).
   * Returns true when the text on screen changed (appeared, swapped, cleared).
   */
  step(text: string | null, weight: number, anchor: AvatarAnchorName, dt: number): boolean {
    if (this.said !== null && (this.saidLeft -= dt) <= 0) this.said = null;
    let want: string | null = null, at = anchor, w = 0;
    if (this.said !== null) {
      want = this.said;
      at = this.saidAnchor;
      w = 1;
    } else if (text && weight > 0) {
      want = text;
      w = Math.min(1, weight);
    }
    const rate = dt / AVATAR_MESSAGE_TRANSITION;
    if (want !== null && (want === this.text || this.text === '')) {
      const changed = want !== this.text;
      this.text = want;
      this.anchor = at;
      this.shown = moveToward(this.shown, w, rate);
      return changed;
    }
    // nothing wanted, or a different text: fade the current one out first
    this.shown = moveToward(this.shown, 0, rate);
    if (this.shown > 0 || this.text === '') return false;
    this.text = want ?? '';
    this.anchor = at;
    return true;
  }

  /** The live view while a message is on screen. */
  get view(): AvatarMessageView | null {
    return this.text ? this : null;
  }

  get snapshot(): AvatarMessageSnapshot | null {
    return this.text ? { text: this.text, anchor: this.anchor } : null;
  }

  reset(): void {
    this.text = '';
    this.shown = 0;
    this.said = null;
  }
}
