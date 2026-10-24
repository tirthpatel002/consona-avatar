import type { AvatarInstance } from '../../../core/engine/AvatarInstance.ts';
import type { PlayOptions } from '../../../core/animation/AnimationInstance.ts';
import { createSpinAnimation, resolveSpinAnimationName } from '../animations/spin.consona.animation.ts';

/** Options of one Consona behavior clip run (`speed`, `weight`, spin `axis`, timeline `end` / `offset`). */
export type ConsonaClipOptions = PlayOptions;

/**
 * Play one behavior clip on a Consona instance (spin: `axis` picks / builds the
 * axis variant). Resolves when the clip finishes; `false` for unknown clips.
 * Internal to the Consona family: the public surface is `AvatarHandle.play()`.
 */
export function playConsonaClip(instance: AvatarInstance, name: string, options: ConsonaClipOptions = {}): Promise<boolean> {
  let resolved = name;
  if (name === 'spin' && options.axis !== undefined) {
    const named = resolveSpinAnimationName(options.axis);
    if (named) resolved = named;
    else {
      const custom = createSpinAnimation({ axis: options.axis });
      instance.mixer.register(custom);
      resolved = custom.name;
    }
  }
  const anim = instance.mixer.get(resolved);
  if (!anim) return Promise.resolve(false);
  const speed = options.speed ?? options.timeScale ?? anim.speed ?? anim.timeScale ?? 1.0;
  const playing = instance.mixer.play(resolved, {
    weight: options.weight ?? anim.weight ?? 1.0,
    timeScale: speed,
    loop: options.loop ?? anim.loop ?? false,
    end: options.end,
    offset: options.offset,
  });
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(true);
    };
    playing.onFinish(finish);
    setTimeout(finish, (anim.duration / speed) * 1000 + 5);
  });
}
