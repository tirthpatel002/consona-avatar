import type { AvatarIcon } from '@consona/avatar-enhanced/core/index.ts';
import type { AvatarControlState, AvatarEvent, AvatarPreset, AvatarFamily } from '@consona/avatar-enhanced/core/index.ts';
import type { UseAvatarHandleResult } from '@consona/avatar-enhanced/react/useAvatarHandle.ts';

/** One option tile of an atom. */
export interface StudioAtomOption {
  id: string;
  name: string;
  description?: string;
  swatch?: string;
  tag?: string;
  /** Renderer-agnostic picker icon (core `AvatarIcon`). */
  icon?: AvatarIcon;
}

/** An atom as the studio shows it: options grouped (e.g. 'Classics' / 'Threadies'). */
export interface StudioAtomView {
  id: string;
  name: string;
  description?: string;
  selected: string | null;
  groups: [string, StudioAtomOption[]][];
  /** Current body colour (tints option icons). */
  tint?: string;
}

/** Renderer-agnostic editing model the shared studio renders (built by a source hook). */
export interface StudioModel {
  /** What the stage renders (a config or a definition, per source). */
  model: unknown;
  controls: AvatarControlState<any>[];
  setControl(path: string, value: unknown): void;
  /** Atoms by id (config families) / the current composition (catalog families). */
  atoms: StudioAtomView[];
  selectAtom(atom: string, id: string): void;
  /** Model with one atom option applied (live option previews). */
  previewWith?(atom: string, id: string): unknown;
  /** Config sources: replace the whole model (code import). */
  replace?(model: unknown): void;
  /** Shareable code of the current state; `importCode` throws a readable Error on bad input. */
  share?: { code: string; importCode(text: string): void };
  /** Random atoms + control values (morphs in place). */
  randomize?(): void;
  /** Catalog sources. */
  catalog?: StudioCatalogExtras;
}

export interface StudioCatalogExtras {
  families: AvatarFamily[];
  presets: AvatarPreset[];
  preset: AvatarPreset | null;
  selectPreset(id: string): void;
  resetParams(): void;
  resetAtoms(): void;
  handle: UseAvatarHandleResult;
  onEvent(e: AvatarEvent): void;
  log: string[];
  behaviors: string[];
  presetNames: string[];
  clickBehavior?: string;
}

/** Consona-style size targets (config families with `stage.sizes`). */
export interface StudioSizeBinding {
  active: string;
  select(id: string): void;
  /** Model per size id (selector thumbnails). */
  values: Record<string, unknown>;
  onReset?(): void;
  onResetAll?(): void;
}
