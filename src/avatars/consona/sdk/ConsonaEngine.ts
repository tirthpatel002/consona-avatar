import { avatarEngine, AvatarEngine } from '../../../core/engine/AvatarEngine.ts';
import { AvatarInstance } from '../../../core/engine/AvatarInstance.ts';
import { SvgStringRenderer } from '../../../adapters/svg/index.ts';
import { consonaAvatar } from '../consona.avatar.ts';
import {
  type ConsonaAvatarConfig,
  type PartialConsonaAvatarConfig,
  type ConsonaPupilConfig,
  createDefaultAvatarConfig,
} from '../consona.config.ts';
import { CONSONA_PALETTES, resolvePalette, type ConsonaPaletteId, type PaletteDefinition } from '../palettes/consona.palettes.ts';
import { normalizeToCanvas } from '../layout/consona.layout.ts';
import { generateConsonaDefs } from '../defs/consona.defs.ts';
import { playConsonaClip } from './consonaClips.ts';
import { applyConsonaConfig, consonaPupilChannels, setConsonaChannel } from '../consona.apply.ts';

avatarEngine.registerDescriptor(consonaAvatar);

export interface CreateConsonaOptions {
  seed?: string;
  paletteId?: ConsonaPaletteId;
  mode?: 'light' | 'dark';
  config?: PartialConsonaAvatarConfig;
  size?: number;
}


/**
 * ConsonaEngine: thin product facade over AvatarEngine (create / render /
 * palettes / pupil + shadow scopes / blink). Config → channels lives in the
 * family (`applyConsonaConfig`, `interpolateConsonaConfig`); control a live
 * avatar through its `AvatarHandle` (`createConsonaAvatarHandle`).
 */
export class ConsonaEngine {
  readonly core: AvatarEngine;
  private readonly defaultSvgRenderer = new SvgStringRenderer();

  constructor(coreEngine: AvatarEngine = avatarEngine) {
    this.core = coreEngine;
    if (!this.core.getDescriptor('consona')) {
      this.core.registerDescriptor(consonaAvatar);
    }
  }

  readonly palettes = {
    get: (id: string): PaletteDefinition | undefined => CONSONA_PALETTES[id],
    getAll: () => ({ ...CONSONA_PALETTES }),
    resolve: (paletteId: string, mode?: 'light' | 'dark') => resolvePalette(paletteId, mode),
  };

  readonly eyes = {
    setPupil: (
      target: string | AvatarInstance,
      pupil: boolean | ConsonaPupilConfig,
      _options?: { animated?: boolean; durationMs?: number }
    ): void => {
      const instance = typeof target === 'string' ? this.core.getInstance(target) : target;
      if (!instance) return;
      const ch = consonaPupilChannels(pupil);
      for (const [key, val] of Object.entries(ch)) {
        setConsonaChannel(instance, 'consona:eyes', key, val);
      }
    },
    setGlobalPupil: (pupil: boolean | ConsonaPupilConfig, _updateExisting: boolean = true): void => {
      this.core.scope('global', { 'consona:eyes': consonaPupilChannels(pupil) });
    },
  };

  readonly head = {
    setSurfaceShadow: (target: string | AvatarInstance, enabled: boolean): void => {
      const instance = typeof target === 'string' ? this.core.getInstance(target) : target;
      if (!instance) return;
      setConsonaChannel(instance, 'consona:head', 'surfaceShadow', enabled);
    },
    setGlobalSurfaceShadow: (enabled: boolean, _updateExisting: boolean = true): void => {
      this.core.scope('global', { 'consona:head': { surfaceShadow: enabled } });
    },
  };

  /** One-shot blink on one avatar (or every Consona avatar). */
  triggerBlink(avatarId?: string): void {
    for (const inst of this.targetInstances(avatarId)) void playConsonaClip(inst, 'blink');
  }

  create(options?: CreateConsonaOptions): AvatarInstance {
    const seed = options?.seed ?? Math.random().toString(36).substring(2);
    const paletteId = options?.paletteId ?? 'light';
    const config = createDefaultAvatarConfig(seed, paletteId, options?.config);
    const instanceId = `consona-${seed}-${Math.random().toString(36).substring(2, 7)}`;
    const instance = this.core.createInstance(instanceId, 'consona');
    applyConsonaConfig(instance, config);
    return instance;
  }

  renderToSvg(
    configOrState: ConsonaAvatarConfig | PartialConsonaAvatarConfig,
    options?: { size?: number; background?: string; glow?: boolean }
  ): string {
    const config: ConsonaAvatarConfig =
      isFullConfig(configOrState)
        ? configOrState
        : createDefaultAvatarConfig('consona-default', 'light', configOrState);

    const size = options?.size ?? 100;
    const background = options?.background ?? 'transparent';
    const defs = generateConsonaDefs();

    const tempInstance = new AvatarInstance('temp-render', consonaAvatar);
    applyConsonaConfig(tempInstance, config);
    // Static export = the resting config: no preset modulation / procedural motion.
    tempInstance.animated = false;
    tempInstance.update(0);

    return this.defaultSvgRenderer.renderToString(tempInstance, {
      viewBox: '0 0 100 100',
      width: size,
      height: size,
      backgroundColor: background,
      extraDefs: defs,
    });
  }

  private targetInstances(avatarId?: string): AvatarInstance[] {
    if (avatarId) {
      const inst = this.core.getInstance(avatarId);
      return inst ? [inst] : [];
    }
    return this.core.getAllInstances();
  }
}

function isFullConfig(c: ConsonaAvatarConfig | PartialConsonaAvatarConfig): c is ConsonaAvatarConfig {
  return Boolean(c && c.head && c.eyes && (c as ConsonaAvatarConfig).paletteId);
}

export const consonaEngine = new ConsonaEngine();

export function renderAvatarToSvg(
  config: ConsonaAvatarConfig | PartialConsonaAvatarConfig,
  options?: { size?: number; background?: string; glow?: boolean }
): string {
  return consonaEngine.renderToSvg(config, options);
}
