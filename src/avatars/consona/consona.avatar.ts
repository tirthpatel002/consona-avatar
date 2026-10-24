// SVG scene-graph renderers (registers 'retained-svg' / 'svg-string' for this family's instances)
import '../../adapters/svg/index.ts';
import {
  defineAvatar,
  atom,
  group,
  lookAt,
  periodicPlay,
} from '../../core/define/index.ts';
import { consonaHeadAtom } from './atoms/head.consona.atom.ts';
import { consonaEyesAtom } from './atoms/eyes.consona.atom.ts';
import { CONSONA_ANIMATIONS } from './animations/index.ts';
import { generateConsonaDefs } from './defs/consona.defs.ts';
import { generateConsonaFromSeed } from './generators/consona.seed.generator.ts';
import { resolvePalette } from './palettes/consona.palettes.ts';
import { CONSONA_VARIANTS } from './variants/index.ts';
import { registerConsonaPresets } from './presets/consona.presets.ts';

registerConsonaPresets();

/**
 * consonaAvatar: product declaration.
 * headGroup owns the spherical plane; facePlane (eyes) inherits it so features stay coplanar.
 * Accessories that should stick to the head go under headGroup; screen-space UI uses inheritPlane: false.
 */
export const consonaAvatar = defineAvatar({
  id: 'consona',
  name: 'Consona Parametric Avatar',
  version: '2.0.0',
  canvas: { width: 100, height: 100, viewBox: '0 0 100 100' },
  nodePrefix: 'consona',
  defaultPaletteId: 'light',
  defaultSeed: 'consona-default',
  atoms: {
    head: consonaHeadAtom,
    eyes: consonaEyesAtom,
  },
  scene: [
    group(
      'headGroup',
      [
        atom('head'),
        // Inherits spherical plane from headGroup — eyes share the head surface
        group('facePlane', [atom('eyes')], { zIndex: 20 }),
      ],
      {
        plane: { type: 'spherical', center: [50, 48], radius: 38.5 },
        zIndex: 10,
      }
    ),
  ],
  animations: CONSONA_ANIMATIONS,
  variants: [...CONSONA_VARIANTS],
  // ambient motion = the resting preset (see presets/consona.presets.ts)
  preset: 'neutral',
  controllers: [
    lookAt({
      bindings: {
        eyeNodeId: 'eyes',
        headGroupNodeId: 'headGroup',
        squashNodeId: 'head',
      },
      maxEyeGazeExcursion: 8.5,
      maxHeadYawRad: 0.52,
      maxHeadPitchRad: 0.38,
      enableSquash: true,
    }),
    periodicPlay({
      id: 'auto-blink',
      animation: 'blink',
      minInterval: 2.8,
      maxInterval: 5.5,
    }),
  ],

  setup({ instance }): void {
    if (!instance) return;
    const initialPalId = instance.renderContext.paletteId || 'light';
    const palDef = resolvePalette(initialPalId, instance.renderContext.mode);
    instance.setPalette(initialPalId, palDef);
  },

  generateFromSeed(seed: string): Record<string, any> {
    return generateConsonaFromSeed(seed);
  },

  generateDefs: generateConsonaDefs,
});
