import { defineAnimation } from '../../../core/define/defineAnimation.ts';
import {
  evaluateRespirationWave,
  evaluateCardiacWave,
  evaluateBouncePhysics,
  evaluateBlinkAperture,
} from '../../../core/math/Waveforms.ts';
import { evaluateOrbitalGaze } from '../../../core/controllers/gaze.ts';
import { clamp } from '../../../core/math/Interpolation.ts';

/**
 * 1. idle: Serene stillness with subtle organic micro-sway and micro-breathing.
 * Exactly periodic over 4.0s duration.
 */
export const consonaIdlePresetAnimation = defineAnimation({
  name: 'idle',
  duration: 4.0,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 4.0;
    const microFloat = Math.sin(time * tau) * 1.2 + Math.sin(time * tau * 2) * 0.25;
    const microSway = Math.sin(time * tau) * 0.65;
    const breathPulse = Math.sin(time * tau) * 0.018;

    return {
      'consona:head': {
        yOffset: microFloat * 0.52,
        xOffset: microSway * 0.38,
        scaleX: 1.0 + breathPulse,
        scaleY: 1.0 - breathPulse * 0.75,
      },
      'consona:eyes': {
        yOffset: microFloat * 0.88,
        xOffset: microSway * 0.58,
        scaleX: 1.0 + breathPulse * 0.75,
        scaleY: 1.0 + Math.cos(time * tau) * 0.022,
        tiltDeg: Math.sin(time * tau) * 0.75,
        openness: 1.0,
      },
    };
  },
});

/**
 * 2. naturalBlink: Autonomous organic micro-respiration & attentive saccade cycle.
 * Note: Eyelid blinking is governed independently by the auto-blink controller and behavior mixer.
 * Exactly periodic over 3.5s duration.
 */
export const consonaNaturalBlinkPresetAnimation = defineAnimation({
  name: 'naturalBlink',
  duration: 3.5,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 3.5;
    const breath = Math.sin(time * tau) * 1.4;
    const sway = Math.sin(time * tau) * 0.6;

    return {
      'consona:head': {
        yOffset: breath * 0.5,
        xOffset: sway * 0.35,
        scaleX: 1.0 + Math.sin(time * tau) * 0.015,
        scaleY: 1.0 - Math.sin(time * tau) * 0.012,
      },
      'consona:eyes': {
        yOffset: breath * 0.8,
        xOffset: sway * 0.5,
        openness: 1.0,
        pupilScale: 0.48 + Math.sin(time * tau) * 0.06,
      },
    };
  },
});

/**
 * 3. breathing: Organic pulmonary respiration with volumetric expansion.
 * Exactly periodic over 3.8s duration.
 */
export const consonaBreathingPresetAnimation = defineAnimation({
  name: 'breathing',
  duration: 3.8,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 3.8;
    const breath = evaluateRespirationWave(time, 3.8, 0.45);
    const centeredBreath = breath - 0.5;

    const headFloatY = centeredBreath * -3.4;
    const eyeFloatY = centeredBreath * -4.8;
    const eyeSwayX = Math.sin(time * tau) * 0.38;

    const volHeadScaleY = 1.0 + centeredBreath * 0.05;
    const volHeadScaleX = 1.0 - centeredBreath * 0.032;
    const eyeWidthScale = 1.0 + centeredBreath * 0.045;
    const eyeHeightScale = 1.0 + centeredBreath * 0.085;

    return {
      'consona:head': {
        yOffset: headFloatY,
        xOffset: eyeSwayX * 0.55,
        scaleX: volHeadScaleX,
        scaleY: volHeadScaleY,
      },
      'consona:eyes': {
        yOffset: eyeFloatY,
        xOffset: eyeSwayX,
        scaleX: eyeWidthScale,
        scaleY: eyeHeightScale,
        spacing: 22 + centeredBreath * 1.1,
        openness: 0.95 + 0.1 * breath,
        tiltDeg: centeredBreath * 1.6,
        pupilScale: 0.48 * (1.0 + centeredBreath * 0.85),
      },
    };
  },
});

