/**
 * Named option lists shared between renderer-agnostic tools (controls,
 * studios) and renderer adapters. Adapters publish what they can build
 * (e.g. 'surfacePattern', 'eyeShape', 'bodyGeometry') without the core
 * importing them.
 */
const options = new Map<string, Set<string>>();

export function registerAvatarOption(kind: string, name: string): void {
  let set = options.get(kind);
  if (!set) options.set(kind, (set = new Set()));
  set.add(name);
}

export function listAvatarOptions(kind: string): string[] {
  return Array.from(options.get(kind) ?? []);
}
