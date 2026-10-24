import { moveToward } from '../math/Interpolation.ts';
import type { AvatarAnchorName } from './atom.ts';

/**
 * Multi-limb gestures of the pose layer (renderer-agnostic), next to the
 * single-hand `reach`: behaviors / postures write per-frame requests
 *
 *   pose.limb(3, 'chest', w).offset(-0.4, 0.1, 0.3);   // limb 3 toward a point by the chest
 *   pose.limbTone(calm, slack);                        // 1 = still (listening) / limp (tired)
 *
 * Limb indices are the family's (e.g. 8 tentacles); families map
 * them onto their rig (Three: the `tentacles` part pulls each chain toward a
 * reach arc). The state machine folds the writes into `AvatarLimbTracker`:
 * rate-limited (a limb nobody writes relaxes back to physics, no snap),
 * allocation-free after first use of a limb.
 */
export class AvatarLimbWrite {
  limb = -1;
  target: AvatarAnchorName | null = null;
  weight = 0;
  approach = 0;
  ox = 0;
  oy = 0;
  oz = 0;
  reset(limb: number, target: AvatarAnchorName | null, weight: number, approach: number): this {
    this.limb = limb;
    this.target = target;
    this.weight = weight;
    this.approach = approach;
    this.ox = this.oy = this.oz = 0;
    return this;
  }
  /** Point to reach relative to the anchor (body units, body axes); `approach` 1 cancels it (onto the anchor). */
  offset(x: number, y: number, z: number): this {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    return this;
  }
}

export interface AvatarLimbState {
  readonly limb: number;
  target: AvatarAnchorName | null;
  /** 0..1 (rate-limited). */
  weight: number;
  /** Requested this frame. */
  want: number;
  approach: number;
  ox: number;
  oy: number;
  oz: number;
}

/** Limb weight ramp time (s): a reaching limb eases in / out over this. */
export const AVATAR_LIMB_TRANSITION = 0.4;
/** Limb tone ramp time (s). */
export const AVATAR_LIMB_TONE_TRANSITION = 0.5;

export class AvatarLimbTracker {
  /** Every limb written so far (weight 0 = relaxed back to physics). */
  readonly states: AvatarLimbState[] = [];
  /** 0..1: limbs hold still (strong rest pull, heavy damping), e.g. while listening. */
  calm = 0;
  /** 0..1: limbs go limp (weak rest pull), e.g. tired. */
  slack = 0;
  /** Number of limbs with weight > 0 (renderers early-exit at 0). */
  active = 0;

  get(limb: number): AvatarLimbState | undefined {
    for (let i = 0; i < this.states.length; i++) if (this.states[i]!.limb === limb) return this.states[i];
    return undefined;
  }

  step(writes: readonly AvatarLimbWrite[], count: number, calm: number, slack: number, dt: number): void {
    const states = this.states;
    for (let i = 0; i < states.length; i++) states[i]!.want = 0;
    for (let i = 0; i < count; i++) {
      const w = writes[i]!;
      if (w.limb < 0 || !w.target) continue;
      let s = this.get(w.limb);
      if (!s) states.push((s = { limb: w.limb, target: w.target, weight: 0, want: 0, approach: 0, ox: 0, oy: 0, oz: 0 }));
      const k = Math.min(1, Math.max(0, w.weight));
      if (k < s.want) continue;
      s.want = k;
      s.target = w.target;
      s.approach = Math.min(1, Math.max(0, w.approach));
      s.ox = w.ox;
      s.oy = w.oy;
      s.oz = w.oz;
    }
    let active = 0;
    for (let i = 0; i < states.length; i++) {
      const s = states[i]!;
      s.weight = moveToward(s.weight, s.want, dt / AVATAR_LIMB_TRANSITION);
      if (s.weight > 0) active++;
    }
    this.active = active;
    this.calm = moveToward(this.calm, Math.min(1, Math.max(0, calm)), dt / AVATAR_LIMB_TONE_TRANSITION);
    this.slack = moveToward(this.slack, Math.min(1, Math.max(0, slack)), dt / AVATAR_LIMB_TONE_TRANSITION);
  }

  reset(): void {
    for (const s of this.states) s.weight = s.want = 0;
    this.active = 0;
    this.calm = this.slack = 0;
  }
}
