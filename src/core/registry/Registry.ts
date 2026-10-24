export interface RegistryEntry {
  id: string;
}

/**
 * Typed registry with fail-fast duplicate id detection.
 */
export class Registry<T extends RegistryEntry> {
  private readonly byId = new Map<string, T>();

  register(def: T): this {
    if (this.byId.has(def.id)) throw new Error(`Registry: duplicate id "${def.id}"`);
    this.byId.set(def.id, def);
    return this;
  }

  get(id: string): T | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  list(filter?: (d: T) => boolean): readonly T[] {
    const all = Array.from(this.byId.values());
    return filter ? all.filter(filter) : all;
  }

  clear(): void {
    this.byId.clear();
  }
}
