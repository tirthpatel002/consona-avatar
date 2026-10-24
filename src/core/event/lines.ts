/**
 * A pool of lines for a behavior's message
 * (`ctx.pose.message`). One line is picked per RUN — round-robin from a
 * random start, so back-to-back runs vary — and cached against the run's
 * params object: the per-frame `text(params)` is a WeakMap lookup (no
 * allocation, no randomness per frame, and two avatars running the same
 * behavior keep their own line). `params.message` overrides: a non-empty
 * string is shown as is, `false` / `'none'` hides the bubble.
 */
export class LinePool {
  readonly lines: readonly string[];
  private next: number;
  private readonly picked = new WeakMap<object, string | null>();
  constructor(lines: readonly string[]) {
    this.lines = lines;
    this.next = lines.length ? Math.floor(Math.random() * lines.length) : 0;
  }
  /** The line of this run (picked on first use; null = hidden). */
  text(params: Record<string, unknown>): string | null {
    const hit = this.picked.get(params);
    if (hit !== undefined) return hit;
    const m = params.message;
    let line: string | null;
    if (m === false || m === 'none') line = null;
    else if (typeof m === 'string' && m.trim() !== '') line = m;
    else if (this.lines.length) {
      line = this.lines[this.next % this.lines.length]!;
      this.next = (this.next + 1) % this.lines.length;
    } else line = null;
    this.picked.set(params, line);
    return line;
  }
}

/** The `message` param of a behavior that speaks from a `LinePool` (empty = one of its lines). */
export const LINE_MESSAGE_PARAM = { kind: 'text', label: 'Message (empty = one of its lines)', default: '' } as const;
