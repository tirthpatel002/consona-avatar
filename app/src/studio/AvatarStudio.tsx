import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listAvatarPresetNames } from '@consona/avatar-enhanced/core/index.ts';
import type {
  AvatarStudioConfigSource,
  AvatarStudioItem,
  AvatarStudioManifest,
  ResolvedAvatarDefinition,
} from '@consona/avatar-enhanced/core/index.ts';
import { ControlBlock, SLIDER_CSS } from './controls';
import { BehaviorsPanel, AtomBlock, PresetsPanel, PresetPicker, SharePanel, SizeBar, StatePanel } from './panels';
import { useAvatarHandle } from '@consona/avatar-enhanced/react/useAvatarHandle.ts';
import { AvatarMessageBubble } from '@consona/avatar-enhanced/react/AvatarMessageBubble.ts';
import { stageAdapter, type StageRuntime } from './stages';
import { SnapshotButton } from './SnapshotButton';
import { AtomsAttachPanel, ChannelsPanel, EventsPanel } from './livePanels';
import { attachStudioPlugins, studioPluginView } from './plugins';
import { useCatalogStudio } from './useCatalogStudio';
import { useConfigStudio } from './useConfigStudio';
import type { StudioModel, StudioSizeBinding } from './types';

export interface AvatarStudioProps {
  manifest: AvatarStudioManifest<any>;
  /** Config sources: the edited model (owned by the app, e.g. persisted per size target). */
  config?: { value: unknown; onChange: (next: any) => void; sizes?: StudioSizeBinding };
  /** Register / clear this studio's blink trigger for the app header. */
  onRegisterBlink?: (trigger: (() => void) | null) => void;
}

/**
 * The one studio for every family. Layout = the Consona avatar studio
 * (header · pinned stage · tabbed sections); what renders comes from the
 * family's manifest; the stage adapter comes from the family renderer.
 */
export const AvatarStudio: React.FC<AvatarStudioProps> = (props) =>
  props.manifest.source.kind === 'config' ? <ConfigStudio {...props} /> : <CatalogStudio {...props} />;

const ConfigStudio: React.FC<AvatarStudioProps> = ({ manifest, config, onRegisterBlink }) => {
  if (!config) throw new Error(`AvatarStudio(${manifest.id}): config source needs the \`config\` prop`);
  const studio = useConfigStudio(manifest, config.value, config.onChange);
  return <StudioView manifest={manifest} studio={studio} sizes={config.sizes} onRegisterBlink={onRegisterBlink} />;
};

const CatalogStudio: React.FC<AvatarStudioProps> = ({ manifest, onRegisterBlink }) => {
  const studio = useCatalogStudio(manifest);
  if (!studio.catalog?.preset) {
    return (
      <div className="rounded-2xl border border-border/80 bg-surface/30 p-4">
        <p className="text-sm text-muted-fg">
          No {manifest.label} presets registered. Add an avatar package under <code>src/avatars/&lt;name&gt;/three</code>.
        </p>
      </div>
    );
  }
  return <StudioView manifest={manifest} studio={studio} onRegisterBlink={onRegisterBlink} />;
};

const StudioView: React.FC<{ manifest: AvatarStudioManifest<any>; studio: StudioModel; sizes?: StudioSizeBinding; onRegisterBlink?: AvatarStudioProps['onRegisterBlink'] }> = ({
  manifest,
  studio,
  sizes,
  onRegisterBlink,
}) => {
  const Stage = stageAdapter(manifest.renderer);
  const stageId = `${manifest.id}-studio-stage`;
  const size = manifest.stage.sizes?.find((s) => s.id === sizes?.active) ?? manifest.stage.sizes?.[0];
  const px = size?.px ?? 280;
  const configSource = manifest.source.kind === 'config' ? (manifest.source as AvatarStudioConfigSource<any>) : null;

  // header blink → this studio's avatar
  const blink = studio.catalog?.handle.blink;
  useEffect(() => {
    if (!onRegisterBlink) return;
    onRegisterBlink(() => (blink ? blink() : configSource?.blink?.(stageId)));
    return () => onRegisterBlink(null);
  }, [onRegisterBlink, blink, configSource, stageId]);

  const title = sizes && size
    ? `${manifest.title ?? manifest.label} (${size.id === 'all' ? 'All Targets' : size.id.toUpperCase()} • ${px}px)`
    : manifest.title ?? manifest.label;

  return (
    <div className="flex flex-col gap-6 w-full">
      {sizes && manifest.stage.sizes && <SizeBar manifest={manifest} sizes={sizes} Stage={Stage} fallback={studio.model} />}
      {/* overflow-clip (not hidden) so the pinned stage can stick to the viewport */}
      <div className="w-full min-h-[640px] rounded-2xl border border-border/80 shadow-md overflow-clip bg-bg">
        <StudioEditor key={`${sizes?.active ?? manifest.id}-${px}`} manifest={manifest} studio={studio} Stage={Stage} stageId={stageId} px={px} title={title} />
      </div>
    </div>
  );
};

