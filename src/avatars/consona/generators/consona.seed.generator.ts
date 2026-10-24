import type { ConsonaHeadShape, ConsonaEyeShape } from '../consona.config.ts';

/**
 * Fast 32-bit FNV-1a string hasher.
 */
export function hashStringToUint32(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic, fast Mulberry32 PRNG.
 */
export class Mulberry32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextFloat(min: number = 0, max: number = 1): number {
    return min + this.next() * (max - min);
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat(min, max + 1));
  }

  bool(chance: number = 0.5): boolean {
    return this.next() < chance;
  }

  pick<T>(array: readonly T[]): T {
    const idx = Math.floor(this.next() * array.length);
    return array[idx] as T;
  }
}

export interface ConsonaGeneratedState {
  head: {
    shape: ConsonaHeadShape;
    roundness: number;
    width: number;
    height: number;
  };
  eyes: {
    shape: ConsonaEyeShape;
    spacing: number;
    yOffset: number;
    width: number;
    height: number;
    openness: number;
    tiltDeg: number;
    pupilEnabled: boolean;
    pupilScale: number;
  };
}

export function generateConsonaFromSeed(seed: string): ConsonaGeneratedState {
  const prng = new Mulberry32(hashStringToUint32(seed || 'consona-default'));

  const headShapes: ConsonaHeadShape[] = ['circle', 'squircle', 'egg', 'arch', 'triangle', 'hexagon'];
  const headShape = prng.pick(headShapes);
  const headRoundness = 0.65 + prng.next() * 0.35;

  const eyeShapes: ConsonaEyeShape[] = [
    'capsule', 'dot', 'archUp', 'archDown', 'diamond', 'star', 'ring', 'squircle', 'halfPill', 'heart'
  ];
  const eyeShape = prng.pick(eyeShapes);

  const spacing = 16 + prng.next() * 12; // 16 to 28
  const yOffset = 42 + prng.next() * 4;   // 42 to 46
  const eyeWidth = 8.5 + prng.next() * 4.0;
  const eyeHeight = 18.0 + prng.next() * 6.0;

  const pupilEnabled = prng.bool(0.3);
  const pupilScale = 0.40 + prng.next() * 0.15;

  return {
    head: {
      shape: headShape,
      roundness: headRoundness,
      width: 78,
      height: 78,
    },
    eyes: {
      shape: eyeShape,
      spacing,
      yOffset,
      width: eyeWidth,
      height: eyeHeight,
      openness: 1.0,
      tiltDeg: 0,
      pupilEnabled,
      pupilScale,
    },
  };
}
