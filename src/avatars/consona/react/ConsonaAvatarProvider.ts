import React, { createContext, useContext, useMemo } from 'react';
import { ConsonaEngine, consonaEngine } from '../sdk/ConsonaEngine.ts';

interface ConsonaAvatarContextValue {
  engine: ConsonaEngine;
}

const ConsonaAvatarContext = createContext<ConsonaAvatarContextValue | null>(null);

export interface ConsonaAvatarProviderProps {
  children: React.ReactNode;
  engine?: ConsonaEngine;
  globalMode?: 'light' | 'dark';
  defaultPalette?: string;
}

export const ConsonaAvatarProvider: React.FC<ConsonaAvatarProviderProps> = ({
  children,
  engine: customEngine,
  globalMode,
  defaultPalette,
}) => {
  const engine = useMemo(() => customEngine ?? consonaEngine, [customEngine]);
  const value = useMemo(() => ({ engine, globalMode, defaultPalette }), [engine, globalMode, defaultPalette]);

  return React.createElement(
    ConsonaAvatarContext.Provider,
    { value },
    children
  );
};

export function useConsonaEngine(): ConsonaEngine {
  const context = useContext(ConsonaAvatarContext);
  return context?.engine ?? consonaEngine;
}
