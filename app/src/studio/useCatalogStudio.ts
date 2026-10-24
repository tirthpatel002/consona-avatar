import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAvatarHandle } from '@consona/avatar-enhanced/react/useAvatarHandle.ts';
import { useAvatarCatalog } from '@consona/avatar-enhanced/react/useAvatarCatalog.ts';
import {
  applyAvatarOverrides,
  composeAvatar,
  decodeAvatarStudioState,
  encodeAvatarStudioState,
  getAvatarControls,
  getAvatarAtomVariantIcon,
  getAvatarPreset,
  createAvatarRng,
  newAvatarSeed,
  pickAvatarPreset,
  rollAvatar,
  listAvatarBehaviors,
  listAvatarAtoms,
  listAvatarAtomVariants,
  listAvatarPresetNames,
  toHexColor,
  type AvatarEvent,
  type AvatarStudioCatalogSource,
  type AvatarStudioManifest,
} from '@consona/avatar-enhanced/core/index.ts';
import type { StudioAtomOption, StudioAtomView, StudioModel } from './types';

type Overrides = Record<string, Record<string, unknown>>;
type Compositions = Record<string, Record<string, string>>;
const NO_OVERRIDES: Record<string, unknown> = {};

/** Debounce rebuild-heavy values (definition changes rebuild the rig). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Model for catalog-backed families: presets + atom compositions + registry controls, on a runtime handle. */
export function useCatalogStudio(manifest: AvatarStudioManifest): StudioModel {
  const src = manifest.source as AvatarStudioCatalogSource;
  const full = useAvatarCatalog();
  const families = useMemo(() => full.families.filter((f) => manifest.families.includes(f.id)), [full, manifest.families]);
  const presets = useMemo(() => full.presets.filter((p) => manifest.families.includes(p.family)), [full, manifest.families]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [compositions, setCompositions] = useState<Compositions>({});
  const [log, setLog] = useState<string[]>([]);
  const handle = useAvatarHandle();

  const preset = presets.find((p) => p.id === selectedId) ?? presets[0] ?? null;
  const presetOverrides = (preset && overrides[preset.id]) || NO_OVERRIDES;
  const atomSelection = (preset && (compositions[preset.id] ?? preset.composition?.atoms)) || null;

  const baseDef = useMemo(() => {
    if (!preset) return null;
    if (!preset.composition || !atomSelection || atomSelection === preset.composition.atoms) return preset.definition;
    try {
      return composeAvatar({ ...preset.composition, atoms: atomSelection });
    } catch {
      return preset.definition;
    }
  }, [preset, atomSelection, full.version]);
  const liveDef = useMemo(() => (preset && baseDef ? applyAvatarOverrides(baseDef, presetOverrides, preset.controls) : null), [preset, baseDef, presetOverrides]);
  const stageDef = useDebounced(liveDef, 120);
  const def = stageDef && preset && stageDef.id === preset.id ? stageDef : liveDef;

  const controls = useMemo(() => (liveDef && preset ? getAvatarControls(liveDef, preset.controls) : []), [liveDef, preset]);
  const tint = controls.find((c) => c.path === 'body.color')?.value as string | undefined;
  const atoms = useMemo<StudioAtomView[]>(() => {
    if (!preset || !atomSelection) return [];
    // only the atoms this preset is composed of (e.g. body + eyes + mouth)
    return listAvatarAtoms(preset.family)
      .filter((a) => a.id in atomSelection)
      .map((a) => {
        const groups = new Map<string, StudioAtomOption[]>();
        for (const v of listAvatarAtomVariants(a.id, preset.family)) {
          const g = v.group ?? '';
          groups.set(g, [...(groups.get(g) ?? []), { id: v.id, name: v.name, description: v.description, tag: v.tags?.[0], swatch: v.swatch !== undefined ? toHexColor(v.swatch) : undefined, icon: getAvatarAtomVariantIcon(v) }]);
        }
        return { id: a.id, name: a.name, description: a.description, selected: atomSelection[a.id] ?? null, tint, groups: Array.from(groups.entries()) };
      })
      .filter((a) => a.groups.length);
  }, [preset, atomSelection, full.version, tint]);

  const behaviors = useMemo(() => (liveDef ? listAvatarBehaviors(liveDef) : []), [liveDef, full.version]);
  const presetNames = useMemo(() => (liveDef ? listAvatarPresetNames(liveDef.family) : []), [liveDef, full.version]);

  const onEvent = useCallback((e: AvatarEvent) => {
    const text = e.type === 'preset' ? `preset → ${e.preset}` : e.type === 'message' ? `message ${e.text === null ? '(cleared)' : `“${e.text}”`}` : `${e.type} ${'behavior' in e ? e.behavior : ''}${e.type === 'end' && e.interrupted ? ' (interrupted)' : ''}`;
    setLog((l) => [text, ...l].slice(0, 8));
  }, []);

  // latest values for stable handlers (memoized panels keep their props)
  const live = useRef({ preset, atomSelection, liveDef, presets });
  live.current = { preset, atomSelection, liveDef, presets };

  const setControl = useCallback((path: string, value: unknown) => {
    const p = live.current.preset;
    if (!p) return;
    setOverrides((o) => ({ ...o, [p.id]: { ...(o[p.id] ?? {}), [path]: value } }));
  }, []);
  const selectAtom = useCallback((atom: string, id: string) => {
    const { preset: p, atomSelection: sel } = live.current;
    if (!p || !sel) return;
    setCompositions((c) => ({ ...c, [p.id]: { ...sel, [atom]: id } }));
  }, []);
  const selectPreset = useCallback((id: string) => {
    setSelectedId(id);
    setLog([]);
  }, []);
  const resetParams = useCallback(() => {
    const p = live.current.preset;
    if (p) setOverrides((o) => ({ ...o, [p.id]: {} }));
  }, []);
  const resetAtoms = useCallback(() => {
    const p = live.current.preset;
    if (!p) return;
    setCompositions((c) => {
      const next = { ...c };
      delete next[p.id];
      return next;
    });
  }, []);

  /** Family randomizer (core spec): a weighted starting preset, then atoms + values; same in-place morph as a preset switch. */
  const randomize = useCallback(() => {
    const { presets: list, preset: current } = live.current;
    const seed = newAvatarSeed();
    const start = pickAvatarPreset(list, createAvatarRng(seed)) ?? current;
    if (!start) return;
    const compose = (atoms: Record<string, string>) => {
      if (!start.composition || !Object.keys(atoms).length) return start.definition;
      try {
        return composeAvatar({ ...start.composition, atoms });
      } catch {
        return null;
      }
    };
    const r = rollAvatar({
      family: start.family,
      atoms: { ...(start.composition?.atoms ?? {}) },
      seed,
      resolve: (atoms, values) => {
        const base = compose(atoms) ?? start.definition;
        return getAvatarControls(applyAvatarOverrides(base, values, start.controls), start.controls);
      },
    });
    const composed = start.composition && compose(r.atoms) !== null;
    setSelectedId(start.id);
    setLog([]);
    setCompositions((c) => {
      const next = { ...c };
      if (composed) next[start.id] = r.atoms;
      else delete next[start.id];
      return next;
    });
    setOverrides((o) => ({ ...o, [start.id]: r.values }));
  }, []);

  const code = useMemo(
    () => (preset ? encodeAvatarStudioState({ family: preset.family, preset: preset.id, atoms: compositions[preset.id], overrides: presetOverrides }) : ''),
    [preset, compositions, presetOverrides],
  );
  const importCode = useCallback(
    (text: string) => {
      const st = decodeAvatarStudioState(text, manifest.families);
      setSelectedId(st.preset);
      setCompositions((c) => {
        const next = { ...c };
        if (st.atoms) next[st.preset] = { ...(getAvatarPreset(st.preset)?.composition?.atoms ?? {}), ...st.atoms };
        else delete next[st.preset];
        return next;
      });
      setOverrides((o) => ({ ...o, [st.preset]: st.overrides ?? {} }));
    },
    [manifest.families],
  );

  const clickBehavior = src.clickBehavior ?? behaviors[1];
  const catalog = useMemo(
    () => ({ families, presets, preset, selectPreset, resetParams, resetAtoms, handle, onEvent, log, behaviors, presetNames, clickBehavior }),
    [families, presets, preset, selectPreset, resetParams, resetAtoms, handle, onEvent, log, behaviors, presetNames, clickBehavior],
  );

  return useMemo(
    () => ({
      model: def,
      controls,
      setControl,
      atoms,
      selectAtom,
      share: manifest.share !== false ? { code, importCode } : undefined,
      randomize: manifest.randomize !== false ? randomize : undefined,
      catalog,
    }),
    [def, controls, setControl, atoms, selectAtom, manifest.share, manifest.randomize, code, importCode, randomize, catalog],
  );
}
