import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AvatarStage } from '../stage/Stage.ts';
import type { AvatarStageOptions } from '../stage/Stage.ts';
import type { ThreeAvatarController } from '../rig/applyState.ts';

const h = React.createElement;

const AvatarStageContext = createContext<AvatarStage | null>(null);

/** Access the surrounding `<ThreeCanvas>` stage (null until mounted). */
export function useThreeStage(): AvatarStage | null {
  return useContext(AvatarStageContext);
}

export interface ThreeCanvasProps extends Omit<AvatarStageOptions, 'canvas' | 'onAvatarClick'> {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  /** Called once the WebGL stage exists. */
  onReady?: (stage: AvatarStage) => void;
  onAvatarClick?: (id: string, controller: ThreeAvatarController) => void;
}

/**
 * Hosts a WebGL `AvatarStage`. Thin host only: children `<StageAvatar>`s register into it; hooks live in `src/react`.
 * Stage options are read on mount (remount via `key` to change them).
 */
export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({ className, style, children, onReady, onAvatarClick, ...options }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState<AvatarStage | null>(null);
  const clickRef = useRef(onAvatarClick);
  clickRef.current = onAvatarClick;
  const optionsRef = useRef(options);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = new AvatarStage({ ...optionsRef.current, canvas, onAvatarClick: (id, c) => clickRef.current?.(id, c) });
    setStage(s);
    onReady?.(s);
    return () => {
      setStage(null);
      s.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return h(
    'div',
    { className, style: { position: 'relative', width: '100%', height: '100%', ...style } },
    h('canvas', { ref: canvasRef, style: { display: 'block', width: '100%', height: '100%', touchAction: 'none' } }),
    stage ? h(AvatarStageContext.Provider, { value: stage }, children) : null,
  );
};

