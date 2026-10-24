import { registerAvatarStudio } from '../../core/studio/manifest.ts';
import { registerAllieRandomizers } from './allie.randomizer.ts';
import { ALLIE_FAMILIES } from './allie.family.ts';

/** Allie studio: both Allie families in one tab, large 3D stage, no per-option renders. */
export function registerAllieStudio(): void {
  registerAllieRandomizers();
  registerAvatarStudio({
    id: 'allie',
    label: 'Allie',
    title: 'Allie Avatar Studio',
    families: [...ALLIE_FAMILIES],
    renderer: 'three',
    // zoom 1.3 = framing padding 1.0: the rest bounding sphere exactly fits the square stage (largest zoom with nothing clipped)
    stage: { size: 'large', zoom: 1.3 },
    previews: 'none',
    sections: [
      { id: 'characters', label: 'Characters / Atoms', items: [{ type: 'presets' }, { type: 'divider' }, { type: 'composer' }, { type: 'attach' }] },
      { id: 'parameters', label: 'Parameters', items: [{ type: 'channels' }, { type: 'controls', groups: '*' }] },
      { id: 'behaviors', label: 'Behaviors', items: [{ type: 'behaviors', chain: true }] },
      { id: 'events', label: 'Events', items: [{ type: 'events' }] },
    ],
    source: { kind: 'catalog' },
    order: 1,
  });
}
