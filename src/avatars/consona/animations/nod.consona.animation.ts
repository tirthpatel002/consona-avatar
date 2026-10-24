import { defineAnimation } from '../../../core/define/defineAnimation.ts';

export const consonaNodAnimation = defineAnimation({
  name: 'nod',
  duration: 0.75,
  loop: false,
  // Studio copy lives in animationUi.ts (single source)

  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 0.75));

    let downbeat1 = 0;
    if (p >= 0 && p < 0.46) {
      const t1 = p / 0.46;
      downbeat1 = Math.sin(t1 * Math.PI);
    }

    let downbeat2 = 0;
    if (p >= 0.46 && p <= 0.94) {
      const t2 = (p - 0.46) / 0.48;
      downbeat2 = Math.sin(t2 * Math.PI) * 0.78;
    }

    const downbeat = downbeat1 + downbeat2;
    const yOffset = downbeat * 9.5;
    const pitchAngle = downbeat * 0.2;
    const pitchGaze = downbeat * 0.42;
    const heightReduction = downbeat * 0.45;
    const eyeScaleY = 1.0 - heightReduction;
    const eyeScaleX = 1.0 + downbeat * 0.08;
    const nodPupilScale = 1.0 + downbeat * 0.28;

    return {
      'consona:headGroup': {
        yOffset,
        rotateX: pitchAngle,
      },
      'consona:head': {
        scaleX: 1.0 + downbeat * 0.04,
        scaleY: 1.0 - downbeat * 0.06,
      },
      'consona:eyes': {
        yOffset: yOffset * 1.08,
        rotateX: pitchAngle,
        scaleX: eyeScaleX,
        scaleY: eyeScaleY,
        openness: 1.0,
        gazeY: pitchGaze * 12,
        pupilScale: 0.48 * nodPupilScale,
      },
    };
  },
});

