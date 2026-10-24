import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AvatarPlayOptions, AvatarStateSnapshot } from '../core/animation/state-machine/AvatarStateMachine.ts';
import type { PresetName } from '../core/types/AvatarDefinition.ts';
import type { AvatarAnchorName } from '../core/atom/atom.ts';
import type { AvatarHandle, AvatarSnapshotRequest } from '../core/engine/AvatarHandle.ts';
import type { AvatarPoseOptions, AvatarPoseTarget } from '../core/animation/pose.ts';
import type { AvatarTimeline, AvatarTimelinePlayer } from '../core/animation/timeline.ts';
import type { AvatarEventRequest } from '../core/event/event.ts';
import type { AvatarPlugin, PluginApi } from '../core/plugins/plugin.ts';

export interface UseAvatarHandleResult {
  /** Pass to `<Avatar ref={avatar.ref} />`. */
  ref: (handle: AvatarHandle | null) => void;
  /** Live behavior/preset snapshot (re-renders on change). */
  state: AvatarStateSnapshot | null;
  handle(): AvatarHandle | null;
  play(behavior: string, options?: AvatarPlayOptions): boolean;
  enqueue(...behaviors: string[]): boolean;
  /** Resolve the waiting behavior (see `AvatarHandle.resolve`). */
  resolve(outcome?: string): boolean;
  pose(target: AvatarPoseTarget, options?: AvatarPoseOptions): void;
  apply(preset: PresetName): void;
  idle(): void;
  blink(): void;
  setGazeTarget(target: { x: number; y: number } | null): void;
  playTimeline(timeline: AvatarTimeline): AvatarTimelinePlayer | null;
  stopTimeline(): void;
  /** Set a channel (see `AvatarHandle.set`). */
  set(channel: string, value: number | null, options?: { immediate?: boolean }): boolean;
  /** Emit an event (see `AvatarHandle.emit`). */
  emit(event: AvatarEventRequest): void;
  /** Attach / detach an atom (see `AvatarHandle.attach`). */
  attach(atom: string, anchor?: AvatarAnchorName): boolean;
  detach(atom: string): void;
  /** Attach a plugin to the mounted avatar (see `AvatarHandle.use`); null before mount. */
  use<B extends string, C extends string, P extends string, Api>(plugin: AvatarPlugin<B, C, P, Api>): PluginApi<B, C, P, Api> | null;
  /** True when the current avatar's renderer can capture snapshots. */
  canSnapshot(): boolean;
  /** Capture the frame on screen (see `AvatarHandle.snapshot`); rejects when unsupported. */
  snapshot(options?: AvatarSnapshotRequest): Promise<Blob>;
}

/**
 * React state over an `<Avatar>`'s handle (any renderer), with stable methods:
 *
 *   const avatar = useAvatarHandle();
 *   <Avatar ref={avatar.ref} preset="allie-classic-sunny" />
 *   <button onClick={() => avatar.play('jump', { then: 'happy' })}>Jump</button>
 */
export function useAvatarHandle(): UseAvatarHandleResult {
  const handleRef = useRef<AvatarHandle | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<AvatarStateSnapshot | null>(null);

  const ref = useCallback((h: AvatarHandle | null) => {
    if (h === handleRef.current) return;
    unsubRef.current?.();
    unsubRef.current = null;
    handleRef.current = h;
    if (h) {
      setState(h.state);
      unsubRef.current = h.subscribe(() => setState(h.state));
    } else {
      setState(null);
    }
  }, []);

  useEffect(() => () => unsubRef.current?.(), []);

  const api = useMemo(
    () => ({
      handle: () => handleRef.current,
      play: (a: string, o?: AvatarPlayOptions) => handleRef.current?.play(a, o) ?? false,
      enqueue: (...a: string[]) => handleRef.current?.enqueue(...a) ?? false,
      resolve: (o?: string) => handleRef.current?.resolve(o) ?? false,
      pose: (t: AvatarPoseTarget, o?: AvatarPoseOptions) => handleRef.current?.pose(t, o),
      apply: (m: PresetName) => handleRef.current?.apply(m),
      idle: () => handleRef.current?.idle(),
      blink: () => handleRef.current?.blink(),
      setGazeTarget: (t: { x: number; y: number } | null) => handleRef.current?.setGazeTarget(t),
      playTimeline: (t: AvatarTimeline) => handleRef.current?.playTimeline(t) ?? null,
      stopTimeline: () => handleRef.current?.stopTimeline(),
      set: (c: string, v: number | null, o?: { immediate?: boolean }) => handleRef.current?.set(c, v, o) ?? false,
      emit: (e: AvatarEventRequest) => handleRef.current?.emit(e),
      attach: (a: string, at?: AvatarAnchorName) => handleRef.current?.attach(a, at) ?? false,
      detach: (a: string) => handleRef.current?.detach(a),
      use: <B extends string, C extends string, P extends string, Api>(p: AvatarPlugin<B, C, P, Api>) => handleRef.current?.use(p) ?? null,
      canSnapshot: () => typeof handleRef.current?.snapshot === 'function',
      snapshot: (o?: AvatarSnapshotRequest) => {
        const h = handleRef.current;
        return h?.snapshot ? h.snapshot(o) : Promise.reject(new Error('[avatar] snapshot not supported by this renderer'));
      },
    }),
    [],
  );

  return { ref, state, ...api };
}
