import { registerBehavior } from '../../core/animation/behaviors.ts';
import {
  defaultIdleBehavior as allieIdleBehavior,
  defaultWaveBehavior as allieWaveBehavior,
  defaultJumpBehavior as allieJumpBehavior,
  defaultSpinBehavior as allieSpinBehavior,
  defaultThinkBehavior as allieThinkBehavior,
  defaultSleepBehavior as allieSleepBehavior,
  defaultHappyBehavior as allieHappyBehavior,
  defaultBehaviors as allieBehaviors,
  defaultExtraBehaviors as allieThreadiesBehaviors,
} from '../../core/animation/defaultBehaviors.ts';

/**
 * Allie procedural behaviors: Allie uses the core default behavior set with its
 * current tuning (the defaults ARE Allie's tuning). Swap entries here to
 * retune Allie without touching other families.
 */
export {
  allieIdleBehavior, allieWaveBehavior, allieJumpBehavior, allieSpinBehavior, allieThinkBehavior, allieSleepBehavior, allieHappyBehavior, allieBehaviors, allieThreadiesBehaviors,
};
export const ALLIE_BEHAVIORS = allieBehaviors.map((a) => a.name);
export const ALLIE_THREADIES_BEHAVIORS = allieThreadiesBehaviors.map((a) => a.name);

export function registerAllieBehaviors(): void {
  for (const a of allieBehaviors) registerBehavior(a);
  for (const a of allieThreadiesBehaviors) registerBehavior(a);
}
