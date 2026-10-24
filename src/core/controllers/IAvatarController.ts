import type { UpdateContext } from '../types/Lifecycle.ts';
import type { AvatarInstance } from '../engine/AvatarInstance.ts';

export interface IAvatarController {
  readonly id: string;
  attach(instance: AvatarInstance): void;
  update(context: UpdateContext): void;
  detach(): void;
}