/**
 * 4. curiousTilt: Inquisitive head cock with attentive saccades and dilated pupils.
 * Exactly periodic over 4.8s duration.
 */
export const consonaCuriousTiltPresetAnimation = defineAnimation({
  name: 'curiousTilt',
  duration: 4.8,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 4.8;
    const cycle = time * tau;
    const sinTilt = Math.sin(cycle);
    const absSinTilt = Math.abs(sinTilt);
    const cockAngle = sinTilt * 14.5;
    const microLift = -absSinTilt * 2.6;

    const gazeX = Math.sin(cycle) * 3.5;
    const gazeY = -1.2 + Math.cos(cycle * 2) * 1.2;

    const eyeWidthScale = 1.02 + absSinTilt * 0.045;
    const eyeHeightScale = 1.07 + absSinTilt * 0.11;
    const eyeOffsetX = sinTilt * 3.8;
    const eyeOffsetY = microLift - 1.0;

    return {
      'consona:head': {
        yOffset: microLift * 0.62 - 0.9,
        xOffset: sinTilt * 3.0,
        scaleX: 1.02 + absSinTilt * 0.018,
        scaleY: 0.98 - absSinTilt * 0.014,
      },
      'consona:eyes': {
        xOffset: eyeOffsetX,
        yOffset: eyeOffsetY,
        scaleX: eyeWidthScale,
        scaleY: eyeHeightScale,
        spacing: 22 - absSinTilt * 1.1,
        tiltDeg: cockAngle,
        openness: 1.1 + absSinTilt * 0.09,
        gazeX,
        gazeY,
        pupilScale: 0.48 * (1.55 + absSinTilt * 0.35),
      },
    };
  },
});

/**
 * 5. thinking: 4-phase Catmull-Rom cognitive gaze traversal with contemplative slit.
 * Exactly periodic over 4.2s duration.
 */
export const consonaThinkingPresetAnimation = defineAnimation({
  name: 'thinking',
  duration: 4.2,
  loop: true,
  evaluate: (time: number) => {
    const loopDuration = 4.2;
    const tau = (Math.PI * 2) / loopDuration;
    const u = ((((time % loopDuration) + loopDuration) % loopDuration) / loopDuration) * 4.0;

    const WAYPOINTS = [
      { x: -5.5, y: -6.5 },
      { x: 0.0, y: -7.0 },
      { x: 5.5, y: -6.5 },
      { x: 0.0, y: 0.5 },
    ];

    const idx = Math.floor(u);
    const f = u - idx;
    const f2 = f * f;
    const f3 = f2 * f;

    const p0 = WAYPOINTS[(idx - 1 + 4) % 4]!;
    const p1 = WAYPOINTS[idx]!;
    const p2 = WAYPOINTS[(idx + 1) % 4]!;
    const p3 = WAYPOINTS[(idx + 2) % 4]!;

    const gazeX =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * f +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * f2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * f3);

    const gazeY =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * f +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * f2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * f3);

    const topElevation = Math.max(0, Math.min(1, (-gazeY + 0.5) / 7.0));
    const breathingDrift = Math.sin(time * tau) * -1.2;
    const tiltDeg = (gazeX / 5.5) * 12.0;

    const eyeWidthScale = 1.0 + topElevation * 0.22;
    const eyeHeightScale = 1.0 - topElevation * 0.35;
    const eyeOpenness = Math.max(0.35, 1.0 - topElevation * 0.32);

    return {
      'consona:head': {
        yOffset: breathingDrift * 0.5 + gazeY * 0.45,
        xOffset: gazeX * 0.65,
        scaleX: 1.0 - topElevation * 0.03,
        scaleY: 1.0 + topElevation * 0.04,
      },
      'consona:eyes': {
        xOffset: gazeX * 0.85,
        yOffset: gazeY * 0.75 + breathingDrift,
        scaleX: eyeWidthScale,
        scaleY: eyeHeightScale,
        tiltDeg: tiltDeg * 0.6,
        openness: eyeOpenness,
        gazeX,
        gazeY,
        pupilScale: 0.48 * (0.45 + topElevation * 0.55),
      },
    };
  },
});