const StudioEditor: React.FC<{
  manifest: AvatarStudioManifest<any>;
  studio: StudioModel;
  Stage: ReturnType<typeof stageAdapter>;
  stageId: string;
  px: number;
  title: string;
}> = ({ manifest, studio, Stage, stageId, px, title }) => {
  const [tab, setTab] = useState(manifest.sections[0]?.id ?? '');
  const src = manifest.source.kind === 'config' ? (manifest.source as AvatarStudioConfigSource<any>) : null;
  const catalog = studio.catalog;
  const large = manifest.stage.size === 'large';

  // the stage avatar's unified handle: catalog families own one; config families get theirs by stage id
  const configHandle = useAvatarHandle();
  const bindConfigHandle = configHandle.ref;
  useEffect(() => {
    if (!src?.handle) return;
    bindConfigHandle(src.handle(stageId));
    return () => bindConfigHandle(null);
  }, [src, stageId, bindConfigHandle]);
  const handle = catalog?.handle ?? (src?.handle ? configHandle : null);
  const liveFamily = catalog?.preset ? (studio.model as ResolvedAvatarDefinition | null)?.family : manifest.families[0];
  // the live avatar's own lists (family + attached plugins); registry lists until it mounts
  const live = handle?.state ? handle.handle() : null;
  const behaviors = live?.behaviors ?? catalog?.behaviors ?? [];
  const presetNames = live?.presets ?? catalog?.presetNames ?? listAvatarPresetNames(liveFamily);

  // plugins the family declares, attached per avatar (again after the avatar is re-created)
  const attachedKey = live?.plugins.join(',') ?? '';
  useEffect(() => {
    if (live) void attachStudioPlugins(live, liveFamily, manifest.renderer);
  }, [live, liveFamily, manifest.renderer]);
  const plugins = useMemo(() => studioPluginView(attachedKey ? attachedKey.split(',') : [], liveFamily), [attachedKey, liveFamily]);

  const badges = src?.stageBadges
    ? src.stageBadges(studio.model)
    : catalog
      ? [
          { text: catalog.preset?.name ?? '—', tone: 'on' as const },
          { text: catalog.handle.state?.behavior ?? 'idle', tone: 'chip' as const },
        ]
      : [];

  // stable per-group control lists: a group whose values didn't change keeps its array (memoized blocks skip)
  const byGroup = useStableGroups(studio.controls);
  const controlsOf = (groups: string[]) => (groups.length === 1 ? byGroup.get(groups[0]!) ?? EMPTY : groups.flatMap((g) => byGroup.get(g) ?? EMPTY));
  const groupNames = () => Array.from(byGroup.keys());

  // runtime hooks for the stage (stable → the memoized stage only re-renders on a new model)
  const runtime = useMemo<StageRuntime | undefined>(
    () => (catalog ? { ref: catalog.handle.ref, onEvent: catalog.onEvent, clickBehavior: catalog.clickBehavior } : undefined),
    [catalog?.handle.ref, catalog?.onEvent, catalog?.clickBehavior],
  );

  const renderItem = (item: AvatarStudioItem<any>, i: number): React.ReactNode => {
    switch (item.type) {
      case 'divider':
        return <div key={i} className="h-px bg-border/50" />;
      case 'atoms': {
        const atom = studio.atoms.find((a) => a.id === item.atom);
        if (!atom) return null;
        return (
          <AtomBlock
            key={i}
            atom={atom}
            title={item.title}
            columns={item.columns}
            preview={manifest.previews === 'live' && src?.preview && studio.previewWith ? (a, id) => src.preview!(studio.previewWith!(a, id), 52) : undefined}
            onSelect={studio.selectAtom}
          />
        );
      }
      case 'composer':
        if (!studio.atoms.length) return null;
        return (
          <div key={i} className="flex flex-col gap-6 w-full" data-testid="avatar-composer">
            {studio.atoms.map((atom) => (
              <AtomBlock key={atom.id} atom={atom} onSelect={studio.selectAtom} />
            ))}
            {catalog && (
              <button type="button" className="self-end text-[11px] text-primary hover:underline font-medium" onClick={catalog.resetAtoms}>
                Reset atoms
              </button>
            )}
          </div>
        );
      case 'controls': {
        if (item.groups === '*') {
          return (
            <div key={i} className="flex flex-col gap-6 w-full" data-testid="avatar-controls">
              {groupNames().map((g) => (
                <ControlBlock key={g} title={g} controls={controlsOf([g])} columns={item.columns ?? 2} onChange={studio.setControl} />
              ))}
              {catalog && (
                <button type="button" className="self-end text-[11px] text-primary hover:underline font-medium" onClick={catalog.resetParams}>
                  Reset parameters
                </button>
              )}
            </div>
          );
        }
        return (
          <ControlBlock
            key={i}
            title={item.title ?? item.groups[0] ?? ''}
            controls={controlsOf(item.groups)}
            columns={item.columns}
            badgeText={item.badge?.(studio.model)?.text}
            badgeTone={item.badge?.(studio.model)?.tone}
            onChange={studio.setControl}
          />
        );
      }
      case 'channels':
        return handle ? (
          <React.Fragment key={i}>
            <ChannelsPanel handle={handle} plugins={plugins} />
            <PresetsPanel handle={handle} presetNames={presetNames} family={liveFamily} plugins={plugins} />
          </React.Fragment>
        ) : null;
      case 'attach':
        return handle ? <AtomsAttachPanel key={`${i}-${catalog?.preset?.id ?? ''}`} handle={handle} plugins={plugins} /> : null;
      case 'presets':
        return catalog ? <PresetPicker key={i} catalog={catalog} label={manifest.label} /> : null;
      case 'behaviors':
        return handle ? (
          <BehaviorsPanel
            key={`${i}-${catalog?.preset?.id ?? ''}`}
            handle={handle}
            behaviors={behaviors}
            def={catalog ? (studio.model as ResolvedAvatarDefinition | null) : null}
            chain={item.chain}
            modifiers={src?.behaviorParams}
            plugins={plugins}
          />
        ) : null;
      case 'events':
        return (
          <React.Fragment key={i}>
            {handle && <EventsPanel handle={handle} plugins={plugins} />}
            {catalog && <StatePanel catalog={catalog} label={manifest.label} />}
          </React.Fragment>
        );
    }
  };

  const active = manifest.sections.find((s) => s.id === tab) ?? manifest.sections[0];

  return (
    <div className="flex flex-col w-full bg-bg text-fg">
      <style>{SLIDER_CSS}</style>
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-b border-border/60 bg-surface/50 shrink-0 gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.6)] shrink-0" />
          <h2 className="text-xs sm:text-sm lg:text-base font-semibold tracking-tight text-fg truncate">{title}</h2>
          <span className="hidden sm:inline-flex text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface border border-border/60 text-muted-fg uppercase tracking-wider shrink-0">
            {manifest.renderer === 'three' ? 'Three.js' : 'Engine V2'}
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row w-full">
        {/* Left pane: the stage only, pinned while the sections scroll */}
        <div
          className={`w-full ${large ? 'lg:w-[520px] xl:w-[580px]' : 'lg:w-[360px] xl:w-[400px]'} shrink-0 border-b lg:border-b-0 lg:border-r border-border/60 bg-surface/20 flex flex-col p-4 sm:p-5 gap-4 lg:sticky lg:top-[72px] lg:self-start lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto`}
        >
          <div
            className={`relative rounded-2xl border border-border/80 bg-gradient-to-b from-surface/60 to-bg overflow-hidden shadow-inner shrink-0 ${
              large ? 'w-full aspect-square' : 'flex flex-col items-center justify-between p-4 min-h-[270px]'
            }`}
          >
            {/* status chips: overlaid on large (canvas) stages, a row above compact ones */}
            <div className={`flex items-center justify-between ${large ? 'absolute top-3 left-3 right-3 z-10 pointer-events-none' : 'w-full mb-1'}`}>
              {badges[0] && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-fg bg-surface/80 px-2.5 py-0.5 rounded-full border border-border/50">
                  <span className={`w-2 h-2 rounded-full ${badges[0].tone === 'on' ? 'bg-emerald-500 shadow-[0_0_6px_#10B981]' : 'bg-muted-fg/60'}`} />
                  {badges[0].text}
                </span>
              )}
              {badges[1] && <span className="text-[11px] font-mono font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">{badges[1].text}</span>}
            </div>
            {large ? (
              // the canvas fills the whole card; AvatarStage's ResizeObserver keeps renderer size + aspect in sync
              <div className="absolute inset-0">
                <Stage id={stageId} size={px} model={studio.model} runtime={runtime} zoom={manifest.stage.zoom} />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center my-2 drop-shadow-2xl">
                {/* Three renderers draw their own speech bubble; config (SVG) stages get the generic overlay here */}
                <div className="relative">
                  <Stage id={stageId} size={px} model={studio.model} runtime={runtime} zoom={manifest.stage.zoom} />
                  {src && <AvatarMessageBubble handle={configHandle.handle()} />}
                </div>
              </div>
            )}
          </div>
          {/* directly below the stage: hi-res transparent PNG of the current frame (Three stages) */}
          {catalog && manifest.renderer === 'three' && <SnapshotButton handle={catalog.handle} name={catalog.preset?.name ?? catalog.preset?.id ?? manifest.id} />}
          {(studio.share || studio.randomize) && <SharePanel share={studio.share} onRandomize={studio.randomize} />}
        </div>

        {/* Right pane: tabbed sections */}
        <div className="flex-1 min-w-0 flex flex-col bg-bg">
          <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-border/50 shrink-0 bg-bg/90 backdrop-blur-xl sticky top-14 z-10">
            <div className="grid p-1 rounded-xl bg-surface/70 border border-border/60 gap-1 w-full max-w-lg sm:max-w-none" style={{ gridTemplateColumns: `repeat(${manifest.sections.length}, minmax(0, 1fr))` }}>
              {manifest.sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setTab(s.id)}
                  className={`flex items-center justify-center py-2 px-2.5 sm:px-3 rounded-lg text-xs font-medium transition-all ${
                    active?.id === s.id ? 'bg-bg text-fg font-bold shadow-xs border border-border/60' : 'text-muted-fg hover:text-fg'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 w-full">
            {active && <div className="flex flex-col gap-6 w-full">{active.items.map(renderItem)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

const EMPTY: StudioModel['controls'] = [];
type Ctl = StudioModel['controls'][number];
const sameControls = (a: Ctl[], b: Ctl[]) =>
  a.length === b.length && a.every((c, i) => c.path === b[i]!.path && c.label === b[i]!.label && Object.is(c.value, b[i]!.value) && (c.kind !== 'select' || c.options.length === (b[i] as typeof c).options.length));

/** Group controls, reusing the previous array per group when nothing in it changed. */
function useStableGroups(controls: StudioModel['controls']): Map<string, Ctl[]> {
  const prev = useRef(new Map<string, Ctl[]>());
  return useMemo(() => {
    const next = new Map<string, Ctl[]>();
    for (const c of controls) next.set(c.group, [...(next.get(c.group) ?? []), c]);
    for (const [g, list] of next) {
      const old = prev.current.get(g);
      if (old && sameControls(old, list)) next.set(g, old);
    }
    prev.current = next;
    return next;
  }, [controls]);
}
