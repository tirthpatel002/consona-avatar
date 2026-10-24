import { useEffect, useRef, useState, useCallback, useMemo, useId } from 'react';
import { useConsonaEngine } from './ConsonaAvatarProvider.ts';
import { AvatarInstance } from '../../../core/engine/AvatarInstance.ts';
import { RetainedSvgRenderer } from '../../../adapters/svg/index.ts';
import type {
  ConsonaAvatarConfig,
  PartialConsonaAvatarConfig,
  ConsonaPupilConfig,
} from '../consona.config.ts';
import { createDefaultAvatarConfig } from '../consona.config.ts';
import { createConsonaAvatarHandle } from '../sdk/consonaHandle.ts';
import { applyConsonaConfig, interpolateConsonaConfig } from '../consona.apply.ts';

export interface UseConsonaAvatarOptions {
  id?: string;
  config?: PartialConsonaAvatarConfig;
  size?: number;
}

/**
 * High-performance React hook for embedding and controlling live Consona avatars.
 * Maintains persistent AvatarInstance & RetainedSvgRenderer lifecycles across prop mutations
 * to ensure silky smooth 60-144fps parameter updates without DOM destruction or visual hiccups.
 */
export function useConsonaAvatar(
  avatarId?: string,
  initialConfig?: PartialConsonaAvatarConfig,
  size: number = 64
) {
  const engine = useConsonaEngine();
  const reactId = useId();
  const resolvedId = avatarId || `consona-${reactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const domNodeRef = useRef<HTMLElement | null>(null);
  const rendererRef = useRef<RetainedSvgRenderer | null>(null);
  const instanceRef = useRef<AvatarInstance | null>(null);
  const latestConfigRef = useRef<ConsonaAvatarConfig | null>(null);

  // 1. Stable instance retrieval or creation
  const getOrCreateInstance = useCallback((): AvatarInstance => {
    let inst = engine.core.getInstance(resolvedId);
    if (!inst) {
      inst = engine.core.createInstance(resolvedId, 'consona');
      const base = createDefaultAvatarConfig(
        initialConfig?.seed ?? 'default',
        initialConfig?.paletteId ?? 'light',
        initialConfig
      );
      applyConsonaConfig(inst, base);
      latestConfigRef.current = base;
    }
    inst.pixelSize = size;
    instanceRef.current = inst;
    return inst;
  }, [engine, resolvedId, size]);

  // 2. Stable DOM Container Binding
  const attachRenderer = useCallback((node: HTMLElement | null) => {
    domNodeRef.current = node;
    if (!node) {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      return;
    }

    const inst = getOrCreateInstance();
    inst.pixelSize = size;
    if (!rendererRef.current) {
      rendererRef.current = new RetainedSvgRenderer();
      rendererRef.current.initialize(node, inst.descriptor);
      inst.renderer = rendererRef.current;
    } else if (rendererRef.current.getContainer() !== node) {
      rendererRef.current.initialize(node, inst.descriptor);
    }
    inst.update(0);
    inst.render();
  }, [getOrCreateInstance, size]);

  // 3. Stable Callback Ref
  const avatarRef = useCallback(
    (node: HTMLElement | null) => {
      attachRenderer(node);
    },
    [attachRenderer]
  );

  // 4. Granular, non-destructive config synchronization on prop updates
  const configJson = initialConfig ? JSON.stringify(initialConfig) : '';
  const prevConfigJsonRef = useRef<string>('');

  useEffect(() => {
    if (initialConfig && prevConfigJsonRef.current !== configJson) {
      prevConfigJsonRef.current = configJson;
      const currentSeed = latestConfigRef.current?.seed ?? initialConfig.seed ?? 'default';
      const currentPalette = latestConfigRef.current?.paletteId ?? initialConfig.paletteId ?? 'light';
      const merged = createDefaultAvatarConfig(
        initialConfig.seed ?? currentSeed,
        initialConfig.paletteId ?? currentPalette,
        initialConfig
      );
      latestConfigRef.current = merged;

      const inst = instanceRef.current ?? engine.core.getInstance(resolvedId);
      if (inst) {
        applyConsonaConfig(inst, merged);
        // Force immediate retained render to reflect changes smoothly without glitching
        if (rendererRef.current) {
          inst.update(0);
          inst.render();
        }
      }
    }
  }, [configJson, initialConfig, engine, resolvedId]);

  // 5. Mount & Cleanup Lifecycle: ONLY cleans up on unmount or id change
  useEffect(() => {
    if (domNodeRef.current) {
      attachRenderer(domNodeRef.current);
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      engine.core.destroyInstance(resolvedId);
      instanceRef.current = null;
    };
  }, [engine, resolvedId, attachRenderer]);

  const updateConfig = useCallback(
    (partial: PartialConsonaAvatarConfig) => {
      const inst = instanceRef.current ?? engine.core.getInstance(resolvedId);
      if (inst) {
        const currentSeed = latestConfigRef.current?.seed ?? 'default';
        const currentPalette = latestConfigRef.current?.paletteId ?? 'light';
        const next = createDefaultAvatarConfig(
          partial.seed ?? currentSeed,
          partial.paletteId ?? currentPalette,
          { ...(latestConfigRef.current ?? {}), ...partial }
        );
        latestConfigRef.current = next;
        applyConsonaConfig(inst, next);
        if (rendererRef.current) {
          inst.update(0);
          inst.render();
        }
      }
    },
    [engine, resolvedId]
  );

  const morphTo = useCallback(
    (target: PartialConsonaAvatarConfig, durationMs: number = 400) => {
      const inst = instanceRef.current ?? engine.core.getInstance(resolvedId);
      if (!inst) return;
      const start = latestConfigRef.current ?? createDefaultAvatarConfig('default', 'light');
      const end = createDefaultAvatarConfig(
        target.seed ?? start.seed,
        target.paletteId ?? start.paletteId,
        { ...start, ...target }
      );
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const interpolated = interpolateConsonaConfig(start, end, progress);
        applyConsonaConfig(inst, interpolated);
        if (rendererRef.current) {
          inst.update(0);
          inst.render();
        }
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          latestConfigRef.current = end;
        }
      };
      requestAnimationFrame(step);
    },
    [engine, resolvedId]
  );

  const triggerBlink = useCallback(() => {
    engine.triggerBlink(resolvedId);
  }, [engine, resolvedId]);

  const setGaze = useCallback((gaze: { x: number; y: number }) => {
    const inst = instanceRef.current ?? engine.core.getInstance(resolvedId);
    if (inst) {
      const excursion = inst.channels.getValue<number>('eyes:gazeExcursion') ?? 12;
      inst.channels.setValue('eyes:gazeX', gaze.x * excursion);
      inst.channels.setValue('eyes:gazeY', gaze.y * excursion);
      inst.channels.setValue('eyes:pointerX', gaze.x);
      inst.channels.setValue('eyes:pointerY', gaze.y);
    }
  }, [engine, resolvedId]);

  const lookAt = useCallback(
    (screenX: number, screenY: number) => {
      const inst = instanceRef.current ?? engine.core.getInstance(resolvedId);
      if (!domNodeRef.current || !inst) return;
      const rect = domNodeRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxDistance = Math.max(window.innerWidth, window.innerHeight);
      const dx = (screenX - centerX) / (maxDistance * 0.5);
      const dy = (screenY - centerY) / (maxDistance * 0.5);
      const clampedX = Math.max(-1, Math.min(1, dx));
      const clampedY = Math.max(-1, Math.min(1, dy));
      const excursion = inst.channels.getValue<number>('eyes:gazeExcursion') ?? 12;
      inst.channels.setValue('eyes:gazeX', clampedX * excursion);
      inst.channels.setValue('eyes:gazeY', clampedY * excursion);
      inst.channels.setValue('eyes:pointerX', clampedX);
      inst.channels.setValue('eyes:pointerY', clampedY);
    },
    [engine, resolvedId]
  );

  const setPupil = useCallback(
    (pupil: boolean | ConsonaPupilConfig, options?: { animated?: boolean; durationMs?: number }) => {
      engine.eyes.setPupil(resolvedId, pupil, options);
    },
    [engine, resolvedId]
  );

  /** The unified control surface: behaviors (`do`), presets (`apply`), blink, gaze, timelines. */
  const handle = useMemo(() => createConsonaAvatarHandle(engine, resolvedId), [engine, resolvedId]);

  return {
    id: resolvedId,
    instance: instanceRef.current,
    config: latestConfigRef.current,
    avatarRef,
    updateConfig,
    morphTo,
    triggerBlink,
    setGaze,
    lookAt,
    setPupil,
    handle,
    isSleeping: false,
  };
}
