import React, { memo, useMemo } from 'react';
import type { AvatarControlState, AvatarStudioBadge } from '@consona/avatar-enhanced/core/index.ts';

/** Consona studio design tokens (the curated reference), shared by every family. */
export const heading = 'text-xs font-semibold text-fg uppercase tracking-wider';
export const box = 'flex flex-col gap-2 p-3.5 rounded-xl bg-surface/40 border border-border/60 w-full shrink-0';
export const tileClass = (selected: boolean) =>
  `flex flex-col items-center gap-2 p-2.5 sm:p-3 rounded-xl border transition-all w-full ${
    selected
      ? 'bg-primary/5 border-primary/20 text-primary font-bold ring-1 ring-primary/5 ring-offset-1 ring-offset-bg shadow-sm'
      : 'bg-surface/50 border-border/60 hover:bg-surface hover:border-border text-muted-fg hover:text-fg'
  }`;
export const behaviorButton = (active: boolean) =>
  `flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all border shadow-xs select-none ${
    active
      ? 'bg-primary text-primary-fg border-primary scale-105 ring-2 ring-primary/30 font-bold'
      : 'bg-surface/80 border-border/70 hover:bg-surface hover:border-primary/50 text-fg/90 active:scale-95'
  }`;

export const SLIDER_CSS = `
  .consona-editor-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%;
    background: #ffffff; border: 2.5px solid var(--primary, #3B82F6); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .consona-editor-slider::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2); }
  .consona-editor-slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%; background: #ffffff; border: 2.5px solid var(--primary, #3B82F6);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); cursor: pointer;
  }
`;

