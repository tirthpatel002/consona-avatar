import React, { useMemo } from 'react';
import type { DefinedAvatar } from '../core/define/defineAvatar.ts';
import type { DefinedVariant } from '../core/define/defineVariant.ts';

export interface AvatarInspectorProps {
  avatar: DefinedAvatar | { id: string; variants?: DefinedVariant[]; name?: string };
  /** Public config blob — avatar-specific shape */
  config: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  className?: string;
  /** Escape hatch: fully custom panel */
  children?: React.ReactNode;
}

const h = React.createElement;

/**
 * Schema-light inspector: lists variants from the avatar plugin.
 * Minimal generic inspector over a defined avatar's variants.
 */
export const AvatarInspector: React.FC<AvatarInspectorProps> = ({
  avatar,
  config,
  onChange,
  className = '',
  children,
}) => {
  const headVariants = useMemo(
    () => (avatar.variants ?? []).filter((v) => v.kind === 'head.shape'),
    [avatar.variants]
  );

  return h(
    'div',
    { className: `avatar-inspector ${className}`, 'data-avatar': avatar.id },
    children ??
      h(
        'div',
        { className: 'avatar-inspector-variants' },
        headVariants.map((v) =>
          h(
            'button',
            {
              key: v.id,
              type: 'button',
              onClick: () =>
                onChange({
                  ...config,
                  head: { ...(config.head ?? {}), shape: v.id },
                }),
            },
            v.meta?.label ?? v.id
          )
        )
      )
  );
};
