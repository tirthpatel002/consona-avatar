import React, { memo, useCallback, useState } from 'react';
import { Card, Badge as UiBadge, Button } from '@consona/interface';
import {
  getPreset,
  type AvatarControl,
  type PresetCycle,
  defaultBehaviorParams,
  getBehavior,
  resolveControlStates,
  setPath,
  toHexColor,
  type AvatarIcon,
  type AvatarTimeline,
  defineTimeline,
  type AvatarStudioManifest,
  type ResolvedAvatarDefinition,
} from '@consona/avatar-enhanced/core/index.ts';
import { behaviorButton, box, ControlField, heading, Slider, tileClass } from './controls';
import { BehaviorParams } from './BehaviorParams';
import { installedAvatarPackages } from './installAvatarPackages';
import type { StudioAtomView, StudioCatalogExtras, StudioModel, StudioSizeBinding } from './types';
import type { UseAvatarHandleResult } from '@consona/avatar-enhanced/react/useAvatarHandle.ts';
import type { StageProps } from './stages';
import { PluginBadge } from './livePanels';
import type { StudioPluginView } from './plugins';

const DEFAULT_TILE_GRID = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4';

/** Static SVG thumbnail (live previews). */
const Thumbnail: React.FC<{ markup: string; size?: number }> = ({ markup, size = 52 }) => (
  <div className="flex items-center justify-center overflow-hidden shrink-0 pointer-events-none select-none" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: markup }} />
);

/** Swatch / initial icon for option tiles without live previews (heavy renderers). */
const OptionIcon: React.FC<{ name: string; swatch?: string }> = ({ name, swatch }) =>
  swatch ? (
    <span className="w-8 h-8 rounded-full border border-white/25 shadow-xs shrink-0" style={{ background: swatch }} />
  ) : (
    <span className="w-8 h-8 rounded-full border border-border/60 bg-surface/80 flex items-center justify-center text-xs font-bold text-fg/80 shrink-0">{name.slice(0, 1).toUpperCase()}</span>
  );

/** Tiny inline SVG of a core `AvatarIcon` (no canvas); paths are cached in core, so this is cheap. */
const AtomIcon = memo(function AtomIcon({ icon, tint }: { icon: AvatarIcon; tint?: string }) {
  const [x, y, w, h] = icon.viewBox;
  const fill = { feature: '#1d1a2b', outline: tint ?? '#8b8fa3', body: tint ?? '#8b8fa3' };
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} width={44} height={Math.max(16, (44 * h) / w)} className="shrink-0 drop-shadow-sm" aria-hidden>
      {icon.paths.map((p, i) => (
        <path key={i} d={p.d} fill={fill[p.fill]} />
      ))}
    </svg>
  );
});