export const Badge: React.FC<{ badge: AvatarStudioBadge }> = ({ badge }) => {
  if (badge.tone === 'on' || badge.tone === 'off') {
    const on = badge.tone === 'on';
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-bold border ${on ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-surface border-border text-muted-fg'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-primary animate-pulse' : 'bg-muted-fg/40'}`} />
        {badge.text}
      </span>
    );
  }
  if (badge.tone === 'chip') return <span className="text-[11px] font-mono text-primary font-bold px-2 py-0.5 rounded bg-primary/10 border border-primary/20">{badge.text}</span>;
  return <span className="text-[11px] font-mono text-primary font-bold capitalize px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">{badge.text}</span>;
};

/** Parametric slider with live numeric feedback. */
export const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; unit?: string; scale?: number; onChange: (v: number) => void }> = ({
  label, value, min, max, step = 0.01, unit = '', scale = 1, onChange,
}) => {
  const safe = Number.isFinite(value) ? value : min;
  const pct = Math.max(0, Math.min(100, ((safe - min) / (max - min)) * 100));
  const m = safe * scale;
  const shown =
    unit === '°' ? `${m >= 0 ? '+' : ''}${Math.round(m)}°` : unit === '%' ? `${Math.round(m)}%` : unit === 'x' ? `${m.toFixed(2)}x` : `${m.toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}${unit}`;
  return (
    <div className="flex flex-col gap-2 w-full min-w-0 p-3 rounded-xl bg-surface/40 border border-border/50 hover:border-border/80 transition-all">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-fg/90 truncate">{label}</span>
        <span className="font-mono text-[11px] font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/25 shadow-xs shrink-0 ml-2">{shown}</span>
      </div>
      <div className="relative flex items-center w-full py-1">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={safe}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ background: `linear-gradient(to right, var(--primary, #3B82F6) ${pct}%, rgba(120, 120, 128, 0.25) ${pct}%)` }}
          className="consona-editor-slider w-full h-2 rounded-full appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-fg/70 px-0.5">
        <span>{`${min * scale}${unit}`}</span>
        <span>{`${max * scale}${unit}`}</span>
      </div>
    </div>
  );
};

/** Clickable feature card (toggles). */
export const FeatureCard: React.FC<{ label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, description, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex flex-col items-start gap-1 p-3.5 rounded-xl border text-left transition-all cursor-pointer select-none w-full min-w-0 ${
      checked
        ? 'bg-primary/5 border-primary/20 text-primary font-bold ring-1 ring-primary/10 ring-offset-1 ring-offset-bg shadow-sm'
        : 'bg-surface/50 border-border/60 hover:bg-surface hover:border-border text-muted-fg hover:text-fg'
    }`}
  >
    <span className={`text-xs font-semibold ${checked ? 'text-primary' : 'text-fg'}`}>{label}</span>
    {description ? <span className="text-[11px] text-muted-fg leading-tight">{description}</span> : null}
  </button>
);

const BUTTON_GRID: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
};
const buttonGrid = (n: number) => BUTTON_GRID[n] ?? 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6';

export const Segmented: React.FC<{ control: AvatarControlState<any> & { kind: 'select' }; onChange: (v: unknown) => void }> = ({ control, onChange }) => (
  <div className="flex items-center gap-1 bg-surface/80 p-1 rounded-lg border border-border/60">
    {control.options.map((o) => (
      <button
        key={o.value}
        type="button"
        title={o.description}
        onClick={() => onChange(o.value)}
        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
          control.value === o.value ? 'bg-primary text-primary-fg shadow-xs font-bold ring-1 ring-primary/40' : 'text-muted-fg hover:text-fg hover:bg-surface/60'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** Select rendered as buttons / cards / swatches / dropdown. Unlabelled selects are the block's main picker (larger buttons). */
const SelectField: React.FC<{ control: AvatarControlState<any> & { kind: 'select' }; onChange: (v: unknown) => void }> = ({ control, onChange }) => {
  const display = control.display ?? 'dropdown';
  const grid = buttonGrid(control.options.length);
  if (display === 'swatches')
    return (
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6 gap-2 pt-1">
        {control.options.map((o) => {
          const sel = control.value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              title={o.label}
              onClick={() => onChange(o.value)}
              className={`flex flex-col items-center gap-1.5 p-1.5 rounded-xl border transition-all ${
                sel ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/20 ring-offset-2 ring-offset-bg shadow-sm scale-105' : 'bg-surface/50 border-border/60 hover:bg-surface hover:border-border'
              }`}
            >
              <span className={`w-5 h-5 rounded-full border shadow-xs shrink-0 transition-transform ${sel ? 'border-primary ring-1 ring-white/50 scale-110' : 'border-black/15'}`} style={{ backgroundColor: o.swatch }} />
              <span className={`text-[10px] truncate w-full text-center ${sel ? 'font-bold text-primary' : 'font-medium text-fg/80'}`}>{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  if (display === 'buttons') {
    const main = !control.label;
    const picker = (
      <div className={`grid ${grid} ${main ? 'gap-2 sm:gap-2.5' : 'gap-2'} w-full`}>
        {control.options.map((o) => {
          const sel = control.value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              title={o.description}
              onClick={() => onChange(o.value)}
              className={
                main
                  ? `px-3 py-2 rounded-xl text-xs font-semibold transition-all border text-center ${sel ? 'bg-primary text-primary-fg border-primary font-bold shadow-xs' : 'bg-surface/70 border-border/70 hover:bg-surface text-muted-fg hover:text-fg'}`
                  : `px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border text-center ${sel ? 'bg-primary text-primary-fg border-primary font-bold shadow-xs' : 'bg-surface/80 border-border/60 hover:bg-surface text-muted-fg hover:text-fg'}`
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
    if (main) return picker;
    return (
      <div className="flex flex-col gap-1.5 pt-1 w-full">
        <span className="text-xs font-medium text-fg/80">{control.label}:</span>
        {picker}
      </div>
    );
  }
  if (display === 'cards')
    return (
      <div className={`grid ${grid} gap-2 w-full`}>
        {control.options.map((o) => {
          const sel = control.value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              title={o.description}
              onClick={() => onChange(o.value)}
              className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all ${
                sel ? 'bg-primary text-primary-fg border-primary font-bold shadow-xs ring-1 ring-primary/20' : 'bg-surface/50 border-border/60 hover:bg-surface text-muted-fg hover:text-fg'
              }`}
            >
              <span className="text-xs font-semibold">{o.label}</span>
              {o.description && <span className={`text-[10px] ${sel ? 'text-primary-fg/80' : 'text-muted-fg'} truncate w-full`}>{o.description.split(' ')[0]}</span>}
            </button>
          );
        })}
      </div>
    );
  if (display === 'segmented')
    return (
      <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface/40 border border-border/50">
        <span className="text-xs font-medium text-fg/90 truncate">{control.label}</span>
        <Segmented control={control} onChange={onChange} />
      </div>
    );
  return (
    <label className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface/40 border border-border/50 hover:border-border/80 transition-all min-w-0">
      <span className="text-xs font-medium text-fg/90 truncate">{control.label}</span>
      <select
        value={String(control.value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-surface/80 border border-border/70 rounded-lg px-2 py-1 text-fg focus:outline-none focus:border-primary max-w-[60%]"
      >
        {control.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
};

/** One control, any kind. */
export const ControlField = memo<{ control: AvatarControlState<any>; onChange: (v: unknown) => void }>(function ControlField({ control, onChange }) {
  switch (control.kind) {
    case 'range':
      return <Slider label={control.label} value={Number(control.value ?? control.min)} min={control.min} max={control.max} step={control.step} unit={control.unit} scale={control.scale} onChange={onChange} />;
    case 'toggle':
      return <FeatureCard label={control.label} description={control.description} checked={!!control.value} onChange={onChange} />;
    case 'color':
      return (
        <label className="flex items-center justify-between gap-2 p-3 rounded-xl bg-surface/40 border border-border/50 hover:border-border/80 transition-all min-w-0">
          <span className="text-xs font-medium text-fg/90 truncate">{control.label}</span>
          <input type="color" value={String(control.value ?? '#ffffff')} onChange={(e) => onChange(e.target.value)} className="w-9 h-7 rounded-md border border-border/60 bg-transparent cursor-pointer" />
        </label>
      );
    case 'select':
      return <SelectField control={control} onChange={onChange} />;
  }
});

const GRID: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' };
const CARD_GRID: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3' };
const inGrid = (c: AvatarControlState<any>) => c.kind !== 'select' || c.display === undefined || c.display === 'dropdown' || c.display === 'segmented';

/**
 * A titled block of controls (Consona section layout): header with badge /
 * segmented pickers, grid-able controls in `columns`, pickers full width.
 */
export const ControlBlock = memo(function ControlBlock({
  title,
  controls,
  columns = 2,
  badgeText,
  badgeTone,
  onChange,
}: {
  title: string;
  controls: AvatarControlState<any>[];
  columns?: number;
  badgeText?: string;
  badgeTone?: AvatarStudioBadge['tone'];
  /** Stable (path, value) setter. */
  onChange: (path: string, v: unknown) => void;
}) {
  const badge = badgeText !== undefined ? { text: badgeText, tone: badgeTone } : null;
  // segmented pickers sit in the block header (e.g. Accent & Shade → Light / Dark)
  const headerPickers = controls.filter((c) => c.kind === 'select' && c.display === 'segmented');
  const runs = useMemo(() => {
    const out: { grid: boolean; items: AvatarControlState<any>[] }[] = [];
    for (const c of controls) {
      if (c.kind === 'select' && c.display === 'segmented') continue;
      const g = inGrid(c);
      const last = out[out.length - 1];
      if (last && last.grid === g && g) last.items.push(c);
      else out.push({ grid: g, items: [c] });
    }
    return out;
  }, [controls]);
  if (!controls.length) return null;
  const allCards = (items: AvatarControlState<any>[]) => items.every((c) => c.kind === 'toggle');
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between">
        <span className={heading}>{title}</span>
        {badge && <Badge badge={badge} />}
        {headerPickers.map((c) => (c.kind === 'select' ? <Segmented key={c.path} control={c} onChange={(v) => onChange(c.path, v)} /> : null))}
      </div>
      {runs.map((r, i) =>
        r.grid ? (
          <div key={i} className={`grid ${allCards(r.items) ? `${CARD_GRID[columns] ?? CARD_GRID[2]} gap-3.5` : `${GRID[columns] ?? GRID[2]} gap-3 sm:gap-3.5`} w-full`}>
            {r.items.map((c) => (
              <BoundControl key={`${c.group}:${c.path}`} control={c} onChange={onChange} />
            ))}
          </div>
        ) : (
          r.items.map((c) => <BoundControl key={`${c.group}:${c.path}`} control={c} onChange={onChange} />)
        ),
      )}
    </div>
  );
});

/** Control bound to a (path, value) setter; memoized on the control state + setter identity. */
const BoundControl = memo(function BoundControl({ control, onChange }: { control: AvatarControlState<any>; onChange: (path: string, v: unknown) => void }) {
  const set = useMemo(() => (v: unknown) => onChange(control.path, v), [onChange, control.path]);
  return <ControlField control={control} onChange={set} />;
});
