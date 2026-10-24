/**
 * Attribute-level SVG markup patching for the retained renderer: when an
 * atom's new markup has the same element structure as the old one (same tags,
 * attribute names and text), only the changed attribute values are written
 * (e.g. an eye path's `d`); anything else falls back to `innerHTML`.
 */

export interface ParsedMarkup {
  /** Structure key: tags, attribute names and text, without attribute values. */
  shape: string;
  /** Attribute [name, value] lists, one per element in document order. */
  attrs: [string, string][][];
}

const TOKEN = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
const ENTITY = /&(?:(amp|lt|gt|quot|apos)|#(\d+)|#x([0-9a-fA-F]+));/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(v: string): string | null {
  if (!v.includes('&')) return v;
  // only the basic / numeric entities are decoded here; anything else is left to the HTML parser
  if (v.replace(ENTITY, '').includes('&')) return null;
  return v.replace(ENTITY, (_m, n: string | undefined, d: string | undefined, x: string | undefined) =>
    n ? NAMED[n]! : String.fromCodePoint(d ? Number(d) : parseInt(x!, 16)),
  );
}

/** Parse markup into structure + attribute values; null when it is not safely patchable. */
export function parseMarkup(markup: string): ParsedMarkup | null {
  if (markup.includes('<!') || markup.includes('<?')) return null;
  let shape = '';
  const attrs: [string, string][][] = [];
  let consumed = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(markup); m; m = TOKEN.exec(markup)) {
    if (m.index !== consumed) return null;
    consumed = TOKEN.lastIndex;
    if (m[5] !== undefined) {
      shape += `#${m[5]}`;
      continue;
    }
    if (m[1]) {
      shape += `</${m[2]}>`;
      continue;
    }
    const list: [string, string][] = [];
    shape += `<${m[2]}`;
    const raw = m[3] ?? '';
    ATTR.lastIndex = 0;
    for (let a = ATTR.exec(raw); a; a = ATTR.exec(raw)) {
      const name = a[1]!;
      // namespaced attributes (xlink:href…) need setAttributeNS: not patched
      if (name.includes(':')) return null;
      const value = decode(a[2] ?? a[3] ?? '');
      if (value === null) return null;
      list.push([name, value]);
      shape += ` ${name}`;
    }
    shape += m[4] ? '/>' : '>';
    attrs.push(list);
  }
  if (consumed !== markup.length) return null;
  return { shape, attrs };
}

/**
 * Patch `slot` (currently showing `prev`) to `next` in place. Returns false
 * when the structures differ (caller falls back to `innerHTML`).
 */
export function patchMarkup(slot: Element, prev: ParsedMarkup | null, next: ParsedMarkup | null): boolean {
  if (!prev || !next || prev.shape !== next.shape) return false;
  const els = slot.getElementsByTagName('*');
  if (els.length !== next.attrs.length) return false;
  for (let i = 0; i < next.attrs.length; i++) {
    const a = next.attrs[i]!;
    const b = prev.attrs[i]!;
    const el = els[i]!;
    for (let k = 0; k < a.length; k++) if (a[k]![1] !== b[k]![1]) el.setAttribute(a[k]![0], a[k]![1]);
  }
  return true;
}
