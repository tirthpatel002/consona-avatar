import { defineAnimation } from '../../../core/define/defineAnimation.ts';

function parabolicArc(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 4 * clamped * (1 - clamped);
}

export const consonaBounceAnimation = defineAnimation({
  name: 'bounce',
  duration: 0.78,
  loop: false,
  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 0.78));
    let yOffset = 0;
    let scaleX = 1.0;
    let scaleY = 1.0;
    let openness = 1.0;
    let pupilScaleMult = 1.0;

    if (p < 0.48) {
      // First high bounce: tight launch constriction (0.42x) -> wonder apex dilation (1.80x)
      const t = p / 0.48;
      const arc = parabolicArc(t);
      yOffset = -arc * 24;
      scaleY = 1.0 + (1 - t * 2) * 0.16;
      scaleX = 1.0 - (1 - t * 2) * 0.10;
      openness = 1.0 + arc * 0.2;
      pupilScaleMult = (1 - arc) * 0.42 + arc * 1.80;
    } else if (p < 0.86) {
      // Second lower bounce
      const t = (p - 0.48) / 0.38;
      const arc = parabolicArc(t);
      yOffset = -arc * 13;
      scaleY = 1.0 + (1 - t * 2) * 0.10;
      scaleX = 1.0 - (1 - t * 2) * 0.06;
      openness = 1.0 + arc * 0.12;
      pupilScaleMult = 1.0 + arc * 0.55;
    } else {
      // Settle
      const t = (p - 0.86) / 0.14;
      const settle = Math.sin(Math.PI * t * 2) * Math.exp(-t * 4);
      yOffset = -settle * 2.0;
      scaleY = 1.0 + settle * 0.04;
      scaleX = 1.0 - settle * 0.03;
      openness = 1.0;
      pupilScaleMult = 1.0 + settle * 0.20;
    }

    return {
      'consona:headGroup': {
        yOffset,
      },
      'consona:head': {
        scaleX,
        scaleY,
      },
      'consona:eyes': {
        yOffset: yOffset * 0.95,
        scaleX,
        scaleY,
        openness,
        pupilScale: 0.48 * pupilScaleMult,
      },
    };
  },
});
