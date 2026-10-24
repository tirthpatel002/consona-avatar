/**
 * Upsert registry with optional family scopes. Keys are stored as
 * `scope:name` (scope `GLOBAL_SCOPE` = shared by every family). Lookups with a
 * scope try the scoped entry first, then fall back to the shared one, so a
 * family can override a shared name (e.g. an behavior or preset) without
 * clobbering other families. Unlike `Registry`, registering an existing name
 * replaces it (hot reload / studio tweaks).
 */
export const GLOBAL_SCOPE = '*';

export const scopedKey = (scope: string | undefined, name: string): string => `${scope ?? GLOBAL_SCOPE}:${name}`;

export class ScopedRegistry<T> {
  private readonly entries = new Map<string, { scope: string; name: string; value: T }>();

  set(name: string, value: T, scope: string = GLOBAL_SCOPE): this {
    const key = scopedKey(scope, name);
    // keep first-insertion order on replace (Map semantics)
    this.entries.set(key, { scope, name, value });
    return this;
  }

  /** Scoped entry, else the shared one. */
  get(name: string, scope?: string): T | undefined {
    if (scope && scope !== GLOBAL_SCOPE) {
      const s = this.entries.get(scopedKey(scope, name));
      if (s) return s.value;
    }
    return this.entries.get(scopedKey(GLOBAL_SCOPE, name))?.value;
  }

  has(name: string, scope?: string): boolean {
    return this.get(name, scope) !== undefined;
  }

  delete(name: string, scope: string = GLOBAL_SCOPE): boolean {
    return this.entries.delete(scopedKey(scope, name));
  }

  /** Names visible from `scope` (shared + scoped, deduped, insertion order). No scope = shared only. */
  names(scope?: string): string[] {
    const out = new Set<string>();
    for (const e of this.entries.values()) if (e.scope === GLOBAL_SCOPE || (scope && e.scope === scope)) out.add(e.name);
    return Array.from(out);
  }

  /** Values visible from `scope` (a scoped entry shadows the shared one of the same name). */
  values(scope?: string): T[] {
    return this.names(scope).map((n) => this.get(n, scope)!);
  }

  /** Every entry of every scope. */
  entriesAll(): { scope: string; name: string; value: T }[] {
    return Array.from(this.entries.values());
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