/**
 * 6. confused: Alternating head tilt with continuously switching skepticism squint.
 * Exactly periodic over 4.0s duration.
 */
export const consonaConfusedPresetAnimation = defineAnimation({
  name: 'confused',
  duration: 4.0,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 4.0;
    const cycle = time * tau;
    const tiltWave = Math.sin(cycle);
    const tiltDeg = tiltWave * 12.0;
    const xOffset = tiltWave * 3.5;
    const yOffset = -Math.abs(tiltWave) * 1.8;

    const gazeX = Math.sin(cycle * 2) * 4.0;
    const gazeY = -1.5 + Math.cos(cycle) * 1.2;

    const squintDelta = tiltWave * 0.35;
    const leftOpenness = clamp(1.0 + squintDelta, 0.4, 1.35);
    const rightOpenness = clamp(1.0 - squintDelta, 0.4, 1.35);

    return {
      'consona:head': {
        xOffset,
        yOffset,
      },
      'consona:eyes': {
        xOffset: xOffset * 1.15,
        yOffset: yOffset * 1.15,
        tiltDeg: tiltDeg * 0.5,
        leftOpenness,
        rightOpenness,
        gazeX,
        gazeY,
        pupilScale: 0.48 * (1.35 + Math.abs(tiltWave) * 0.4),
      },
    };
  },
});

/**
 * 7. focusedListening: Affirmative rhythmic head nod with steady forward focus.
 * Exactly periodic over 1.8s duration.
 */
export const consonaFocusedListeningPresetAnimation = defineAnimation({
  name: 'focusedListening',
  duration: 1.8,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 1.8;
    const nodWave = Math.sin(time * tau);
    const nodY = nodWave * 2.4;
    const isNodDown = nodWave > 0;

    return {
      'consona:head': {
        yOffset: nodY * 0.82,
        scaleY: 1.0 - (isNodDown ? nodWave * 0.04 : 0),
        scaleX: 1.0 + (isNodDown ? nodWave * 0.03 : 0),
      },
      'consona:eyes': {
        yOffset: nodY * 1.08,
        scaleX: 1.02,
        scaleY: 1.07 - nodWave * 0.038,
        spacing: 21.6,
        openness: 1.07,
        tiltDeg: nodWave * 1.1,
        gazeY: nodWave * 0.6,
        pupilScale: 0.48 * (1.35 - nodWave * 0.2),
      },
    };
  },
});

/**
 * 8. playfulWink: Cheerful head micro-sway with joyful slant and playful squint.
 * Exactly periodic over 2.6s duration.
 */
export const consonaPlayfulWinkPresetAnimation = defineAnimation({
  name: 'playfulWink',
  duration: 2.6,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 2.6;
    const swaySin = Math.sin(time * tau);
    const swayY = -Math.abs(swaySin) * 2.8;
    const swayX = swaySin * 3.4;
    const winkCycle = (time % 2.6) / 2.6;
    let rightOpenness = 1.0;

    // Wink right eye between 0.35 and 0.65 of cycle
    if (winkCycle >= 0.35 && winkCycle <= 0.65) {
      const p = (winkCycle - 0.35) / 0.3;
      rightOpenness = evaluateBlinkAperture(p);
    }

    return {
      'consona:head': {
        yOffset: swayY * 0.62,
        xOffset: swayX,
        scaleX: 1.0 + swaySin * 0.04,
        scaleY: 1.0 - swaySin * 0.03,
      },
      'consona:eyes': {
        xOffset: swayX * 1.12,
        yOffset: swayY * 0.85,
        scaleX: 1.05 + Math.abs(swaySin) * 0.055,
        scaleY: 0.96 - Math.abs(swaySin) * 0.035,
        spacing: 22 + swaySin * 0.75,
        tiltDeg: swaySin * 9.0,
        leftOpenness: 1.05,
        rightOpenness,
        pupilScale: 0.48 * (1.45 + Math.abs(swaySin) * 0.25),
      },
    };
  },
});

