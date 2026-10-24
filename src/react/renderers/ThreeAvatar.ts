/**
 * Internal Three.js renderer of `<Avatar>`. Loaded lazily (dynamic import), so
 * SVG-only consumers never bundle or load `three`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThreeCanvas } from '../../adapters/three/react/ThreeCanvas.ts';
import { StageAvatar } from '../../adapters/three/react/StageAvatar.ts';
import { framePaddingForZoom } from '../../adapters/three/stage/Stage.ts';
import type { AvatarStage } from '../../adapters/three/stage/Stage.ts';
import type { AvatarRuntimeHandle } from '../../core/engine/AvatarRuntime.ts';
import { avatarHandleFromRuntime } from '../../core/engine/AvatarHandle.ts';
import type { AvatarEvent } from '../../core/animation/state-machine/AvatarStateMachine.ts';
import type { ResolvedAvatarDefinition } from '../../core/define/resolveAvatar.ts';
import type { AvatarRendererProps } from './registry.ts';
import { AvatarMessageBubble } from '../AvatarMessageBubble.ts';


const ORIGIN: [number, number, number] = [0, 0, 0];
const h = React.createElement;

/**
 * One canvas + one avatar (+ its speech bubble overlay), created once: a new `definition` morphs the same rig
 * in place (never a remount); the stage pauses off-screen / in hidden tabs and
 * frames once, keeping the user's zoom and orbit.
 */
export default function ThreeAvatar({ definition: def, box, zoom, interactive, background = null, className, style: userStyle, onHandle, onEvent, onClick }: AvatarRendererProps) {
  const definition = def as ResolvedAvatarDefinition;
  const style: React.CSSProperties = box ? { width: box.width, height: box.height, ...userStyle } : { ...userStyle };
  const [ctl, setCtl] = useState<AvatarRuntimeHandle | null>(null);
  // the stage this avatar renders on (snapshots capture its canvas view)
  const stageRef = useRef<AvatarStage | null>(null);
  const onReady = useCallback((s: AvatarStage) => {
    stageRef.current = s;
  }, []);
  const handle = useMemo(
    () =>
      ctl
        ? avatarHandleFromRuntime(ctl, 'three', {
            snapshot: (o) => (stageRef.current ? stageRef.current.snapshot(o) : Promise.reject(new Error('[avatar] snapshot: stage not ready'))),
          })
        : null,
    [ctl],
  );
  useEffect(() => {
    if (!handle) return;
    onHandle(handle);
    return () => onHandle(null);
  }, [handle, onHandle]);
  const emit = useCallback((e: AvatarEvent) => onEvent.current?.(e), [onEvent]);
  return h(
    ThreeCanvas,
    {
      background,
      controls: interactive === false ? false : undefined,
      className,
      style,
      onReady,
      onAvatarClick: () => handle && onClick.current?.(handle),
    },
    h(StageAvatar, { ref: setCtl, definition, position: ORIGIN, frame: framePaddingForZoom(zoom), onEvent: emit }),
    h(AvatarMessageBubble, { handle }),
  );
}
