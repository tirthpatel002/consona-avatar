import { defineAnimation } from '../../../core/define/defineAnimation.ts';

export const consonaSurpriseAnimation = defineAnimation({
  name: 'surprise',
  duration: 0.74,
  loop: false,
  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 0.74));
    const smoothP = Math.sin(p * Math.PI);

    // Rapid initial rise and smooth settling float
    const lift = Math.pow(smoothP, 0.7) * -16;
    const stretchY = 1.0 + smoothP * 0.18;
    const stretchX = 1.0 - smoothP * 0.09;
    const wideEyes = 1.0 + smoothP * 0.48;
    const gazeUp = -smoothP * 0.35;

    // Startled adrenaline surge: huge pupil dilation (+90%)
    const surprisePupilScale = 1.0 + smoothP * 0.90;

    return {
      'consona:headGroup': {
        yOffset: lift,
      },
      'consona:head': {
        scaleX: stretchX,
        scaleY: stretchY,
      },
      'consona:eyes': {
        yOffset: lift * 1.05,
        scaleX: stretchX,
        scaleY: stretchY,
        openness: wideEyes,
        gazeY: gazeUp * 12,
        pupilScale: 0.48 * surprisePupilScale,
      },
    };
  },
});
