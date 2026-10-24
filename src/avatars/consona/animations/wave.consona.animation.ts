import { defineAnimation } from '../../../core/define/defineAnimation.ts';

export const consonaWaveAnimation = defineAnimation({
  name: 'wave',
  duration: 0.84,
  loop: false,
  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 0.84));

    // Soft attack + continuous damped decay tail
    const attack = Math.sin(Math.min(1.0, p / 0.15) * (Math.PI / 2));
    const decay = Math.pow(1.0 - p, 1.3) * Math.exp(-p * 1.1);
    const envelope = attack * decay * 1.6;

    const phase = p * Math.PI * 2 * 1.5; // 1.5 cycles
    const wobble = Math.sin(phase) * envelope;
    const tiltDeg = wobble * 12;
    const tiltRad = (tiltDeg * Math.PI) / 180;
    const xOffset = wobble * 7.5;
    const gazeX = wobble * 0.42;

    const wavePupilScale = 1.05 + Math.abs(wobble) * 0.50;

    return {
      'consona:headGroup': {
        xOffset,
        rotateZ: tiltRad,
      },
      'consona:eyes': {
        xOffset: xOffset * 1.1,
        rotateZ: tiltRad,
        gazeX: gazeX * 12,
        tiltDeg: wobble * 4,
        openness: 1.0 + Math.abs(wobble) * 0.12,
        pupilScale: 0.48 * wavePupilScale,
      },
    };
  },
});
