import type { AvatarRendererId } from '../types/AvatarDefinition.ts';
import type { AvatarControl } from '../controls/controls.ts';
import type { AvatarHandle } from '../engine/AvatarHandle.ts';

/**
 * Studio manifests: what a family's studio shows (sections, atoms, control
 * groups, presets, behaviors, stage size, option previews). Renderer-agnostic
 * data; the app's shared studio renders any manifest and plugs in the stage
 * adapter matching `renderer`.
 */

/** Option tiles: 'live' renders the avatar per option (cheap renderers, e.g. SVG); 'none' shows label / swatch / tag. */
export type AvatarStudioPreviews = 'live' | 'none';

/** A selectable stage size (e.g. Consona's Main / Small / Micro / All targets). */
export interface AvatarStudioStageSize {
  id: string;
  title: string;
  /** Short size label shown on the card (e.g. '260px', 'Synced'). */
  label: string;
  px: number;
  description: string;
  /** Thumbnail size on the selector card. */
  thumb?: number;
}

/** Heading badge of a section item. */
export interface AvatarStudioBadge {
  text: string;
  /** 'value' (capitalised pill), 'chip' (plain value chip), 'on' / 'off' (status with dot). */
  tone?: 'value' | 'chip' | 'on' | 'off';
}

export type AvatarStudioItem<M = unknown> =
  /** Option tiles for one catalog atom (`atom` id, resolved for the studio family). */
  | { type: 'atoms'; atom: string; title?: string; columns?: string }
  /** All atoms of the current selection (catalog families: the preset's composition). */
  | { type: 'composer' }
  /** Controls of the listed groups ('*' = every group, one block each). */
  | { type: 'controls'; groups: string[] | '*'; title?: string; columns?: 1 | 2 | 3; badge?: (model: M) => AvatarStudioBadge | null; boxed?: boolean }
  /** Character picker grouped by family (catalog presets). */
  | { type: 'presets' }
  /** Atoms of the live avatar attached / detached at anchors (`handle.attach`); plugin atoms badged. */
  | { type: 'attach' }
  /** Channels (`handle.set`) and dynamics presets (`handle.apply`) of the live avatar; plugin ones badged. */
  | { type: 'channels' }
  /** Behaviors of the live avatar (`handle.play`) with params, optional chain builder / timeline demo; plugin ones badged. */
  | { type: 'behaviors'; chain?: boolean }
  /** Events (`handle.emit`: messages, effects, plugin events), cue readout, runtime state + event log. */
  | { type: 'events' }
  | { type: 'divider' };

export interface AvatarStudioSection<M = unknown> {
  id: string;
  label: string;
  items: AvatarStudioItem<M>[];
}

/**
 * Config-backed families (a family-owned model `M`, e.g. Consona's
 * `ConsonaAvatarConfig`): controls and atoms read / write `M` directly.
 */
export interface AvatarStudioConfigSource<M> {
  kind: 'config';
  controls: AvatarControl<M>[];
  /** Catalog atom id → model path holding the selected variant id. */
  atomPaths: Record<string, string>;
  /** Live preview markup of `model` (needed for previews: 'live'). */
  preview?: (model: M, size: number) => string;
  /** The stage avatar's unified handle (behaviors, presets, blink…), by stage id. */
  handle?: (stageId: string) => AvatarHandle;
  /** Behavior modifiers (speed, weight, axis…) edited as controls and passed as `play()` params. */
  behaviorParams?: { controls: AvatarControl<Record<string, unknown>>[]; defaults: Record<string, unknown> };
  blink?: (stageId: string) => void;
  code?: { encode: (model: M) => string; decode: (code: string) => M; isCode: (text: string) => boolean };
  /** Status chips on the stage (left, right). */
  stageBadges?: (model: M) => AvatarStudioBadge[];
}

/** Catalog-backed families: presets + atom compositions + registry controls. */
export interface AvatarStudioCatalogSource {
  kind: 'catalog';
  /** Behavior fired on a stage click (default: the first non-idle behavior). */
  clickBehavior?: string;
}

export interface AvatarStudioManifest<M = unknown> {
  id: string;
  label: string;
  title?: string;
  /** Catalog families this studio covers. */
  families: string[];
  renderer: AvatarRendererId;
  /**
   * `zoom`: apparent avatar size on the stage relative to the renderer's default
   * framing (camera framing only; never touches the family's body scale).
   */
  stage: { size: 'compact' | 'large'; sizes?: AvatarStudioStageSize[]; zoom?: number };
  previews: AvatarStudioPreviews;
  /**
   * Right-side tabs, by convention the four of every studio: Characters / Atoms,
   * Parameters, Behaviors, Events. Plugin items appear inside them, badged.
   */
  sections: AvatarStudioSection<M>[];
  source: AvatarStudioConfigSource<M> | AvatarStudioCatalogSource;
  /** Avatar Code (copy / import) under the stage (default true; config sources need `source.code`). */
  share?: boolean;
  /** Randomize under the stage (default true): random atoms + controls (`randomize: false` controls are kept). */
  randomize?: boolean;
  /** Tab order (default 0). */
  order?: number;
}

const studios = new Map<string, AvatarStudioManifest<any>>();

export function registerAvatarStudio<M>(manifest: AvatarStudioManifest<M>): void {
  if (manifest.previews === 'live' && manifest.source.kind === 'config' && !manifest.source.preview) {
    throw new Error(`registerAvatarStudio(${manifest.id}): previews 'live' needs source.preview`);
  }
  studios.set(manifest.id, manifest);
}

export function getAvatarStudio(id: string): AvatarStudioManifest<any> | undefined {
  return studios.get(id);
}

/** Studio covering `family`. */
export function findAvatarStudio(family: string): AvatarStudioManifest<any> | undefined {
  return Array.from(studios.values()).find((s) => s.families.includes(family));
}

export function listAvatarStudios(): AvatarStudioManifest<any>[] {
  return Array.from(studios.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
