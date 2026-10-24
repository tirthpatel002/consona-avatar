import { hash32 } from '../preset/PresetLayer.ts';

/**
 * Fixed-capacity particle burst simulation (renderer-agnostic, allocation-free
 * after construction): flat Float32Arrays for position / velocity / life, so
 * a renderer copies them straight into instance matrices. Particles rise in a
 * soft fountain, slow down with drag, twinkle and fade; dead ones are swapped
 * out (alive particles stay packed in `[0, count)`).
 */
export interface ParticleBurstOptions {
  /** Upward launch speed (units / s, default 1.4). */
  speed?: number;
  /** Horizontal spread speed (default 0.9). */
  spread?: number;
  /** Lifetime range in s (default [0.9, 1.6]). */
  life?: readonly [number, number];
  /** Size range (default [0.05, 0.11]). */
  size?: readonly [number, number];
  /** Palette length (particles pick an index into it). */
  colors?: number;
  /** Scale of speeds / sizes (default 1). */
  scale?: number;
}

export class ParticleBurst {
  readonly capacity: number;
  /** Alive particles: `[0, count)`. */
  count = 0;
  readonly position: Float32Array;
  readonly velocity: Float32Array;
  /** Age / lifetime per particle (s). */
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  /** Twinkle phase per particle. */
  readonly phase: Float32Array;
  /** Palette index per particle. */
  readonly color: Uint8Array;
  /** Upward acceleration (negative = falls; sparkles drift and slow, default -0.6). */
  gravity = -0.6;
  /** Velocity drag per second (default 1.6). */
  drag = 1.6;
  private seq = 1;

  constructor(capacity = 96) {
    this.capacity = capacity;
    this.position = new Float32Array(capacity * 3);
    this.velocity = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.phase = new Float32Array(capacity);
    this.color = new Uint8Array(capacity);
  }

  get active(): boolean {
    return this.count > 0;
  }

  /** Seeded random in [0, 1). */
  private rand(): number {
    this.seq = hash32(this.seq, 0x68e31da4) || 1;
    return this.seq / 0x100000000;
  }

  /** Spawn up to `n` particles at (x, y, z); returns how many were spawned (capacity-bound). */
  emit(n: number, x: number, y: number, z: number, o: ParticleBurstOptions = {}, seed?: number): number {
    if (seed !== undefined) this.seq = hash32(seed, 0x2c1b3c6d) || 1;
    const k = o.scale ?? 1;
    const speed = (o.speed ?? 1.4) * k, spread = (o.spread ?? 0.9) * k;
    const [l0, l1] = o.life ?? [0.9, 1.6];
    const [s0, s1] = o.size ?? [0.05, 0.11];
    const colors = Math.max(1, o.colors ?? 1);
    let spawned = 0;
    for (let i = 0; i < n && this.count < this.capacity; i++) {
      const j = this.count++;
      const a = this.rand() * Math.PI * 2, r = Math.sqrt(this.rand());
      const p = j * 3;
      this.position[p] = x + Math.cos(a) * r * 0.12 * k;
      this.position[p + 1] = y;
      this.position[p + 2] = z + Math.sin(a) * r * 0.12 * k;
      this.velocity[p] = Math.cos(a) * r * spread;
      this.velocity[p + 1] = speed * (0.55 + 0.45 * this.rand());
      this.velocity[p + 2] = Math.sin(a) * r * spread * 0.6;
      this.age[j] = 0;
      this.life[j] = l0 + (l1 - l0) * this.rand();
      this.size[j] = (s0 + (s1 - s0) * this.rand()) * k;
      this.phase[j] = this.rand() * Math.PI * 2;
      this.color[j] = Math.floor(this.rand() * colors) % colors;
      spawned++;
    }
    return spawned;
  }

  /** Advance; returns true while anything is alive. */
  step(dt: number): boolean {
    if (this.count === 0) return false;
    const drag = Math.exp(-this.drag * dt);
    for (let j = 0; j < this.count; ) {
      this.age[j]! += dt;
      if (this.age[j]! >= this.life[j]!) {
        this.kill(j);
        continue;
      }
      const p = j * 3;
      this.velocity[p]! *= drag;
      this.velocity[p + 1] = this.velocity[p + 1]! * drag + this.gravity * dt;
      this.velocity[p + 2]! *= drag;
      this.position[p]! += this.velocity[p]! * dt;
      this.position[p + 1]! += this.velocity[p + 1]! * dt;
      this.position[p + 2]! += this.velocity[p + 2]! * dt;
      j++;
    }
    return this.count > 0;
  }

  /** 0..1 brightness of particle `j`: quick fade-in, twinkle, soft fade-out. */
  brightness(j: number): number {
    const t = this.age[j]! / this.life[j]!;
    const env = Math.min(1, t * 8) * (1 - t) * (1 - t);
    return env * (0.75 + 0.25 * Math.sin(this.phase[j]! + this.age[j]! * 14));
  }

  clear(): void {
    this.count = 0;
  }

  private kill(j: number): void {
    const last = --this.count;
    if (j === last) return;
    const p = j * 3, q = last * 3;
    for (let c = 0; c < 3; c++) {
      this.position[p + c] = this.position[q + c]!;
      this.velocity[p + c] = this.velocity[q + c]!;
    }
    this.age[j] = this.age[last]!;
    this.life[j] = this.life[last]!;
    this.size[j] = this.size[last]!;
    this.phase[j] = this.phase[last]!;
    this.color[j] = this.color[last]!;
  }
}