/**
 * 9. jumpingSquishy: Continuous squash-and-stretch hopping bounce.
 * Exactly periodic over 1.2s duration.
 */
export const consonaJumpingSquishyPresetAnimation = defineAnimation({
  name: 'jumpingSquishy',
  duration: 1.2,
  loop: true,
  evaluate: (time: number) => {
    const bounce = evaluateBouncePhysics(time, 5.2, 12.0);
    return {
      'consona:head': {
        yOffset: bounce.yOffset * 0.75,
        scaleX: bounce.scaleX,
        scaleY: bounce.scaleY,
      },
      'consona:eyes': {
        yOffset: bounce.yOffset,
        scaleX: bounce.scaleX * 1.05,
        scaleY: bounce.scaleY * 1.08,
        openness: bounce.isPeak ? 1.15 : 0.85,
        pupilScale: 0.48 * (bounce.isPeak ? 1.6 : 0.6),
      },
    };
  },
});

/**
 * 10. drowsy: Heavy sinking head droop with flattened eyelid capsules.
 * Exactly periodic over 4.8s duration.
 */
export const consonaDrowsyPresetAnimation = defineAnimation({
  name: 'drowsy',
  duration: 4.8,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 4.8;
    const slowCycle = time * tau;
    const droopWave = (1.0 - Math.cos(slowCycle)) * 0.5; // Smooth 0 -> 1 -> 0
    const droopY = 2.4 + droopWave * 3.5;
    const eyelidDroop = Math.max(0.14, 0.45 - droopWave * 0.25);
    const swayX = Math.sin(slowCycle) * 1.6;

    return {
      'consona:head': {
        yOffset: droopY * 0.88,
        xOffset: swayX,
        scaleY: 1.0 - (droopY / 10) * 0.075,
        scaleX: 1.0 + (droopY / 10) * 0.055,
      },
      'consona:eyes': {
        yOffset: droopY + 1.0,
        xOffset: swayX * 1.08,
        scaleX: 1.09,
        scaleY: 0.72 - droopWave * 0.16,
        spacing: 23.1,
        openness: eyelidDroop,
        tiltDeg: Math.sin(slowCycle) * -2.0,
        gazeY: 3.5,
        pupilScale: 0.48 * (0.45 + (1.0 - droopWave) * 0.15),
      },
    };
  },
});

/**
 * 11. saccades: Ballistic focal shifts and ocular fixation jumps.
 * Exactly periodic over 4.0s duration.
 */
export const consonaSaccadesPresetAnimation = defineAnimation({
  name: 'saccades',
  duration: 4.0,
  loop: true,
  evaluate: (time: number) => {
    const step = Math.floor(time * 1.25);
    const f = (time * 1.25) % 1;
    const ease = f < 0.2 ? Math.sin((f / 0.2) * (Math.PI / 2)) : 1.0;

    const TARGETS = [
      { x: 3.5, y: -2.0 },
      { x: -3.2, y: -1.5 },
      { x: 0.0, y: 1.8 },
      { x: 4.2, y: 1.0 },
      { x: -4.0, y: 2.2 },
    ];

    const curr = TARGETS[step % TARGETS.length]!;
    const next = TARGETS[(step + 1) % TARGETS.length]!;
    const gazeX = curr.x + (next.x - curr.x) * ease;
    const gazeY = curr.y + (next.y - curr.y) * ease;

    return {
      'consona:head': {
        xOffset: gazeX * 0.45,
        yOffset: gazeY * 0.4,
      },
      'consona:eyes': {
        xOffset: gazeX * 0.65,
        yOffset: gazeY * 0.6,
        gazeX,
        gazeY,
        pupilScale: 0.48 * (ease < 0.9 ? 0.7 : 1.45),
      },
    };
  },
});

/**
 * 12. pulse: Rhythmic cardiac double-beat surge with synchronized scale.
 * Exactly periodic over 1.1s duration.
 */
