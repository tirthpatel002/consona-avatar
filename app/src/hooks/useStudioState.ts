import { useState, useEffect, useCallback, useMemo } from 'react';
import { resolvePalette, type ConsonaPaletteId, type ConsonaAvatarConfig } from '@consona/avatar-enhanced';
import {
  type StudioParams,
  type StudioTargetScope,
  createDefaultStudioParams,
  studioParamsToAvatarConfig,
  avatarConfigToStudioParams,
} from '../types/studio';

function switchPaletteMode(paletteId: ConsonaPaletteId, mode: 'light' | 'dark'): ConsonaPaletteId {
  const current = resolvePalette(paletteId);
  const accent = current.accentColor ?? 'mono';
  if (accent === 'mono') {
    return mode === 'light' ? 'light' : 'dark';
  }
  return `${accent}-${mode}` as ConsonaPaletteId;
}

const STORAGE_KEY = 'consona_avatar_studio_state_v3';

export interface StudioTargetConfigs {
  main: StudioParams;
  small: StudioParams;
  micro: StudioParams;
}

const DEFAULT_TARGET_CONFIGS: StudioTargetConfigs = {
  main: createDefaultStudioParams({
    seed: 'avatar-main-01',
    headShape: 'circle',
    eyeShape: 'capsule',
    tiltMode: 'spatial3D',
    eyeSpacing: 0.50,
    openness: 1.0,
    eyeWidth: 0.50,
    eyeHeight: 0.50,
  }),
  small: createDefaultStudioParams({
    seed: 'avatar-small-01',
    headShape: 'circle',
    eyeShape: 'capsule',
    tiltMode: 'spatial3D',
    eyeSpacing: 0.44, // Slightly tighter spacing for 64px
    openness: 1.0,
    eyeWidth: 0.54,
    eyeHeight: 0.54,
  }),
  micro: createDefaultStudioParams({
    seed: 'avatar-micro-01',
    headShape: 'circle',
    eyeShape: 'capsule',
    tiltMode: 'spatial3D',
    eyeSpacing: 0.38, // Bold readable spacing for 40px micro
    openness: 1.0,
    eyeWidth: 0.60,
    eyeHeight: 0.60,
  }),
};

function loadStoredState(): { scope: StudioTargetScope; configs: StudioTargetConfigs } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { scope: 'all', configs: DEFAULT_TARGET_CONFIGS };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const scope: StudioTargetScope =
        parsed.scope === 'main' || parsed.scope === 'small' || parsed.scope === 'micro' || parsed.scope === 'all'
          ? parsed.scope
          : 'all';
      const configs: StudioTargetConfigs = {
        main: { ...DEFAULT_TARGET_CONFIGS.main, ...(parsed.configs?.main || {}) },
        small: { ...DEFAULT_TARGET_CONFIGS.small, ...(parsed.configs?.small || {}) },
        micro: { ...DEFAULT_TARGET_CONFIGS.micro, ...(parsed.configs?.micro || {}) },
      };
      return { scope, configs };
    }
  } catch (e) {
    console.warn('Failed to parse avatar studio localStorage state:', e);
  }
  return { scope: 'all', configs: DEFAULT_TARGET_CONFIGS };
}

