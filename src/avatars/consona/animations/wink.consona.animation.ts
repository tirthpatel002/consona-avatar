import { defineAnimation } from '../../../core/define/defineAnimation.ts';

export const consonaWinkAnimation = defineAnimation({
  name: 'wink',
  duration: 0.58,
  loop: false,
  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 0.58));
    const smoothP = Math.sin(p * Math.PI);

    // Right eye smoothly closes shut with quintic ease
    const winkClose = Math.pow(smoothP, 1.8);
    const rightOpenness = Math.max(0.02, 1.0 - winkClose * 0.98);

    // Left eye perks open slightly in excitement
    const leftOpenness = 1.0 + smoothP * 0.16;

    // Cheerful micro bounce & tilt
    const yOffset = -smoothP * 5.0;
    const tiltDeg = -smoothP * 6.5;
    const tiltRad = (tiltDeg * Math.PI) / 180;

    // Playful mischievous perk dilation
    const winkPupilScale = 1.0 + smoothP * 0.75;

    return {
      'consona:headGroup': {
        yOffset,
        rotateZ: tiltRad,
      },
      'consona:eyes': {
        yOffset: yOffset * 1.1,
        rotateZ: tiltRad,
        leftOpenness,
        rightOpenness,
        openness: 1.0,
        pupilScale: 0.48 * winkPupilScale,
      },
    };
  },
});
