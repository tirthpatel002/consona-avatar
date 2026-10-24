import { useCallback, useMemo, useRef } from 'react';
import {
  applyControlValue,
  getPath,
  listAvatarAtoms,
  listAvatarAtomVariants,
  rollAvatar,
  resolveControlStates,
  setPath,
  type AvatarStudioConfigSource,
  type AvatarStudioManifest,
} from '@consona/avatar-enhanced/core/index.ts';
import type { StudioAtomView, StudioModel } from './types';

/** Model for config-backed families: controls + atoms read / write the family's config directly. */
export function useConfigStudio<M>(manifest: AvatarStudioManifest<M>, value: M, onChange: (next: M) => void): StudioModel {
  const src = manifest.source as AvatarStudioConfigSource<M>;
  const family = manifest.families[0];
  // latest value / callback for rapid successive edits (slider drags) and stable handlers
  const ref = useRef(value);
  ref.current = value;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const commit = useCallback((next: M) => {
    ref.current = next;
    changeRef.current(next);
  }, []);

  const controls = useMemo(() => resolveControlStates(src.controls, value), [src.controls, value]);
  const atomDefs = useMemo(() => listAvatarAtoms(family).filter((a) => a.id in src.atomPaths), [family, src.atomPaths]);
  const atoms = useMemo<StudioAtomView[]>(
    () =>
      atomDefs.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        selected: String(getPath(value, src.atomPaths[a.id]!) ?? ''),
        groups: [['', listAvatarAtomVariants(a.id, family).map((v) => ({ id: v.id, name: v.name, description: v.description }))]],
      })),
    [atomDefs, family, src.atomPaths, value],
  );

  const setControl = useCallback((path: string, v: unknown) => commit(applyControlValue(src.controls, ref.current, path, v)), [commit, src.controls]);
  const selectAtom = useCallback((atom: string, id: string) => commit(setPath(ref.current, src.atomPaths[atom]!, id)), [commit, src.atomPaths]);
  const previewWith = useCallback((atom: string, id: string) => setPath(ref.current, src.atomPaths[atom]!, id), [src.atomPaths]);
  const replace = useCallback((m: unknown) => commit(m as M), [commit]);
  const randomize = useCallback(() => {
    // the family's randomizer spec (core) decides atoms + values; applied in control order
    const start = ref.current;
    const build = (atoms: Record<string, string>, values: Record<string, unknown>) => {
      let m = start;
      for (const [atom, id] of Object.entries(atoms)) m = setPath(m, src.atomPaths[atom]!, id);
      for (const [path, v] of Object.entries(values)) m = applyControlValue(src.controls, m, path, v);
      return m;
    };
    const atoms = Object.fromEntries(Object.entries(src.atomPaths).map(([a, p]) => [a, String(getPath(start, p) ?? '')]));
    const r = rollAvatar({ family, atoms, resolve: (a, v) => resolveControlStates(src.controls, build(a, v)) });
    commit(build(r.atoms, r.values));
  }, [commit, family, src]);

  const code = useMemo(() => {
    if (!src.code) return '';
    try {
      return src.code.encode(value);
    } catch {
      return '';
    }
  }, [src.code, value]);
  const importCode = useCallback(
    (text: string) => {
      const c = src.code!;
      if (!c.isCode(text)) throw new Error('Invalid avatar code');
      commit(c.decode(text));
    },
    [commit, src.code],
  );

  return useMemo(
    () => ({
      model: value,
      controls,
      setControl,
      atoms,
      selectAtom,
      previewWith,
      replace,
      share: manifest.share !== false && src.code ? { code, importCode } : undefined,
      randomize: manifest.randomize !== false ? randomize : undefined,
    }),
    [value, controls, setControl, atoms, selectAtom, previewWith, replace, manifest.share, manifest.randomize, src.code, code, importCode, randomize],
  );
}
