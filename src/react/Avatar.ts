import React, { forwardRef, lazy, memo, Suspense, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { AvatarHandle } from '../core/engine/AvatarHandle.ts';
import type { AvatarEvent } from '../core/animation/state-machine/AvatarStateMachine.ts';
import type { AvatarDefinition } from '../core/types/AvatarDefinition.ts';
import type { ResolvedAvatarDefinition } from '../core/define/resolveAvatar.ts';
import { resolveAvatarSource } from '../core/catalog/resolveAvatarSource.ts';
import { getAvatarFamily, installAvatarFamily, isAvatarFamilyInstalled } from '../core/catalog/catalog.ts';
import { useAvatarCatalog } from './useAvatarCatalog.ts';
import {
  defaultConfigFamily,
  getAvatarReactRenderer,
  registerAvatarReactRenderer,
  type AvatarReactRenderer,
  type AvatarRendererComponent,
} from './renderers/registry.ts';

const h = React.createElement;

/** Generic Three renderer for every `renderer: 'three'` family: a lazy chunk, so `three` is only fetched when one renders. */
registerAvatarReactRenderer('three', { load: () => import('./renderers/ThreeAvatar.ts') });

const lazyComponents = new WeakMap<AvatarReactRenderer, AvatarRendererComponent>();
function rendererComponent(entry: AvatarReactRenderer): AvatarRendererComponent {
  if (entry.component) return entry.component;
  let c = lazyComponents.get(entry);
  if (!c) lazyComponents.set(entry, (c = lazy(entry.load!)));
  return c;
}

/**
 * Per-family `config` types. Families augment this interface
 * (`declare module '…/react/Avatar.ts' { interface AvatarFamilyConfigs { myFamily: MyConfig } }`).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AvatarFamilyConfigs {}
export type AvatarFamilyConfig = [keyof AvatarFamilyConfigs] extends [never]
  ? Record<string, unknown>
  : AvatarFamilyConfigs[keyof AvatarFamilyConfigs];

export type AvatarPixelSize = number | { width: number; height: number };

export interface AvatarProps {
  /** Registered family id ('consona', 'allie', …); picks the renderer. */
  family?: string;
  /** Catalog preset id (implies its family). */
  preset?: string;
  /** Atom picks layered on the preset's composition (`{ eyes: 'button' }`). */
  composition?: Record<string, string>;
  /** Definition-driven families (Three): a full definition, or overrides merged onto `preset`. */
  definition?: AvatarDefinition | ResolvedAvatarDefinition | Partial<AvatarDefinition>;
  /** Config-driven families (e.g. Consona): the family config. */
  config?: AvatarFamilyConfig;
  /** Pixel size (square) or box. Default: renderer-defined (Consona 64px; Three fills its parent). */
  size?: AvatarPixelSize;
  /** Apparent-size multiplier (Three camera framing). */
  zoom?: number;
  /** Pointer interaction (SVG gaze follow / Three orbit). Default true. */
  interactive?: boolean;
  /** Background colour; null/omitted = transparent. */
  background?: string | null;
  /** Stable avatar id (default: generated). */
  id?: string;
  onEvent?: (event: AvatarEvent) => void;
  onClick?: (handle: AvatarHandle) => void;
  className?: string;
  style?: React.CSSProperties;
}

/** Load a family's renderer-side package (e.g. Three surfaces) once; true when ready. */
function useFamilyInstalled(family: string | undefined): boolean {
  const [ready, setReady] = useState(() => !family || isAvatarFamilyInstalled(family));
  useEffect(() => {
    if (!family || isAvatarFamilyInstalled(family)) {
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    installAvatarFamily(family).then(
      () => live && setReady(true),
      (err) => console.error(`[avatar] failed to install family "${family}"`, err),
    );
    return () => {
      live = false;
    };
  }, [family]);
  return ready;
}

/**
 * The avatar component for every family. The renderer comes from the
 * registered family (`svg` → Consona scene graph, `three` → WebGL rig, loaded
 * lazily). The ref is the unified `AvatarHandle`, whatever the renderer.
 *
 *   <Avatar family="consona" config={{ paletteId: 'ocean' }} size={96} />
 *   <Avatar ref={allie.ref} preset="allie-classic-sunny" size={320} onClick={(a) => a.play('jump')} />
 */
export const Avatar = memo(
  forwardRef<AvatarHandle, AvatarProps>(function Avatar(props, ref) {
    const { family, preset, composition, definition, config, size, zoom, interactive, background, onEvent, onClick, className, style } = props;
    const reactId = useId();
    const id = props.id ?? `avatar-${reactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const catalog = useAvatarCatalog();
    const compositionKey = composition ? JSON.stringify(composition) : '';
    const source = useMemo(
      () =>
        resolveAvatarSource({
          family: family ?? (config && !definition && !preset ? defaultConfigFamily((k) => !!getAvatarFamily(k)) : undefined),
          preset,
          composition,
          definition,
        }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [family, preset, compositionKey, definition, config === undefined, catalog],
    );
    const entry = getAvatarReactRenderer(source.family, source.renderer);
    if (!entry) throw new Error(`<Avatar>: no React renderer registered for family "${source.family}" (renderer "${source.renderer}")`);
    const ready = useFamilyInstalled(source.family);

    const shownDef = useRef<ResolvedAvatarDefinition | null>(null);
    const [handle, setHandle] = useState<AvatarHandle | null>(null);
    useImperativeHandle(ref, () => handle as AvatarHandle, [handle]);
    const onHandle = useCallback((hd: AvatarHandle | null) => setHandle(hd), []);
    const eventRef = useRef(onEvent);
    eventRef.current = onEvent;
    const clickRef = useRef(onClick);
    clickRef.current = onClick;

    const box = size === undefined ? undefined : typeof size === 'number' ? { width: size, height: size } : size;
    const placeholder = h('div', { className, style: { width: '100%', height: '100%', ...(box ? { width: box.width, height: box.height } : null), ...style } });
    // keep the live avatar on its last definition while a newly-seen family installs (morph, never a remount)
    if (ready && source.definition) shownDef.current = source.definition;
    if (!entry.config && !shownDef.current) return placeholder;
    const rendererProps = {
      id,
      family: source.family,
      definition: entry.config ? source.definition ?? null : shownDef.current,
      config,
      box,
      zoom,
      interactive,
      background,
      className,
      style,
      onHandle,
      onEvent: eventRef,
      onClick: clickRef,
    };
    const Component = rendererComponent(entry);
    return entry.component ? h(Component, rendererProps) : h(Suspense, { fallback: placeholder }, h(Component, rendererProps));
  }),
);
