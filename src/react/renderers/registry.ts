/**
 * React renderer registry of `<Avatar>`. Families (or generic renderer kinds
 * such as 'three') register the component that draws them; `<Avatar>` only
 * looks it up, so it carries no family-specific code. Type-only React import:
 * registering never pulls React or a renderer into a bundle by itself.
 */
import type { ComponentType, CSSProperties, MutableRefObject } from 'react';
import type { AvatarHandle } from '../../core/engine/AvatarHandle.ts';
import type { AvatarEvent } from '../../core/animation/state-machine/AvatarStateMachine.ts';
import type { ResolvedAvatarDefinition } from '../../core/define/resolveAvatar.ts';

/** Props every `<Avatar>` renderer receives (callbacks via refs: no re-render churn). */
export interface AvatarRendererProps {
  id: string;
  family?: string;
  /** Definition-driven renderers: the resolved definition. */
  definition: ResolvedAvatarDefinition | null;
  /** Config-driven renderers: the family config, passed through untouched. */
  config?: unknown;
  /** Requested pixel box; omitted = renderer default. */
  box?: { width: number; height: number };
  zoom?: number;
  interactive?: boolean;
  background?: string | null;
  className?: string;
  style?: CSSProperties;
  onHandle: (handle: AvatarHandle | null) => void;
  onEvent: MutableRefObject<((e: AvatarEvent) => void) | undefined>;
  onClick: MutableRefObject<((handle: AvatarHandle) => void) | undefined>;
}

export type AvatarRendererComponent = ComponentType<AvatarRendererProps>;

export interface AvatarReactRenderer {
  /** Eager component, or … */
  component?: AvatarRendererComponent;
  /** … a lazy chunk (rendered under Suspense). */
  load?: () => Promise<{ default: AvatarRendererComponent }>;
  /** Driven by `config` instead of a definition (no definition is required to render). */
  config?: boolean;
}

const renderers = new Map<string, AvatarReactRenderer>();

/**
 * Register the React renderer for a family id, or for a renderer kind
 * ('three', 'svg') used by every family of that kind without its own entry.
 * An eager entry is never replaced by a lazy one for the same key.
 */
export function registerAvatarReactRenderer(key: string, entry: AvatarReactRenderer): void {
  const prev = renderers.get(key);
  if (prev?.component && !entry.component) return;
  renderers.set(key, entry);
}

/** Family entry first, then the renderer-kind entry. */
export function getAvatarReactRenderer(family: string | undefined, renderer: string | undefined): AvatarReactRenderer | undefined {
  return (family ? renderers.get(family) : undefined) ?? (renderer ? renderers.get(renderer) : undefined);
}

/** The only registered config-driven family, if exactly one exists (default family for a bare `config`). */
export function defaultConfigFamily(isFamily: (key: string) => boolean): string | undefined {
  const keys = [...renderers].filter(([k, e]) => e.config && isFamily(k)).map(([k]) => k);
  return keys.length === 1 ? keys[0] : undefined;
}
