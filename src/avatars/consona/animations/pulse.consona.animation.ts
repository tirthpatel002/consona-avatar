import { defineAnimation } from '../../../core/define/defineAnimation.ts';

export const consonaPulseAnimation = defineAnimation({
  name: 'pulse',
  duration: 0.62,
  loop: false,
  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 0.62));
    let scale = 1.0;
    let openness = 1.0;
    let pupilScaleMult = 1.0;

    if (p < 0.42) {
      // Primary systole pulse
      const t = p / 0.42;
      const pulse = Math.sin(Math.PI * t);
      scale = 1.0 + pulse * 0.15;
      openness = 1.0 + pulse * 0.22;
      pupilScaleMult = 1.0 + pulse * 0.85;
    } else if (p < 0.82) {
      // Secondary echo pulse
      const t = (p - 0.42) / 0.40;
      const pulse = Math.sin(Math.PI * t);
      scale = 1.0 + pulse * 0.08;
      openness = 1.0 + pulse * 0.12;
      pupilScaleMult = 1.0 + pulse * 0.50;
    } else {
      scale = 1.0;
      openness = 1.0;
      pupilScaleMult = 1.0;
    }

    return {
      'consona:head': {
        scaleX: scale,
        scaleY: scale,
      },
      'consona:eyes': {
        scaleX: scale,
        scaleY: scale,
        openness,
        pupilScale: 0.48 * pupilScaleMult,
      },
    };
  },
});
