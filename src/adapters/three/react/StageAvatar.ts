import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { AvatarDefinition, PresetName } from '../../../core/types/AvatarDefinition.ts';
import type { AvatarEvent } from '../../../core/animation/state-machine/AvatarStateMachine.ts';
import type { ThreeAvatarController, ThreeAvatarControllerOptions } from '../rig/applyState.ts';
import type { AvatarRuntimeHandle } from '../../../core/engine/AvatarRuntime.ts';
import { useThreeStage } from './ThreeCanvas.ts';

export interface StageAvatarProps extends ThreeAvatarControllerOptions {
  definition: AvatarDefinition;
  /** Overrides `definition.position`. */
  position?: [number, number, number];
  /** Controlled resting preset. */
  preset?: PresetName;
  /** Behavior to start on mount (e.g. 'wave'). */
  initialBehavior?: string;
  onEvent?: (event: AvatarEvent) => void;
  /** Auto-fit the stage camera to this avatar (`true` or a padding factor). */
  frame?: boolean | number;
}

/**
 * Declarative avatar inside `<ThreeCanvas>`. Forward a ref (or use
 * `useAvatarHandle()`) to get the imperative `AvatarRuntimeHandle`.
 * A new `definition` (any id) morphs the same rig in place; the rig is only built once per stage.
 */
export const StageAvatar = forwardRef<AvatarRuntimeHandle, StageAvatarProps>(function StageAvatar(props, ref) {
  const { definition, position, preset, initialBehavior, onEvent, frame, followPointer, blink, blinkInterval } = props;
  const stage = useThreeStage();
  const [controller, setController] = useState<ThreeAvatarController | null>(null);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  // New definition (even a different character/id) → in-place transition on the same rig; never a remount.
  const defRef = useRef(definition);
  defRef.current = definition;
  useEffect(() => {
    controller?.setDefinition(definition);
  }, [controller, definition]);

  useEffect(() => {
    if (!stage) return;
    const c = stage.add(defRef.current, { followPointer, blink, blinkInterval });
    // place + frame before the stage draws its first frame (a later effect would leave the avatar at its
    // definition position and the camera unframed for a few frames, then jump)
    if (position) {
      c.object.position.set(...position);
      c.rig.baseY = position[1];
    }
    if (frame) stage.frameAvatar(c, typeof frame === 'number' ? frame : undefined);
    const unsub = c.subscribe((ev) => eventRef.current?.(ev));
    if (initialBehavior) c.play(initialBehavior);
    setController(c);
    return () => {
      unsub();
      setController(null);
      stage.remove(c.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    if (!controller) return;
    if (position) {
      controller.object.position.set(...position);
      controller.rig.baseY = position[1];
    }
    if (frame && stage) stage.frameAvatar(controller, typeof frame === 'number' ? frame : undefined);
  }, [controller, stage, frame, position?.[0], position?.[1], position?.[2]]);

  useEffect(() => {
    if (controller && preset) controller.apply(preset);
  }, [controller, preset]);

  useImperativeHandle(ref, () => controller as AvatarRuntimeHandle, [controller]);
  return null;
});
