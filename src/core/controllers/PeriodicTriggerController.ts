import type { IAvatarController } from './IAvatarController.ts';
import type { AvatarInstance } from '../engine/AvatarInstance.ts';
import type { UpdateContext } from '../types/Lifecycle.ts';

export interface PeriodicTriggerOptions {
  id: string;
  minInterval?: number; // seconds
  maxInterval?: number; // seconds
  onTrigger: (instance: AvatarInstance) => void;
}

export class PeriodicTriggerController implements IAvatarController {
  readonly id: string;
  public enabled: boolean = true;
  /** Frequency multiplier (presets set it from their `blink.rate`; 0 = never). */
  public rate: number = 1;
  private minInterval: number;
  private maxInterval: number;
  private onTriggerCallback: (instance: AvatarInstance) => void;

  private instance?: AvatarInstance;
  private nextTriggerTime: number = 0;
  private elapsed: number = 0;

  constructor(options: PeriodicTriggerOptions) {
    this.id = options.id;
    this.minInterval = options.minInterval ?? 2.5;
    this.maxInterval = options.maxInterval ?? 5.5;
    this.onTriggerCallback = options.onTrigger;
    this.scheduleNext();
  }

  attach(instance: AvatarInstance): void {
    this.instance = instance;
    this.elapsed = 0;
    this.scheduleNext();
  }

  update(context: UpdateContext): void {
    if (!this.enabled || !this.instance || this.rate <= 0) return;

    this.elapsed += context.deltaTime * this.rate;
    if (this.elapsed >= this.nextTriggerTime) {
      this.onTriggerCallback(this.instance);
      this.elapsed = 0;
      this.scheduleNext();
    }
  }

  detach(): void {
    this.instance = undefined;
  }

  private scheduleNext(): void {
    const range = this.maxInterval - this.minInterval;
    this.nextTriggerTime = this.minInterval + Math.random() * range;
  }
}
