import { defineAnimation } from '../../../core/define/defineAnimation.ts';
import { evaluateBlinkAperture } from '../../../core/math/Waveforms.ts';

export const consonaBlinkAnimation = defineAnimation({
  name: 'blink',
  duration: 0.22,
  // a blink closes on its first frame (no fade-in)
  blendIn: 0,
  loop: false,
  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 0.22));
    const openness = evaluateBlinkAperture(p);
    return {
      'consona:eyes': {
        openness,
      },
    };
  },
});
