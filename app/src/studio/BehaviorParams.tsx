import React from 'react';
import type { BehaviorDefinition, BehaviorParam } from '@consona/avatar-enhanced/core/index.ts';

const chip = (active = false) =>
  `px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors ${
    active ? 'bg-primary text-primary-fg border-primary font-bold' : 'border-border/70 bg-surface/80 text-fg hover:border-primary/50'
  }`;
const input = 'w-16 rounded-md border border-border/70 bg-surface/80 px-1.5 py-0.5 text-[11px] font-mono text-fg focus:outline-none focus:border-primary';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Auto-generated editors for an behavior's `params` hints (e.g. spin axis / turns / duration / easing). */
export const BehaviorParams: React.FC<{
  behavior: BehaviorDefinition;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}> = ({ behavior, value, onChange }) => {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  const field = (k: string, p: BehaviorParam) => {
    const v = value[k] ?? p.default;
    if (p.kind === 'vector3') {
      const vec = (Array.isArray(v) ? v : p.default) as [number, number, number];
      return (
        <div key={k} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-fg w-14">{p.label ?? k}</span>
          {Object.entries(p.presets ?? {}).map(([name, pv]) => (
            <button key={name} data-axis={name} className={chip(same(vec, pv))} onClick={() => set(k, [...pv])}>
              {name}
            </button>
          ))}
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              id={`param-${behavior.name}-${k}-${i}`}
              type="number"
              step={0.1}
              className={input}
              value={vec[i]}
              onChange={(e) => {
                const n = [...vec] as [number, number, number];
                n[i] = Number(e.target.value);
                set(k, n);
              }}
            />
          ))}
        </div>
      );
    }
    if (p.kind === 'select') {
      return (
        <label key={k} className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-fg w-14">{p.label ?? k}</span>
          <select id={`param-${behavior.name}-${k}`} className={input + ' w-auto'} value={String(v)} onChange={(e) => set(k, e.target.value)}>
            {p.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    }
    if (p.kind === 'text') {
      return (
        <label key={k} className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-fg w-14">{p.label ?? k}</span>
          <input id={`param-${behavior.name}-${k}`} type="text" className={input + ' w-56'} value={String(v)} onChange={(e) => set(k, e.target.value)} />
        </label>
      );
    }
    return (
      <label key={k} className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-fg w-14">{p.label ?? k}</span>
        <input id={`param-${behavior.name}-${k}`} type="number" className={input} min={p.min} max={p.max} step={p.step ?? 0.1} value={Number(v)} onChange={(e) => set(k, Number(e.target.value))} />
      </label>
    );
  };
  return (
    <div className="flex flex-col gap-1.5 mt-2" data-behavior-params={behavior.name}>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-fg">{behavior.name} options</span>
      {Object.entries(behavior.params ?? {}).map(([k, p]) => field(k, p))}
    </div>
  );
};
