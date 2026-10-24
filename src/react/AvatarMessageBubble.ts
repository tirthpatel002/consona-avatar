import React, { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AvatarHandle } from '../core/engine/AvatarHandle.ts';

const h = React.createElement;

export interface AvatarMessageBubbleProps {
  /** The avatar whose message to show (emitted / behavior messages). */
  handle: AvatarHandle | null;
  className?: string;
  style?: CSSProperties;
  /** Gap between the anchor and the tail tip (px, default 10). */
  gap?: number;
}

/** Margin kept to the frame's edges (px). */
const EDGE = 8;
/** Follow smoothing rate (1/s): steady on a moving avatar, no lag you can see. */
const FOLLOW = 20;
const TAIL = 8;

const bubbleStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  zIndex: 1,
  width: 'max-content',
  maxWidth: 'var(--avatar-bubble-max-width, 240px)',
  padding: 'var(--avatar-bubble-padding, 8px 12px)',
  borderRadius: 'var(--avatar-bubble-radius, 16px)',
  background: 'var(--avatar-bubble-bg, #ffffff)',
  color: 'var(--avatar-bubble-fg, #1d2333)',
  font: 'var(--avatar-bubble-font, 500 14px/1.35 system-ui, -apple-system, sans-serif)',
  boxShadow: 'var(--avatar-bubble-shadow, 0 6px 20px rgba(15, 20, 40, 0.18))',
  textAlign: 'center',
  pointerEvents: 'none',
  opacity: 0,
  willChange: 'transform, opacity',
};

const tailStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  width: 0,
  height: 0,
  marginLeft: -TAIL,
  borderLeft: `${TAIL}px solid transparent`,
  borderRight: `${TAIL}px solid transparent`,
};
const tailBelow = `${TAIL + 1}px solid var(--avatar-bubble-bg, #ffffff)`;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Speech bubble over an avatar (DOM overlay: crisp, accessible text for
 * every family / renderer). Place it in the positioned box the avatar fills;
 * it points its tail at the message anchor (`handle.anchorOnScreen`), follows
 * the avatar and stays inside the box. React renders only when the text
 * changes (`message` events); position and fade are written to the element
 * per animation frame, and only while a message exists.
 *
 * Theme with CSS variables: `--avatar-bubble-bg`, `-fg`, `-font`, `-radius`,
 * `-padding`, `-shadow`, `-max-width` (or `className` / `style`).
 */
export function AvatarMessageBubble({ handle, className, style, gap = 10 }: AvatarMessageBubbleProps) {
  const [text, setText] = useState<string | null>(() => handle?.message?.text ?? null);
  const el = useRef<HTMLDivElement | null>(null);
  const tail = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!handle) {
      setText(null);
      return;
    }
    setText(handle.message?.text ?? null);
    return handle.subscribe((e) => {
      if (e.type === 'message') setText(e.text);
    });
  }, [handle]);

  useEffect(() => {
    if (!handle || text === null) return;
    const p = { x: 0, y: 0 };
    let raf = 0, last = 0, sx = 0, sy = 0, first = true;
    let below: boolean | null = null, prevT = '', prevO = '', prevTail = '';
    // layout reads only change on resize / text change — measure once and re-measure
    // on window resize instead of forcing layout bookkeeping every frame
    let W = 0, H = 0, w = 0, bh = 0;
    let measuredNode: HTMLElement | null = null;
    const measure = (node: HTMLElement, parent: HTMLElement) => {
      W = parent.clientWidth;
      H = parent.clientHeight;
      w = node.offsetWidth;
      bh = node.offsetHeight;
      measuredNode = node;
    };
    const onResize = () => {
      measuredNode = null;
    };
    window.addEventListener('resize', onResize);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const node = el.current, parent = node?.offsetParent as HTMLElement | null;
      const m = handle.message;
      if (!node || !parent || !m || !handle.anchorOnScreen(m.anchor, p)) {
        if (node && prevO !== '0') node.style.opacity = prevO = '0';
        return;
      }
      if (measuredNode !== node) measure(node, parent);
      const ax = p.x * W, ay = p.y * H;
      // above the anchor; flips below when there's no room on top; kept inside the frame when it fits
      let x = ax - w / 2, y = ay - gap - TAIL - bh;
      const flip = y < EDGE && ay + gap + TAIL + bh <= H - EDGE;
      if (flip) y = ay + gap + TAIL;
      if (W >= w + 2 * EDGE) x = clamp(x, EDGE, W - w - EDGE);
      if (H >= bh + 2 * EDGE) y = clamp(y, EDGE, H - bh - EDGE);
      const dt = first ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      const k = first ? 1 : 1 - Math.exp(-FOLLOW * dt);
      sx += (x - sx) * k;
      sy += (y - sy) * k;
      first = false;
      const s = m.shown, pop = 0.85 + 0.15 * s * s * (3 - 2 * s);
      const tx = clamp(ax - sx, 2 * TAIL, w - 2 * TAIL);
      const t = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) scale(${pop.toFixed(3)})`;
      if (t !== prevT) {
        node.style.transform = prevT = t;
        node.style.transformOrigin = `${tx.toFixed(1)}px ${flip ? '0' : '100%'}`;
      }
      const o = s.toFixed(3);
      if (o !== prevO) node.style.opacity = prevO = o;
      const tn = tail.current;
      if (!tn) return;
      const tl = `${tx.toFixed(1)}px`;
      if (tl !== prevTail) tn.style.left = prevTail = tl;
      if (flip !== below) {
        below = flip;
        tn.style.top = flip ? `${-TAIL - 1}px` : '100%';
        tn.style.borderTop = flip ? '' : tailBelow;
        tn.style.borderBottom = flip ? tailBelow : '';
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [handle, text, gap]);

  if (text === null) return null;
  return h(
    'div',
    { ref: el, className: className ? `avatar-message ${className}` : 'avatar-message', role: 'status', style: style ? { ...bubbleStyle, ...style } : bubbleStyle },
    text,
    h('div', { ref: tail, 'aria-hidden': true, style: tailStyle }),
  );
}
