import React, { useEffect, useRef, useCallback } from 'react';
import { AvatarInstance } from '../core/engine/AvatarInstance.ts';
import { RetainedSvgRenderer } from '../adapters/svg/index.ts';

export interface AvatarViewProps {
  instance: AvatarInstance;
  width?: number | string;
  height?: number | string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * AvatarView: High-performance React view component for mounting and rendering any AvatarInstance.
 * Uses 60fps RetainedSvgRenderer with zero DOM re-parsing.
 */
export const AvatarView: React.FC<AvatarViewProps> = ({
  instance,
  width,
  height,
  size = 64,
  className = '',
  style,
  onClick,
  onPointerMove,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<RetainedSvgRenderer | null>(null);

  const finalWidth = width ?? size;
  const finalHeight = height ?? size;

  const mountContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (node && instance) {
      if (!rendererRef.current) {
        rendererRef.current = new RetainedSvgRenderer();
      }
      rendererRef.current.initialize(node, instance.descriptor);
      instance.renderer = rendererRef.current;
      instance.update(0);
      instance.render();
    }
  }, [instance]);

  useEffect(() => {
    if (containerRef.current && instance) {
      if (!rendererRef.current) {
        rendererRef.current = new RetainedSvgRenderer();
      }
      rendererRef.current.initialize(containerRef.current, instance.descriptor);
      instance.renderer = rendererRef.current;
      instance.update(0);
      instance.render();
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, [instance]);

  return React.createElement('div', {
    ref: mountContainer,
    onClick,
    onPointerMove,
    className: `avatar-view relative inline-flex items-center justify-center select-none ${className}`,
    style: {
      width: finalWidth,
      height: finalHeight,
      ...style,
    },
  });
};
