import React, { useEffect, useMemo } from 'react';
import { ConsonaAvatar } from './ConsonaAvatar.ts';
import { useConsonaEngine } from './ConsonaAvatarProvider.ts';
import { createConsonaAvatarHandle } from '../sdk/consonaHandle.ts';
import type { PartialConsonaAvatarConfig } from '../consona.config.ts';
import type { AvatarRendererProps } from '../../../react/renderers/registry.ts';

const DEFAULT_PX = 64;

/** `<Avatar>` renderer of the Consona family (SVG scene graph). */
export default function ConsonaRenderer({ id, config, box, interactive, background, className, style, onHandle, onEvent, onClick }: AvatarRendererProps) {
  const engine = useConsonaEngine();
  const handle = useMemo(() => createConsonaAvatarHandle(engine, id), [engine, id]);
  useEffect(() => {
    onHandle(handle);
    const unsub = handle.subscribe((e) => onEvent.current?.(e));
    return () => {
      unsub();
      onHandle(null);
    };
  }, [handle, onHandle, onEvent]);
  const { width, height } = box ?? { width: DEFAULT_PX, height: DEFAULT_PX };
  return React.createElement(ConsonaAvatar, {
    id,
    size: Math.min(width, height),
    config: config as PartialConsonaAvatarConfig | undefined,
    interactive,
    className,
    style: { width, height, ...(background ? { background } : null), ...style },
    onClick: () => onClick.current?.(handle),
  });
}
