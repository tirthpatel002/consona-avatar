import { defineAnimation } from '../../../core/define/defineAnimation.ts';

function parabolicArc(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 4 * clamped * (1 - clamped);
}

export const consonaJumpAnimation = defineAnimation({
  name: 'jump',
  duration: 0.82,
  loop: false,
  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 0.82));
    let yOffset = 0;
    let scaleX = 1.0;
    let scaleY = 1.0;
    let eyeOpenness = 1.0;
    let gazeY = 0;
    let pupilScaleMult = 1.0;
    let pupilGazeSens = 1.0;

    if (p < 0.18) {
      // 1. Anticipation Crouch: pupil constricts in pre-jump tension (0.42x)
      const t = p / 0.18;
      const crouch = Math.sin(Math.PI * t);
      yOffset = crouch * 6.5;
      scaleY = 1.0 - crouch * 0.14;
      scaleX = 1.0 + crouch * 0.12;
      gazeY = crouch * 0.25;
      eyeOpenness = 1.0 - crouch * 0.1;
      pupilScaleMult = 1.0 - crouch * 0.58;
      pupilGazeSens = 0.70;
    } else if (p < 0.68) {
      // 2. Ballistic Airborne Arc & Apex: pupil dilates wide (+85%) and tracks landing ground
      const t = (p - 0.18) / 0.5;
      const arc = parabolicArc(t);
      yOffset = -arc * 38;

      const stretch = Math.cos(Math.PI * t);
      scaleY = 1.0 + stretch * 0.15;
      scaleX = 1.0 - stretch * 0.08;
      eyeOpenness = 1.0 + arc * 0.25;
      gazeY = -arc * 0.2;
      pupilScaleMult = 1.0 + arc * 0.85;
      pupilGazeSens = 1.0 + arc * 0.65;
    } else if (p < 0.86) {
      // 3. Impact Cushion Landing: pupil squashes and momentarily contracts (0.45x)
      const t = (p - 0.68) / 0.18;
      const impact = Math.sin(Math.PI * t);
      yOffset = impact * 7.5;
      scaleY = 1.0 - impact * 0.16;
      scaleX = 1.0 + impact * 0.14;
      gazeY = impact * 0.2;
      eyeOpenness = 1.0 - impact * 0.12;
      pupilScaleMult = 1.0 - impact * 0.55;
      pupilGazeSens = 0.75;
    } else {
      // 4. Elastic Rebound Settle to Baseline
      const t = (p - 0.86) / 0.14;
      const settle = Math.sin(Math.PI * t * 2) * Math.exp(-t * 3.5);
      yOffset = -settle * 3.0;
      scaleY = 1.0 + settle * 0.06;
      scaleX = 1.0 - settle * 0.05;
      eyeOpenness = 1.0;
      gazeY = 0;
      pupilScaleMult = 1.0 + settle * 0.25;
      pupilGazeSens = 1.0;
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
        openness: eyeOpenness,
        gazeY: gazeY * 12,
        pupilScale: 0.48 * pupilScaleMult,
      },
    };
  },
});
