import type { AnimationMeta } from '../../../core/define/defineAnimation.ts';

/** Studio/editor copy of the behavior clips (presets carry their own label / icon). */
export const CONSONA_ANIMATION_UI: Record<string, AnimationMeta> = {
  rotate: { label: 'Infinite 3D Rotate', icon: '🔄', description: 'Continuous looping 360° spin around 3D axis line' },
  pulse: { label: 'Pulse', icon: '💓', description: 'Single rhythmic double-beat scale surge' },
  spin: {
    label: '3D Multi-Axis Spin',
    icon: '🌀',
    description: 'Full 360° rigid spin around selected 3D spatial axis line',
  },
  jump: {
    label: 'Squishy Jump',
    icon: '🦘',
    description: 'Ballistic vertical leap with elastic jelly landing squash',
  },
  bounce: {
    label: 'Happy Bounce',
    icon: '🎈',
    description: 'Energetic double-hop with elastic harmonic rebound',
  },
  wave: { label: 'Tilt Wave', icon: '🌊', description: 'Curious ear-to-shoulder wobble & gaze shift' },
  nod: { label: 'Nod (Agree)', icon: '👍', description: 'Affirmative energetic double-nod tilt cycle' },
  shake: { label: 'Shake (No)', icon: '↔️', description: 'Expressive horizontal side-to-side disagreement' },
  wink: { label: 'Wink', icon: '😉', description: 'Cheeky single-eye wink with playful head tilt' },
  surprise: { label: 'Surprise / Gasp', icon: '😲', description: 'Startled gasp liftoff with wide aperture eyes' },
  lookaway: { label: 'Look Away', icon: '👀', description: 'Curious head and eye lateral aversion gesture' },
  blink: { label: 'Blink', icon: '✨', description: 'Instantaneous organic ocular blink impulse' },
};
