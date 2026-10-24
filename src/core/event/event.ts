import type { AvatarEffectRequest } from './effects.ts';
import type { AvatarMessageOptions } from './message.ts';

/**
 * What `emit()` takes: a one-shot effect (drained by the renderer), or a
 * message (wins over a behavior's message; `text: null` clears it). Cues
 * are events a behavior emits on its own timeline (`BehaviorCue`).
 */
export type AvatarEventRequest =
  | ({ type: 'effect' } & AvatarEffectRequest)
  | ({ type: 'message'; text: string | null } & AvatarMessageOptions);