export function useStudioState() {
  const [scope, setScopeState] = useState<StudioTargetScope>(() => loadStoredState().scope);
  const [configs, setConfigs] = useState<StudioTargetConfigs>(() => loadStoredState().configs);

  // Automatically persist to localStorage whenever scope or configs change
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          scope,
          configs,
          updatedAt: Date.now(),
        })
      );
    } catch (e) {
      console.warn('Failed to save avatar studio state to localStorage:', e);
    }
  }, [scope, configs]);

  // Active target parameters for the inspector controls
  const activeTargetKey = scope === 'all' ? 'main' : scope;
  const activeParams = configs[activeTargetKey];

  // Generic updater for a single parameter
  const updateParam = useCallback(
    <K extends keyof StudioParams>(key: K, value: StudioParams[K]) => {
      setConfigs((prev) => {
        if (scope === 'all') {
          return {
            main: { ...prev.main, [key]: value },
            small: { ...prev.small, [key]: value },
            micro: { ...prev.micro, [key]: value },
          };
        }
        return {
          ...prev,
          [scope]: { ...prev[scope], [key]: value },
        };
      });
    },
    [scope]
  );

  // Updater for multiple parameters at once
  const updatePartial = useCallback(
    (partial: Partial<StudioParams>) => {
      setConfigs((prev) => {
        if (scope === 'all') {
          return {
            main: { ...prev.main, ...partial },
            small: { ...prev.small, ...partial },
            micro: { ...prev.micro, ...partial },
          };
        }
        return {
          ...prev,
          [scope]: { ...prev[scope], ...partial },
        };
      });
    },
    [scope]
  );

  // Full config updater from the shared AvatarStudio (Consona config source)
  const updateFullConfig = useCallback(
    (newConfig: ConsonaAvatarConfig) => {
      const newParams = avatarConfigToStudioParams(newConfig);
      setConfigs((prev) => {
        if (scope === 'all') {
          return {
            main: newParams,
            small: { ...prev.small, ...newParams },
            micro: { ...prev.micro, ...newParams },
          };
        }
        return {
          ...prev,
          [scope]: newParams,
        };
      });
    },
    [scope]
  );

  // Preset archetype helper
  const applyArchetypePreset = useCallback(
    (preset: 'hero' | 'zen' | 'spark' | 'smile' | 'cyber' | 'reset') => {
      switch (preset) {
        case 'hero':
          updatePartial({
            headShape: 'circle',
            eyeShape: 'capsule',
            tiltMode: 'spatial3D',
            tiltAngle: 16,
            eyeSpacing: 0.42,
            eyeYOffset: 0.0,
            eyeXOffset: 0.0,
            gazeExcursion: 0.50,
            openness: 1.0,
            eyeWidth: 0.50,
            eyeHeight: 0.50,
            headRoundness: 0.85,
            preset: 'calm',
          });
          break;
        case 'zen':
          updatePartial({
            headShape: 'squircle',
            eyeShape: 'line',
            tiltMode: 'parallel',
            tiltAngle: 0,
            eyeSpacing: 0.58,
            eyeYOffset: 0.14,
            eyeXOffset: 0.0,
            gazeExcursion: 0.20,
            openness: 0.35,
            eyeWidth: 0.60,
            eyeHeight: 0.15,
            headRoundness: 0.90,
            preset: 'sleepy',
          });
          break;
        case 'spark':
          updatePartial({
            headShape: 'circle',
            eyeShape: 'star',
            tiltMode: 'parallel',
            tiltAngle: 0,
            eyeSpacing: 0.38,
            eyeYOffset: 0.0,
            eyeXOffset: 0.0,
            gazeExcursion: 0.50,
            openness: 1.0,
            eyeWidth: 0.65,
            eyeHeight: 0.40,
            headRoundness: 0.85,
            preset: 'double-pulse',
          });
          break;
        case 'smile':
          updatePartial({
            headShape: 'arch',
            eyeShape: 'archUp',
            tiltMode: 'mirrored',
            tiltAngle: 0,
            eyeSpacing: 0.33,
            eyeYOffset: -0.07,
            eyeXOffset: 0.0,
            gazeExcursion: 0.40,
            openness: 1.0,
            eyeWidth: 0.55,
            eyeHeight: 0.35,
            headRoundness: 0.85,
            preset: 'happy',
          });
          break;
        case 'cyber':
          updatePartial({
            headShape: 'hexagon',
            eyeShape: 'cross',
            tiltMode: 'spatial3D',
            tiltAngle: 12,
            eyeSpacing: 0.48,
            eyeYOffset: 0.0,
            eyeXOffset: 0.0,
            gazeExcursion: 0.60,
            openness: 1.0,
            eyeWidth: 0.55,
            eyeHeight: 0.55,
            headRoundness: 0.70,
            surfaceShadow: true,
            showPupil: true,
            pupilScale: 0.52,
            pupilGazeTracking: 0.80,
            preset: 'scanning',
          });
          break;
        case 'reset':
        default:
          if (scope === 'all') {
            setConfigs(DEFAULT_TARGET_CONFIGS);
          } else {
            setConfigs((prev) => ({
              ...prev,
              [scope]: DEFAULT_TARGET_CONFIGS[scope],
            }));
          }
          break;
      }
    },
    [scope, updatePartial]
  );

  // Reset active target
  const resetActive = useCallback(() => {
    if (scope === 'all') {
      setConfigs(DEFAULT_TARGET_CONFIGS);
    } else {
      setConfigs((prev) => ({
        ...prev,
        [scope]: DEFAULT_TARGET_CONFIGS[scope],
      }));
    }
  }, [scope]);

  // Reset all targets and scope to defaults
  const resetAll = useCallback(() => {
    setScopeState('all');
    setConfigs(DEFAULT_TARGET_CONFIGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  // Compute ConsonaAvatarConfig for each avatar instance
  const mainAvatarConfig = useMemo(
    () => studioParamsToAvatarConfig(configs.main),
    [configs.main]
  );
  const smallAvatarConfig = useMemo(
    () => studioParamsToAvatarConfig(configs.small),
    [configs.small]
  );
  const microAvatarConfig = useMemo(
    () => studioParamsToAvatarConfig(configs.micro),
    [configs.micro]
  );

  return {
    scope,
    setScope: setScopeState,
    configs,
    activeParams,
    mainAvatarConfig,
    smallAvatarConfig,
    microAvatarConfig,
    updateParam,
    updatePartial,
    updateFullConfig,
    applyArchetypePreset,
    resetActive,
    resetAll,
  };
}