export const consonaPulseLoopPresetAnimation = defineAnimation({
  name: 'pulseLoop',
  duration: 1.1,
  loop: true,
  evaluate: (time: number) => {
    const pulseAmp = evaluateCardiacWave(time, 1.1);
    const scaleBurstX = 1.0 + pulseAmp * 0.2;
    const scaleBurstY = 1.0 + pulseAmp * 0.25;
    const lift = -pulseAmp * 3.2;

    return {
      'consona:head': {
        scaleX: 1.0 + pulseAmp * 0.07,
        scaleY: 1.0 + pulseAmp * 0.12,
        yOffset: lift * 0.42,
      },
      'consona:eyes': {
        scaleX: scaleBurstX,
        scaleY: scaleBurstY,
        yOffset: lift,
        spacing: 22 + pulseAmp * 2.0,
        openness: 1.0 + pulseAmp * 0.14,
        pupilScale: 0.48 * (1.0 + pulseAmp * 0.8),
      },
    };
  },
});

/**
 * 13. radarScan: Futuristic horizon surveillance sweep.
 * Exactly periodic over 4.6s duration.
 */
export const consonaRadarScanPresetAnimation = defineAnimation({
  name: 'radarScan',
  duration: 4.6,
  loop: true,
  evaluate: (time: number) => {
    const sweepSpeed = (Math.PI * 2) / 4.6;
    const sweepX = Math.sin(time * sweepSpeed);
    const sweepY = -0.18 + Math.cos(time * sweepSpeed * 2.0) * 0.22;
    const absSweepX = Math.abs(sweepX);

    return {
      'consona:head': {
        xOffset: sweepX * 3.2,
        yOffset: Math.sin(time * sweepSpeed * 2) * 1.1,
        scaleX: 1.0 - absSweepX * 0.035,
        scaleY: 1.0 + absSweepX * 0.018,
      },
      'consona:eyes': {
        xOffset: sweepX * 4.4,
        yOffset: sweepY * 2.0,
        scaleX: 1.0 + absSweepX * 0.11,
        scaleY: 1.0 - absSweepX * 0.055,
        spacing: 22 - absSweepX * 1.6,
        gazeX: sweepX * 6.5,
        gazeY: sweepY * 4.0,
        tiltDeg: -Math.cos(time * sweepSpeed) * 7.5,
        pupilScale: 0.48 * (1.0 + absSweepX * 0.55),
      },
    };
  },
});

/**
 * 14. dizzySpin: Harmonic orbital gaze & gyroscopic head roll.
 * Exactly periodic over 2.5s duration.
 */
export const consonaDizzySpinPresetAnimation = defineAnimation({
  name: 'dizzySpin',
  duration: 2.5,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 2.5;
    const orbit = evaluateOrbitalGaze(time, 2.5, 4.5, 3.2);
    const wobbleTilt = Math.sin(time * tau) * 18;
    const sinOrbit = Math.sin(time * tau);

    return {
      'consona:head': {
        xOffset: orbit.x * 0.65,
        yOffset: sinOrbit * 2.2,
        scaleX: 1.0 + sinOrbit * 0.045,
        scaleY: 1.0 - sinOrbit * 0.045,
      },
      'consona:eyes': {
        xOffset: orbit.x,
        yOffset: orbit.y,
        scaleX: 1.0 + sinOrbit * 0.12,
        scaleY: 1.0 - sinOrbit * 0.12,
        tiltDeg: wobbleTilt,
        gazeX: orbit.x,
        gazeY: orbit.y,
        openness: 0.94 + Math.abs(sinOrbit) * 0.14,
        pupilScale: 0.48 * (1.1 + sinOrbit * 0.5),
      },
    };
  },
});

/**
 * 15. happyBounce: Playful squash-and-stretch hopping looping across positions.
 * Exactly periodic over 1.92s duration (3 hops of 0.64s).
 */
