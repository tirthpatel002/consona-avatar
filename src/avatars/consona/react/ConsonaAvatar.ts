import React, { useMemo } from 'react';
import { useConsonaAvatar } from './useConsonaAvatar.ts';
import type { ConsonaPupilConfig, PartialConsonaAvatarConfig } from '../consona.config.ts';
import type { ConsonaPaletteId } from '../palettes/consona.palettes.ts';
import type { ConsonaHeadShape } from '../atoms/head.consona.atom.ts';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
  '2xl': 128,
};

export interface ConsonaAvatarProps {
  id?: string;
  size?: AvatarSize;
  config?: PartialConsonaAvatarConfig;
  seed?: string;
  palette?: ConsonaPaletteId;
  shape?: ConsonaHeadShape;
  /** Resting preset (default 'neutral'; see `listPresets('consona')`). */
  preset?: string;
  interactive?: boolean;
  glow?: boolean;
  showPupil?: boolean;
  pupil?: boolean | ConsonaPupilConfig;
  surfaceShadow?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const ConsonaAvatar: React.FC<ConsonaAvatarProps> = React.memo(({
  id,
  size = 'lg',
  config,
  seed = 'avatar-bot-01',
  palette = 'light',
  shape = 'circle',
  preset = 'neutral',
  interactive = true,
  glow = false,
  showPupil,
  pupil,
  surfaceShadow,
  className = '',
  style,
  onClick,
}) => {
  const pixelSize = typeof size === 'number' ? size : (SIZE_MAP[size] ?? 64);

  const initialConfig = useMemo<PartialConsonaAvatarConfig>(() => {
    const isPupil = showPupil ?? pupil ?? config?.eyes?.showPupil ?? config?.eyes?.pupil;
    const isShadow = surfaceShadow ?? config?.head?.surfaceShadow ?? false;
    const restPreset = config?.behavior?.preset ?? preset;
    return {
      seed: config?.seed ?? seed,
      paletteId: config?.paletteId ?? palette,
      head: {
        shape: config?.head?.shape ?? shape,
        roundness: config?.head?.roundness ?? 0.85,
        surfaceShadow: isShadow,
        ...config?.head,
      },
      eyes: {
        ...(isPupil !== undefined ? { pupil: isPupil, showPupil: Boolean(typeof isPupil === 'object' ? isPupil.enabled !== false : isPupil) } : {}),
        ...config?.eyes,
      },
      behavior: {
        interactive: config?.behavior?.interactive ?? interactive,
        glow: config?.behavior?.glow ?? glow,
        ...config?.behavior,
        preset: restPreset,
      },
      ...config,
    };
  }, [config, seed, palette, shape, preset, interactive, glow, showPupil, pupil, surfaceShadow]);

  const { avatarRef } = useConsonaAvatar(id, initialConfig, pixelSize);

  return React.createElement('div', {
    ref: avatarRef,
    onClick,
    className: `consona-avatar relative inline-flex items-center justify-center select-none ${className}`,
    style: {
      width: pixelSize,
      height: pixelSize,
      ...style,
    },
  });
});