/** Option tiles of one atom. */
export const AtomBlock = memo(function AtomBlock(props: {
  atom: StudioAtomView;
  title?: string;
  columns?: string;
  preview?: (atom: string, id: string) => string;
  onSelect: (atom: string, id: string) => void;
}) {
  const { atom, title, columns, preview, onSelect } = props;
  return (
  <div className="flex flex-col gap-3 w-full" data-atom={atom.id}>
    <div className="flex items-center justify-between">
      <span className={heading} title={atom.description}>
        {title ?? atom.name}
      </span>
      {atom.selected && <span className="text-[11px] font-mono text-primary font-bold capitalize px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">{atom.selected}</span>}
    </div>
    {atom.groups.map(([group, options]) => (
      <div key={group} className="flex flex-col gap-2 w-full">
        {group && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-fg">{group}</span>}
        <div className={`grid ${columns ?? DEFAULT_TILE_GRID} gap-2.5 sm:gap-3 w-full`}>
          {options.map((o) => (
            <button key={o.id} type="button" data-variant={`${atom.id}:${o.id}`} title={o.description ?? o.name} onClick={() => onSelect(atom.id, o.id)} className={tileClass(atom.selected === o.id)}>
              {preview ? <Thumbnail markup={preview(atom.id, o.id)} /> : o.icon ? <AtomIcon icon={o.icon} tint={atom.tint} /> : <OptionIcon name={o.name} swatch={o.swatch} />}
              <span className="text-[11px] font-medium truncate w-full text-center">{o.name}</span>
              {!preview && !o.icon && o.tag && <span className="text-[10px] font-mono opacity-70 -mt-1.5">{o.tag}</span>}
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);
});

/** Preset picker (catalog families), grouped by family. */
export const PresetPicker: React.FC<{ catalog: StudioCatalogExtras; label: string }> = ({ catalog, label }) => (
  <div className="flex flex-col gap-4 w-full" data-testid="avatar-picker">
    {catalog.families.map((fam) => {
      const items = catalog.presets.filter((p) => p.family === fam.id);
      if (!items.length) return null;
      return (
        <div key={fam.id} className="flex flex-col gap-3 w-full">
          <div className="flex items-center justify-between">
            <span className={heading}>{fam.name}</span>
            <span className="text-[11px] text-muted-fg font-mono">{items.length} presets</span>
          </div>
          {fam.description && <p className="text-[11px] text-muted-fg leading-tight -mt-1.5">{fam.description}</p>}
          <div className={`grid ${DEFAULT_TILE_GRID} gap-2.5 sm:gap-3 w-full`}>
            {items.map((p) => (
              <button key={p.id} type="button" data-preset={p.id} onClick={() => catalog.selectPreset(p.id)} className={tileClass(p.id === catalog.preset?.id)}>
                <OptionIcon name={p.name} swatch={toHexColor(p.color)} />
                <span className="text-[11px] font-medium truncate w-full text-center">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      );
    })}
    <div className="text-[10px] font-mono text-muted-fg">
      packages: {installedAvatarPackages.join(', ') || '—'} · {catalog.presets.length} {label} presets
    </div>
  </div>
);

/** Compact strip under the stage: Avatar Code (copy / import) + Randomize. Any family with `share` / `randomize`. */
export const SharePanel = memo(function SharePanel({ share, onRandomize }: { share?: StudioModel['share']; onRandomize?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const code = share?.code ?? '';
  const copy = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);
  const apply = () => {
    const t = input.trim();
    if (!t || !share) return;
    try {
      share.importCode(t);
      setError(null);
      setInput('');
      setShowImport(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to decode code');
    }
  };
  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-surface/40 border border-border/60 w-full shrink-0">
      <div className="flex items-center justify-between gap-2">
        <label className={heading}>{share ? 'Avatar Code' : 'Randomize'}</label>
        <div className="flex items-center gap-2">
          {share && (
            <button type="button" onClick={() => { setShowImport(!showImport); setError(null); }} className="text-[11px] text-primary hover:underline font-medium transition-all">
              {showImport ? 'Hide Import' : 'Import Code'}
            </button>
          )}
          {onRandomize && (
            <button
              type="button"
              onClick={onRandomize}
              data-testid="studio-randomize"
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-primary-fg border border-primary shadow-xs hover:opacity-90 active:scale-95 transition-all"
            >
              <span aria-hidden>🎲</span> Randomize
            </button>
          )}
        </div>
      </div>
      {share &&
        (showImport ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Paste avatar code"
                value={input}
                onChange={(e) => { setInput(e.target.value); if (error) setError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && apply()}
                className="flex-1 min-w-0 bg-surface/80 border border-border/70 rounded-lg px-2.5 py-1.5 text-xs text-fg font-mono focus:outline-none focus:border-primary"
              />
              <button type="button" onClick={apply} className="px-3 py-1.5 rounded-lg bg-primary text-primary-fg text-xs font-semibold hover:opacity-90 transition-all shrink-0 shadow-xs">
                Apply
              </button>
            </div>
            {error ? <span className="text-[11px] text-red-500 font-medium">{error}</span> : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-surface/70 border border-border/60 rounded-lg p-1.5">
            <span className="flex-1 min-w-0 text-[11px] font-mono text-muted-fg truncate px-1.5 select-all" title={code}>{code}</span>
            <button
              type="button"
              onClick={copy}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${copied ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-bold' : 'bg-surface hover:bg-surface/80 border border-border/70 text-fg hover:text-primary shadow-xs'}`}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        ))}
    </div>
  );
});

/** A short scripted showcase (only when the family has the behaviors it uses). */
function demoTimeline(behaviors: readonly string[]): AvatarTimeline | null {
  if (!['jump', 'spin', 'wave', 'happy'].every((a) => behaviors.includes(a))) return null;
  return defineTimeline(
    [
      { behavior: 'jump' },
      { preset: 'sparkle' },
      { behavior: 'spin', params: { turns: 1, duration: 1.1 } },
      { gaze: { x: 0.55, y: 0.15 } },
      { pose: { body: [-0.1, 0.25, 0.12] }, duration: 0.5 },
      { wait: 0.7 },
      { gaze: null },
      { preset: 'happy' },
      { behavior: 'wave' },
      { behavior: 'happy' },
    ],
    { blink: { seed: 3 } },
  );
}

/** Behavior modifiers of config families (speed, weight, axis…), edited as controls over a params object. */
export interface StudioBehaviorModifiers {
  controls: AvatarControl<Record<string, unknown>>[];
  defaults: Record<string, unknown>;
}

/** Live behaviors (family + attached plugins, `handle.play`), per-behavior params, chain builder + timeline demo. */
export const BehaviorsPanel: React.FC<{
  handle: UseAvatarHandleResult;
  behaviors: readonly string[];
  def?: ResolvedAvatarDefinition | null;
  chain?: boolean;
  modifiers?: StudioBehaviorModifiers;
  plugins: StudioPluginView;
}> = ({ handle, behaviors, def, chain: chainable, modifiers, plugins }) => {
  const [chainMode, setChainMode] = useState(false);
  const [chain, setChain] = useState<string[]>([]);
  const [behaviorParams, setBehaviorParams] = useState<Record<string, Record<string, unknown>>>({});
  const [mods, setMods] = useState<Record<string, unknown>>(() => ({ ...(modifiers?.defaults ?? {}) }));
  const st = handle.state;
  // plugin behaviors live on the avatar, not in the registry: look them up there first
  const find = (a: string) => handle.handle()?.behaviorSpec(a) ?? getBehavior(a, def ?? undefined);
  const paramsOf = (a: string) => {
    const d = find(a);
    if (d?.params) return { ...defaultBehaviorParams(d), ...(behaviorParams[a] ?? {}) };
    return modifiers ? mods : undefined;
  };
  const run = (a: string) => (chainMode ? setChain((c) => [...c, a]) : handle.play(a, { params: paramsOf(a) }));
  const paramBehaviors = behaviors.map(find).filter((a) => a?.params);
  const modStates = modifiers ? resolveControlStates(modifiers.controls, mods) : [];
  return (
    <div className={box}>
      <div className="flex items-center justify-between">
        <label className={heading}>Behaviors</label>
        {chainable && (
          <label className="flex items-center gap-2 text-[11px] text-muted-fg">
            <input type="checkbox" checked={chainMode} onChange={(e) => setChainMode(e.target.checked)} className="accent-[var(--primary)]" />
            build chain
          </label>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5" data-testid="avatar-behaviors">
        {behaviors.map((a) => (
          <button key={a} type="button" data-behavior={a} className={behaviorButton(st?.behavior === a)} onClick={() => run(a)}>
            <span className="truncate text-[11px]">{a}</span>
            <PluginBadge plugin={plugins.badge('behaviors', a)} />
          </button>
        ))}
      </div>
      {st && st.outcomes.length > 0 && (
        // generic wait / resolve: any waiting behavior (e.g. a reminder) lists its outcomes
        <div className="flex flex-wrap items-center gap-1.5" data-testid="behavior-outcomes">
          <span className="text-[11px] text-muted-fg">{st.behavior} is waiting:</span>
          {st.outcomes.map((o) => (
            <button key={o} type="button" data-outcome={o} className={behaviorButton(false)} onClick={() => handle.resolve(o)}>
              <span className="text-[11px]">Resolve: {o}</span>
            </button>
          ))}
        </div>
      )}
      {modStates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {modStates.map((c) => (
            <ControlField key={c.path} control={c} onChange={(v) => setMods(setPath(mods, c.path, v))} />
          ))}
        </div>
      )}
      {paramBehaviors.map((a) => (
        <BehaviorParams key={a!.name} behavior={a!} value={{ ...defaultBehaviorParams(a!), ...(behaviorParams[a!.name] ?? {}) }} onChange={(v) => setBehaviorParams((p) => ({ ...p, [a!.name]: v }))} />
      ))}
      {chainMode && (
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-[11px] text-muted-fg">chain:</span>
          {chain.length ? chain.map((a, i) => <span key={i} className="text-[11px] font-mono">{(i ? '→ ' : '') + a}</span>) : <span className="text-[11px] text-muted-fg">click behaviors to append</span>}
          <button type="button" className={behaviorButton(false)} disabled={!chain.length} onClick={() => handle.playTimeline(defineTimeline(chain.map((a) => ({ behavior: a, params: paramsOf(a) }))))}>run</button>
          <button type="button" className={behaviorButton(false)} onClick={() => setChain([])}>clear</button>
        </div>
      )}
      {chainable && demoTimeline(behaviors) && (
        <button type="button" className={behaviorButton(false)} data-testid="timeline-demo" onClick={() => handle.playTimeline(demoTimeline(behaviors)!)}>
          <span className="text-[11px]">▶ Timeline demo (seamless hand-offs, scripted gaze + blink)</span>
        </button>
      )}
    </div>
  );
};

/** One modulated param of a preset, as read-only text. */
function describePresetParam(path: string, spec: { targets?: Record<string, unknown>; cycles?: Record<string, PresetCycle> }): string {
  const parts: string[] = [];
  const t = spec.targets?.[path];
  if (t !== undefined) parts.push(`→ ${typeof t === 'number' ? +t.toFixed(3) : String(t)}`);
  const c = spec.cycles?.[path];
  if (c) {
    const wave = c.wave ?? 'sine';
    const amp = wave === 'keyframes' ? `${c.keys?.length ?? 0} keys` : `±${+(c.amp ?? 1).toFixed(3)}`;
    parts.push(`${wave} ${amp} / ${+c.period.toFixed(2)}s${c.variation ? ` ~${c.variation}` : ''}`);
  }
  return parts.join(' · ');
}

/** Presets of any family (`handle.apply`) + the active preset's modulated params (read-only). */
export const PresetsPanel: React.FC<{ handle: UseAvatarHandleResult; presetNames: readonly string[]; family?: string; plugins: StudioPluginView }> = ({ handle, presetNames, family, plugins }) => {
  const active = handle.state?.defaultPreset ?? 'neutral';
  const spec = getPreset(active, family);
  const paths = spec ? Array.from(new Set([...Object.keys(spec.targets ?? {}), ...Object.keys(spec.cycles ?? {})])) : [];
  return (
    <div className={box}>
      <label className={heading}>Presets</label>
      <div className="grid grid-cols-3 gap-1.5" data-testid="avatar-presetNames">
        {presetNames.map((m) => {
          const s = getPreset(m, family);
          return (
            <button key={m} type="button" data-preset={m} title={s?.description} className={behaviorButton(active === m)} onClick={() => handle.apply(m)}>
              {s?.icon && <span className="text-xs shrink-0">{s.icon}</span>}
              <span className="truncate text-[11px]">{s?.label ?? m}</span>
              <PluginBadge plugin={plugins.badge('presets', m)} />
            </button>
          );
        })}
      </div>
      <label className={`${heading} mt-2`}>Modulated params · {spec?.label ?? active}</label>
      {paths.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10px] font-mono" data-testid="preset-params">
          {paths.map((p) => (
            <React.Fragment key={p}>
              <dt className="text-muted-fg truncate">{p}</dt>
              <dd className="truncate">{describePresetParam(p, spec!)}</dd>
            </React.Fragment>
          ))}
          {spec?.variations?.map((v, i) => (
            <React.Fragment key={`v${i}`}>
              <dt className="text-muted-fg truncate">{v.path}</dt>
              <dd className="truncate">{`now and then → ${String(v.value)} (${v.every[0]}–${v.every[1]}s, ${v.hold}s)`}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : (
        <span className="text-[11px] text-muted-fg">At rest: no params modulated.</span>
      )}
    </div>
  );
};

/** Runtime state + event log (runtime families). */
export const StatePanel: React.FC<{ catalog: StudioCatalogExtras; label: string }> = ({ catalog, label }) => {
  const st = catalog.handle.state;
  return (
    <div className={box} data-testid="avatar-state">
      <label className={heading}>State</label>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] font-mono">
        <dt className="text-muted-fg">{label}</dt>
        <dd>{catalog.preset?.name ?? '—'}</dd>
        <dt className="text-muted-fg">behavior</dt>
        <dd data-state-behavior>{st?.behavior ?? '—'}</dd>
        <dt className="text-muted-fg">preset</dt>
        <dd>{st?.preset ?? '—'} <span className="text-muted-fg">(rest: {st?.defaultPreset ?? '—'})</span></dd>
        <dt className="text-muted-fg">queue</dt>
        <dd>{st?.queue.length ? st.queue.join(' → ') : '—'}</dd>
      </dl>
      <label className={`${heading} mt-2`}>Events</label>
      <ul className="text-[10px] font-mono text-muted-fg space-y-0.5 min-h-[4rem]">
        {catalog.log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
};

/** Size target selector (manifest `stage.sizes`), Consona layout. */
export const SizeBar: React.FC<{ manifest: AvatarStudioManifest; sizes: StudioSizeBinding; Stage: React.FC<StageProps>; fallback: unknown }> = ({ manifest, sizes, Stage, fallback }) => {
  const items = manifest.stage.sizes!;
  const active = sizes.active;
  return (
    <Card variant="default" padding="md" className="border-border/80 bg-surface/30 backdrop-blur-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3 px-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-fg">Avatar Example Selection</span>
            <UiBadge intent="primary" size="sm" className="font-mono text-[10px] uppercase">
              Active: {active}
            </UiBadge>
          </div>
          <p className="text-xs text-muted-fg mt-0.5">Select an avatar instance to load and fine-tune its parametric configuration in the editor below.</p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          {sizes.onReset && (
            <Button size="sm" intent="outline" className="h-8 text-xs px-3 font-medium" onClick={sizes.onReset}>
              Reset {active === 'all' ? 'All' : active}
            </Button>
          )}
          {active !== 'all' && sizes.onResetAll && (
            <Button size="sm" intent="plain" className="h-8 text-xs px-2.5 text-muted-fg hover:text-fg" onClick={sizes.onResetAll}>
              Reset All
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => {
          const sel = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => sizes.select(item.id)}
              className={`flex items-center gap-3.5 p-3 rounded-xl border text-left transition-all cursor-pointer select-none ${
                sel ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/20 shadow-sm' : 'bg-surface/60 border-border/60 hover:bg-surface hover:border-border text-muted-fg hover:text-fg'
              }`}
            >
              <div className="w-11 h-11 rounded-lg bg-bg/80 border border-border/60 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
                <Stage id={`example-preview-${item.id}`} size={item.thumb ?? 36} model={sizes.values[item.id] ?? fallback} interactive={false} />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs font-bold truncate ${sel ? 'text-primary' : 'text-fg'}`}>{item.title}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border/50 text-muted-fg">{item.label}</span>
                </div>
                <span className="text-[11px] text-muted-fg leading-tight truncate mt-0.5">{item.description}</span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
};