export const consonaHappyBouncePresetAnimation = defineAnimation({
  name: 'happyBounce',
  duration: 1.92,
  loop: true,
  evaluate: (time: number) => {
    const hopDuration = 0.64;
    const totalCycle = 1.92;
    const cycleT = (((time % totalCycle) + totalCycle) % totalCycle);
    const stepProgress = (cycleT % hopDuration) / hopDuration;
    const arc = Math.sin(stepProgress * Math.PI);
    const yOffset = -arc * 8.5;

    const stepIndex = Math.floor(cycleT / hopDuration);
    const POSITIONS = [-4.0, 0.0, 4.0];
    const prevIndex = (stepIndex + 2) % 3;
    const fromX = POSITIONS[prevIndex]!;
    const toX = POSITIONS[stepIndex]!;
    const ease = 0.5 - 0.5 * Math.cos(stepProgress * Math.PI);
    const currentX = fromX + (toX - fromX) * ease;

    const squash = arc < 0.28 ? (0.28 - arc) / 0.28 : 0;
    const stretch = arc >= 0.28 ? (arc - 0.28) / 0.72 : 0;

    return {
      'consona:head': {
        yOffset: yOffset * 0.65,
        xOffset: currentX * 0.75,
        scaleX: 1.0 + squash * 0.12 - stretch * 0.06,
        scaleY: 1.0 - squash * 0.1 + stretch * 0.08,
      },
      'consona:eyes': {
        yOffset,
        xOffset: currentX,
        scaleX: 1.0 + squash * 0.2 - stretch * 0.1,
        scaleY: 1.0 - squash * 0.22 + stretch * 0.14,
        openness: 1.0 + stretch * 0.15 - squash * 0.2,
        pupilScale: 0.48 * (1.0 + stretch * 0.7 - squash * 0.45),
      },
    };
  },
});

/**
 * 16. tremble: High-frequency micro-jitter vibration with constricted alert pupils.
 * Exactly periodic over 1.0s duration.
 */
export const consonaTremblePresetAnimation = defineAnimation({
  name: 'tremble',
  duration: 1.0,
  loop: true,
  evaluate: (time: number) => {
    const tau = Math.PI * 2;
    const jitterX = Math.sin(time * tau * 26) * 1.6 + Math.sin(time * tau * 52) * 0.5;
    const jitterY = Math.cos(time * tau * 30) * 0.9;
    const shudderPulse = Math.pow(Math.max(0, Math.sin(time * tau)), 8) * 3.5;

    return {
      'consona:head': {
        xOffset: jitterX,
        yOffset: jitterY - shudderPulse * 0.4,
        scaleX: 0.96,
        scaleY: 1.04,
      },
      'consona:eyes': {
        xOffset: jitterX * 1.1,
        yOffset: jitterY - shudderPulse * 0.6,
        scaleX: 0.94 + Math.sin(time * tau * 26) * 0.04,
        scaleY: 1.08 - Math.sin(time * tau * 26) * 0.04,
        openness: 1.12 + Math.sin(time * tau * 26) * 0.06,
        pupilScale: 0.48 * (0.46 + Math.sin(time * tau * 18) * 0.08),
      },
    };
  },
});

/**
 * 17. nap: Peaceful slumber with closed eyelids, rhythmic deep respiration & dream drift.
 * Exactly periodic over 4.2s duration.
 */
export const consonaNapPresetAnimation = defineAnimation({
  name: 'nap',
  duration: 4.2,
  loop: true,
  evaluate: (time: number) => {
    const tau = (Math.PI * 2) / 4.2;
    const breath = evaluateRespirationWave(time, 4.2, 0.48);
    const centeredBreath = breath - 0.5;
    const headSinkY = 4.2 + centeredBreath * -3.6;
    const slowDreamDriftX = Math.sin(time * tau) * 0.8;

    return {
      'consona:head': {
        yOffset: headSinkY,
        xOffset: slowDreamDriftX * 0.5,
        scaleX: 1.0 - centeredBreath * 0.04,
        scaleY: 1.0 + centeredBreath * 0.06,
      },
      'consona:eyes': {
        yOffset: headSinkY + 1.2,
        xOffset: slowDreamDriftX,
        openness: 0.03 + Math.max(0, centeredBreath) * 0.02,
        gazeY: 3.5,
        tiltDeg: Math.sin(time * tau) * -1.5,
        pupilScale: 0.48 * 0.3,
      },
    };
  },
});
