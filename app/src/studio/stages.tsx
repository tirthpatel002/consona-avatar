import React, { memo } from 'react';
import { Avatar, type AvatarHandle, type ConsonaAvatarConfig } from '@consona/avatar-enhanced';
import type { AvatarEvent, AvatarRendererId, ResolvedAvatarDefinition } from '@consona/avatar-enhanced/core/index.ts';

/** Runtime hooks for renderer stages with a live handle (stable identities). */
export interface StageRuntime {
  ref: (handle: AvatarHandle | null) => void;
  onEvent: (e: AvatarEvent) => void;
  clickBehavior?: string;
}

/**
 * Stage props are only what the renderer needs (all stable or value-like), so
 * memoized stages skip re-rendering on unrelated studio state (tabs, logs,
 * behavior state, panel edits that haven't produced a new model yet).
 */
export interface StageProps {
  id: string;
  model: unknown;
  size: number;
  interactive?: boolean;
  /** Apparent-size multiplier (manifest `stage.zoom`). */
  zoom?: number;
  runtime?: StageRuntime;
}

/** Config-driven families (Consona SVG): the live parametric avatar. */
const ConfigStage = memo<StageProps>(({ id, model, size, interactive }) => (
  <Avatar id={id} size={size} config={model as ConsonaAvatarConfig} interactive={interactive} />
));

/**
 * Definition-driven families (Three): `<Avatar>` keeps one canvas + rig; a new
 * `model` morphs it in place (never a remount) and the camera keeps the user's zoom.
 */
const DefinitionStage = memo<StageProps>(({ model, zoom, runtime }) => {
  if (!model || !runtime) return null;
  return (
    <Avatar
      ref={runtime.ref}
      definition={model as ResolvedAvatarDefinition}
      zoom={zoom}
      onEvent={runtime.onEvent}
      onClick={(a) => runtime.clickBehavior && a.play(runtime.clickBehavior)}
    />
  );
});

/** Stage by family renderer — both are `<Avatar>`; they differ only in config vs definition input. */
export const STAGE_ADAPTERS: Record<string, React.FC<StageProps>> = { svg: ConfigStage, three: DefinitionStage };

export function stageAdapter(renderer: AvatarRendererId): React.FC<StageProps> {
  const s = STAGE_ADAPTERS[renderer];
  if (!s) throw new Error(`No studio stage adapter for renderer "${renderer}"`);
  return s;
}
