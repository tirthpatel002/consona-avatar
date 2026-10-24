import React, { useEffect, useState } from 'react';
import { AVATAR_ANCHORS, type AvatarEventRequest } from '@consona/avatar-enhanced/core/index.ts';
import type { UseAvatarHandleResult } from '@consona/avatar-enhanced/react/useAvatarHandle.ts';
import { behaviorButton, box, heading, Slider } from './controls';
import type { StudioPluginView } from './plugins';

/** Plugin badge on items a plugin contributes. */
export const PluginBadge: React.FC<{ plugin: string | null }> = ({ plugin }) =>
  plugin ? (
    <span data-plugin={plugin} className="shrink-0 text-[9px] font-mono px-1 py-px rounded bg-primary/10 text-primary border border-primary/20">
      {plugin}
    </span>
  ) : null;

/** Every channel of the live avatar (core + family + plugin): slider, clear, plugin quick picks (`handle.set`). */
export const ChannelsPanel: React.FC<{ handle: UseAvatarHandleResult; plugins: StudioPluginView }> = ({ handle, plugins }) => {
  const [instant, setInstant] = useState(false);
  const specs = handle.state ? handle.handle()?.channels ?? [] : [];
  const values = handle.state?.channels ?? {};
  const set = (id: string, v: number | null) => handle.set(id, v, { immediate: instant });
  return (
    <div className={box} data-testid="avatar-channels">
      <div className="flex items-center justify-between">
        <label className={heading}>Channels</label>
        <label className="flex items-center gap-2 text-[11px] text-muted-fg">
          <input type="checkbox" checked={instant} onChange={(e) => setInstant(e.target.checked)} className="accent-[var(--primary)]" />
          apply instantly (no ease)
        </label>
      </div>
      {specs.map((s) => {
        const rhythm = s.kind === 'rhythm';
        const min = s.min ?? (rhythm ? 40 : 0), max = s.max ?? (rhythm ? 160 : 1);
        const v = values[s.id];
        const marks = plugins.marks[s.id];
        return (
          <div key={s.id} className="flex flex-col gap-1" data-channel={s.id}>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Slider label={s.label ?? s.id} value={v ?? min} min={min} max={max} step={rhythm ? 1 : 0.01} unit={rhythm ? ' /min' : ''} onChange={(x) => set(s.id, x)} />
              </div>
              <PluginBadge plugin={plugins.badge('channels', s.id)} />
              <button type="button" className={behaviorButton(false)} onClick={() => set(s.id, null)}>
                <span className="text-[11px]">clear</span>
              </button>
            </div>
            {marks && (
              <div className="flex flex-wrap items-center gap-1.5">
                {marks.map((m) => (
                  <button key={m.label} type="button" data-mark={m.label} className={behaviorButton(v !== undefined && Math.abs(v - m.value) < 1e-6)} onClick={() => set(s.id, m.value)}>
                    <span className="text-[11px]">{m.label}</span>
                  </button>
                ))}
                <PluginBadge plugin={marks[0]!.plugin} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** Atoms of the live avatar (family + plugin), attached / detached at an anchor (`handle.attach`). */
export const AtomsAttachPanel: React.FC<{ handle: UseAvatarHandleResult; plugins: StudioPluginView }> = ({ handle, plugins }) => {
  const [anchor, setAnchor] = useState('');
  const [, refresh] = useState(0);
  const h = handle.state ? handle.handle() : null;
  if (!h || !h.atoms.length) return null;
  const on = (id: string) => h.attached.some((a) => a.id === id);
  const toggle = (id: string) => {
    if (on(id)) handle.detach(id);
    else handle.attach(id, anchor || undefined);
    refresh((n) => n + 1);
  };
  return (
    <div className={box} data-testid="avatar-attach">
      <div className="flex items-center justify-between gap-2">
        <label className={heading}>Atoms at anchors</label>
        <select value={anchor} onChange={(e) => setAnchor(e.target.value)} className="rounded-md border border-border/70 bg-surface/80 px-2 py-0.5 text-[11px] text-fg">
          <option value="">own anchor</option>
          {AVATAR_ANCHORS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {h.atoms.map((id) => (
          <button key={id} type="button" data-atom={id} className={behaviorButton(on(id))} onClick={() => toggle(id)}>
            <span className="truncate text-[11px]">{id}</span>
            <PluginBadge plugin={plugins.badge('atoms', id)} />
          </button>
        ))}
      </div>
    </div>
  );
};

const CORE_EFFECTS: readonly { id: string; label: string; event: AvatarEventRequest }[] = [
  { id: 'sparkles', label: 'Sparkles', event: { type: 'effect', kind: 'sparkles' } },
  { id: 'ripple', label: 'Ripple', event: { type: 'effect', kind: 'ripple' } },
];

/** Speech bubble: `handle.emit({ type: 'message', text })` (optionally auto-dismissed; `text: null` clears). */
const MessageRow: React.FC<{ handle: UseAvatarHandleResult }> = ({ handle }) => {
  const [text, setText] = useState('Hi! How are you feeling today?');
  const message = handle.state?.message;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="avatar-say">
      <span className="text-[11px] text-muted-fg">Message</span>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && text && handle.emit({ type: 'message', text })}
        className="flex-1 min-w-[10rem] rounded-md border border-border/70 bg-surface/80 px-2 py-0.5 text-[11px] text-fg focus:outline-none focus:border-primary"
      />
      <button type="button" data-say="hold" className={behaviorButton(false)} disabled={!text} onClick={() => handle.emit({ type: 'message', text })}>
        <span className="text-[11px]">emit</span>
      </button>
      <button type="button" data-say="3s" className={behaviorButton(false)} disabled={!text} onClick={() => handle.emit({ type: 'message', text, duration: 3 })}>
        <span className="text-[11px]">emit 3s</span>
      </button>
      <button type="button" data-say="clear" className={behaviorButton(false)} disabled={!message} onClick={() => handle.emit({ type: 'message', text: null })}>
        <span className="text-[11px]">clear</span>
      </button>
    </div>
  );
};

interface CueView {
  behavior: string;
  cue: string;
  data: Record<string, unknown>;
  done: boolean;
}

/** Latest behavior cue (from `cue` events only, never per frame): label, step i / n and beat dots when the data carries them. */
const CueReadout: React.FC<{ handle: UseAvatarHandleResult }> = ({ handle }) => {
  const [cue, setCue] = useState<CueView | null>(null);
  const h = handle.handle();
  useEffect(() => {
    if (!h) return;
    return h.subscribe((e) => {
      if (e.type === 'cue') {
        const data = (e.data ?? {}) as Record<string, unknown>;
        setCue((c) => (e.cue === 'beat' && c?.behavior === e.behavior ? { ...c, data: { ...c.data, ...data } } : { behavior: e.behavior, cue: e.cue, data, done: e.cue === 'complete' }));
      } else if (e.type === 'end' && e.interrupted) setCue((c) => (c?.behavior === e.behavior ? null : c));
    });
  }, [h]);
  if (!cue) return <span className="text-[11px] text-muted-fg">No cues yet: behaviors announce steps here.</span>;
  const d = cue.data, beats = Number(d.beats ?? 0), beat = Number(d.beat ?? 0);
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-surface/70 p-2.5" data-testid="cue-readout">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-fg">
        {cue.behavior} · {cue.cue}
        {d.count !== undefined && ` · step ${Number(d.index ?? 0) + 1} / ${Number(d.count)}`}
      </span>
      {(d.label ?? d.id) !== undefined && <span className="text-sm font-semibold text-fg">{String(d.label ?? d.id)}</span>}
      {beats > 0 && !cue.done && <span className="text-[11px] font-mono text-primary">{'●'.repeat(beat) + '○'.repeat(Math.max(0, beats - beat))}</span>}
    </div>
  );
};

/** Events: messages, effects (core + plugin), cue readout. */
export const EventsPanel: React.FC<{ handle: UseAvatarHandleResult; plugins: StudioPluginView }> = ({ handle, plugins }) => (
  <div className={box} data-testid="avatar-events">
    <label className={heading}>Events</label>
    <MessageRow handle={handle} />
    <div className="grid grid-cols-3 gap-1.5">
      {[...CORE_EFFECTS.map((e) => ({ ...e, plugin: null as string | null })), ...plugins.events].map((e) => (
        <button key={`${e.plugin ?? 'core'}:${e.id}`} type="button" data-event={e.id} className={behaviorButton(false)} onClick={() => handle.emit({ ...e.event })}>
          <span className="truncate text-[11px]">{e.label}</span>
          <PluginBadge plugin={e.plugin} />
        </button>
      ))}
    </div>
    <label className={`${heading} mt-2`}>Cues</label>
    <CueReadout handle={handle} />
  </div>
);
