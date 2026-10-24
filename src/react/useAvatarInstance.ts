import { useEffect, useRef, useId, useState } from 'react';
import { avatarEngine } from '../core/engine/AvatarEngine.ts';
import { AvatarInstance } from '../core/engine/AvatarInstance.ts';
import type { AvatarDescriptor } from '../core/types/AvatarDescriptor.ts';

export interface UseAvatarInstanceOptions {
  id?: string;
  descriptor: AvatarDescriptor | string;
  autoPlay?: boolean;
}

/**
 * useAvatarInstance: Generic React hook for creating and managing a core AvatarInstance.
 */
export function useAvatarInstance(options: UseAvatarInstanceOptions): AvatarInstance {
  const reactId = useId();
  const resolvedId = options.id || `avatar-${reactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const instanceRef = useRef<AvatarInstance | null>(null);
  const [, forceUpdate] = useState({});

  if (!instanceRef.current) {
    const descriptorId = typeof options.descriptor === 'string' ? options.descriptor : options.descriptor.id;
    if (typeof options.descriptor === 'object' && !avatarEngine.getAvatar(descriptorId)) {
      avatarEngine.registerAvatar(options.descriptor);
    }
    instanceRef.current = avatarEngine.createInstance(resolvedId, descriptorId);
  }

  useEffect(() => {
    return () => {
      avatarEngine.destroyInstance(resolvedId);
      instanceRef.current = null;
    };
  }, [resolvedId]);

  return instanceRef.current;
}
