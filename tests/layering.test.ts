import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Import layering: `core` is renderer- and framework-free, `adapters` and
 * `react` are family-agnostic, families only compose and configure.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
const rel = (f: string) => relative(SRC, f);
const IMPORT = /^\s*(?:import|export)(\s+type)?\s[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
/** Module specifiers of a file (`type` marks `import type` / `export type`, which vanish at runtime). */
const imports = (file: string) => [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => ({ spec: m[2] ?? m[3]!, type: !!m[1] }));
const target = (file: string, spec: string) => (spec.startsWith('.') ? resolve(dirname(file), spec) : spec);
const inside = (path: string, dir: string) => path.startsWith(join(SRC, dir) + '/');
const FAMILIES = readdirSync(join(SRC, 'avatars')).filter((f) => statSync(join(SRC, 'avatars', f)).isDirectory());
const GENERIC = ['core', 'adapters', 'react'];

test('layering: core imports no renderer, react or family code', () => {
  const bad: string[] = [];
  for (const f of files(join(SRC, 'core')))
    for (const { spec } of imports(f)) {
      const abs = target(f, spec);
      if (/^(three|react)(\/|$)/.test(spec) || ['adapters', 'avatars', 'react'].some((d) => inside(abs, d))) bad.push(`${rel(f)} → ${spec}`);
    }
  assert.deepEqual(bad, []);
});

test('layering: adapters and react bindings import no family code', () => {
  const bad: string[] = [];
  for (const f of [...files(join(SRC, 'adapters')), ...files(join(SRC, 'react'))])
    for (const { spec } of imports(f)) if (inside(target(f, spec), 'avatars')) bad.push(`${rel(f)} → ${spec}`);
  assert.deepEqual(bad, []);
});

test('layering: no family names in generic code (comments aside)', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  // a family id as a word (the `@consona/…` package scope is not a family reference)
  const re = new RegExp(`(?<![@\\w-])(${FAMILIES.join('|')})(?![\\w-])`, 'i');
  const bad: string[] = [];
  for (const f of GENERIC.flatMap((d) => files(join(SRC, d))))
    strip(readFileSync(f, 'utf8'))
      .split('\n')
      .forEach((line, i) => {
        if (re.test(line)) bad.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
      });
  assert.deepEqual(bad, []);
});

test('layering: no runtime import cycles', () => {
  const all = files(SRC);
  const known = new Set(all);
  const graph = new Map(all.map((f) => [f, imports(f).filter((i) => !i.type && i.spec.startsWith('.')).map((i) => target(f, i.spec)).filter((d) => known.has(d))]));
  // Tarjan's strongly connected components: any component of 2+ files is a cycle
  let next = 0;
  const index = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], onStack = new Set<string>();
  const cycles: string[][] = [];
  const visit = (v: string) => {
    index.set(v, next), low.set(v, next++), stack.push(v), onStack.add(v);
    for (const w of graph.get(v)!) {
      if (!index.has(w)) visit(w), low.set(v, Math.min(low.get(v)!, low.get(w)!));
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) !== index.get(v)) return;
    const scc: string[] = [];
    let w: string;
    do (w = stack.pop()!), onStack.delete(w), scc.push(rel(w));
    while (w !== v);
    if (scc.length > 1) cycles.push(scc);
  };
  for (const v of all) if (!index.has(v)) visit(v);
  assert.deepEqual(cycles, []);
});
