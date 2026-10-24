/**
 * Vibe plugin channels. A channel is a named, blendable input (a level or a
 * rhythm) whose `ChannelExpression` describes what it does to the avatar at
 * full weight: relative pose, sway, eye / mouth overlay, limb tone, gaze and
 * blink multipliers, even config `params` and a colour `tint`. The runtime
 * moves the level toward its target at the channel's `settle` rate and blends
 * the expression by the live weight — plugins never touch the renderers.
 */
import type { ChannelSpec } from '../../core/channel/channel.ts';

/** Deep focus: leans toward the screen, still limbs, steady gaze. */
export const focusChannel: ChannelSpec = {
  id: 'focus',
  label: 'Focus',
  description: 'Leans in, stills the limbs and steadies the gaze while the user works',
  // level channel 0..1 (default range); ~1 s to ease into the look, ~1 s out
  settle: 1,
  pose: {
    y: -0.01,
    // lean toward the screen (body X), a touch of head tilt; radians at full weight
    body: [0.14, 0, 0],
    head: [0.04, 0, -0.03],
    scale: [0.995, 1.01, 0.995],
  },
  // a very slow sway reads as "concentrating"
  sway: { period: 11, pitch: 0.008, roll: 0.006 },
  // eye pose overlays are relative; 'determined' exists in the shared face registry
  eyes: { pose: 'determined', weight: 0.5 },
  // limbs hold still and the avatar stops following the pointer with its eyes
  limbs: { calm: 1 },
  gaze: 0.25,
  blinkRate: 0.5,
};
