import { defineAnimation } from '../../../core/define/defineAnimation.ts';

export const consonaShakeAnimation = defineAnimation({
  name: 'shake',
  duration: 0.78,
  loop: false,
  evaluate: (time: number) => {
    const p = Math.max(0, Math.min(1.0, time / 0.78));

    // Soft attack (first 15%) + continuous C2-smooth decay tail
    const attack = Math.sin(Math.min(1.0, p / 0.15) * (Math.PI / 2));
    const decay = Math.pow(1.0 - p, 1.4) * Math.exp(-p * 1.5);
    const envelope = attack * decay * 1.8;

    // Harmonic oscillation: ~2.85 cycles with subtle wavelength relaxation
    const phase = p * Math.PI * 2 * (2.85 - p * 0.35);
    const wave = Math.sin(phase) * envelope;
    const tiltWave = Math.sin(phase - 0.35) * envelope;

    const xOffset = wave * 11.5;
    const tiltRad = (-tiltWave * 5.0 * Math.PI) / 180;
    const yawGaze = wave * 0.40;
    const yawAngle = wave * 0.22; // 3D sphere yaw rotation

    const waveVelocity = Math.abs(Math.cos(phase)) * envelope;
    const shakePupilScale = 0.82 + waveVelocity * 0.45;

    return {
      'consona:headGroup': {
        xOffset,
        rotateZ: tiltRad,
        rotateY: yawAngle,
      },
      'consona:eyes': {
        xOffset: xOffset * 1.12,
        rotateZ: tiltRad,
        rotateY: yawAngle,
        gazeX: yawGaze * 12,
        openness: 0.96 + Math.abs(wave) * 0.08,
        pupilScale: 0.48 * shakePupilScale,
      },
    };
  },
});
