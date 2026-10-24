import { AvatarPoseLayers, AvatarPoseWriter, applyPoseToRig, composePose, eulerToQuat, setIdentityPose, createAvatarPose, POSE_BODY_Q, POSE_HEAD_Q, POSE_SX, POSE_SY, POSE_SZ, POSE_Y } from '../animation/pose.ts';
import type { AvatarPose } from '../animation/pose.ts';
import type { ChannelBank, ChannelSpec } from '../channel/channel.ts';
import { stepReach, type AtomTracker, type AvatarReachState } from '../atom/atomLayer.ts';
import type { AvatarLimbTracker } from '../atom/limbLayer.ts';
import type { AvatarAnchorName } from '../atom/atom.ts';
import type { AvatarMessageTracker } from '../event/message.ts';
import type { AvatarFaceState, AvatarRig } from '../types/AvatarDefinition.ts';

/** What the resolver writes each frame (owned by the state machine, wired once). */
export interface AvatarResolverTargets {
  readonly face: AvatarFaceState;
  readonly atoms: AtomTracker;
  readonly reach: AvatarReachState;
  readonly limbs: AvatarLimbTracker;
  readonly message: AvatarMessageTracker;
}

const hasExpression = (s: ChannelSpec) => !!(s.pose || s.sway || s.eyes || s.mouth || s.limbs || s.gaze !== undefined || s.blinkRate !== undefined || s.atoms || s.params || s.tint);

/**
 * The resolver: one fixed-order, allocation-free per-frame step that turns
 * presets, channels and the running behavior into what renderers draw.
 *
 * Precedence (later wins where they overlap):
 *   1. preset   — config modulation + the preset's channel targets
 *   2. channels — eased values; their expressions add a relative pose (on
 *                 top of the behavior's layers), limb tone, gaze / blink
 *                 multipliers, and FILL the eye pose / mouth / atoms the
 *                 behavior leaves free
 *   3. behavior — its pose layers, face, atoms, limbs, message
 *   4. handle   — a `message` event (`emit`) wins over a behavior's message
 *
 * Channel expressions apply at weight `clamp(value, 0, 1)` (signed levels, min < 0:
 * `clamp(value, −1, 1)`, pose / sway / params / gaze / blink mirrored below 0); none weighted =
 * one branch per channel. `frame()` runs the whole order; every buffer is
 * allocated once, so a frame allocates nothing.
 */
export class AvatarResolver {
  /** Limb tone / gaze / blink multipliers from the channels this frame. */
  calm = 0;
  slack = 0;
  gaze = 1;
  blinkRate = 1;
  /** Strongest channel with a body tint this frame (-1 = none) and its weight. */
  tintSlot = -1;
  tintWeight = 0;
  /** True when any channel expression has weight (after `step`). */
  active = false;
  /** The behavior's pose layers (carry / hold across switches). */
  readonly layers = new AvatarPoseLayers();
  /** The behavior's relative pose this frame; `writer` fills it. */
  readonly behaviorPose = createAvatarPose();
  /** What a behavior writes into (`ctx.pose`). */
  readonly writer = new AvatarPoseWriter(this.behaviorPose);
  private readonly channelPose = createAvatarPose();
  private readonly finalPose = createAvatarPose();
  private readonly times: number[] = [];
  private readonly tmp = createAvatarPose();
  private readonly acc = createAvatarPose();

  /** Atoms the app attached (`attach` / `detach`): shown at full weight every frame. */
  readonly held: { id: string; anchor: AvatarAnchorName | null }[] = [];
  readonly channels: ChannelBank;
  private readonly out: AvatarResolverTargets;

  constructor(channels: ChannelBank, targets: AvatarResolverTargets) {
    this.channels = channels;
    this.out = targets;
  }

  /**
   * One frame in the fixed order: channels ease → channel multipliers →
   * behavior writes → channels fill what it left free → face / atoms / reach /
   * limbs → behavior layers, channel pose on top → rig → message (a handle
   * message wins inside the tracker). Returns true when the message changed.
   */
  frame<R extends AvatarRig>(dt: number, rig: R | undefined, behave: (() => void) | null, mode: 'relative' | 'absolute', blend: number): boolean {
    this.channels.step(dt);
    const posed = this.step(dt);
    const fw = this.writer, o = this.out;
    if (rig) {
      setIdentityPose(this.behaviorPose);
      fw.resetChannels();
      if (behave) behave();
      if (posed) this.writeChannels(fw);
      for (let i = 0; i < this.held.length; i++) {
        const h = this.held[i]!, aw = fw.atom(h.id, 1);
        if (h.anchor) aw.at(h.anchor);
      }
      const face = o.face;
      if (fw.eyeOverlayPose && fw.eyeOverlayWeight > 0) {
        const ov = (face.eyeOverlay ??= { pose: '', weight: 0, mirror: false });
        ov.pose = fw.eyeOverlayPose;
        ov.weight = Math.min(1, fw.eyeOverlayWeight);
        ov.mirror = fw.eyeOverlayMirror;
      } else face.eyeOverlay = null;
      face.mouth = fw.mouthShape;
      o.atoms.step(fw.atomWrites, fw.atomCount, dt);
      stepReach(o.reach, fw.reachWrite, dt);
      o.limbs.step(fw.limbWrites, fw.limbCount, fw.limbCalm, fw.limbSlack, dt);
      const pose = this.layers.compose(this.behaviorPose, mode, blend, dt);
      if (posed) {
        // the channel pose sits on its own buffer: the layers' carry / velocity never see it
        composePose(this.finalPose, pose, this.writePose(this.channelPose));
        applyPoseToRig(this.finalPose, rig);
      } else applyPoseToRig(pose, rig);
    }
    return o.message.step(fw.messageText, fw.messageWeight, fw.messageAnchor, dt);
  }

  /** Expression weight of slot `i` (0 when it has no expression; −1..1 for a signed level). */
  weight(i: number): number {
    const s = this.channels.slots[i];
    if (!s || !hasExpression(s.spec)) return 0;
    const v = s.value, lo = s.min < 0 && !s.rhythm ? -1 : 0;
    return v <= lo ? lo : v >= 1 ? 1 : v;
  }

  /** Stage 2: channel multipliers + sway clocks. True while any expression has weight. */
  step(dt: number): boolean {
    const slots = this.channels.slots, times = this.times;
    while (times.length < slots.length) times.push(0);
    let active = false;
    let calm = 0, slack = 0, gaze = 1, blink = 1, tintSlot = -1, tintWeight = 0;
    for (let i = 0; i < slots.length; i++) {
      const w = this.weight(i);
      if (w === 0) {
        times[i] = 0;
        continue;
      }
      times[i]! += dt;
      active = true;
      const s = slots[i]!.spec;
      if (s.limbs && w > 0) {
        calm = Math.max(calm, (s.limbs.calm ?? 0) * w);
        slack = Math.max(slack, (s.limbs.slack ?? 0) * w);
      }
      if (s.gaze !== undefined) gaze *= 1 + (s.gaze - 1) * w;
      if (s.blinkRate !== undefined) blink *= 1 + (s.blinkRate - 1) * w;
      if (s.tint && w > tintWeight) (tintSlot = i), (tintWeight = w);
    }
    this.tintSlot = tintSlot;
    this.tintWeight = tintWeight;
    this.active = active;
    this.calm = calm;
    this.slack = slack;
    this.gaze = gaze;
    this.blinkRate = blink;
    return active;
  }

  /** The channels' relative pose this frame (identity when none) into `out`. */
  writePose(out: AvatarPose): AvatarPose {
    setIdentityPose(out);
    const t = this.tmp, acc = this.acc, slots = this.channels.slots;
    for (let i = 0; i < slots.length; i++) {
      const w = this.weight(i);
      if (w === 0) continue;
      const spec = slots[i]!.spec, p = spec.pose, sw = spec.sway;
      if (!p && !sw) continue;
      setIdentityPose(t);
      let bx = 0, by = 0, bz = 0;
      if (p) {
        t[POSE_Y] = (p.y ?? 0) * w;
        const sc = p.scale;
        if (sc !== undefined) {
          const sx = typeof sc === 'number' ? sc : sc[0], sy = typeof sc === 'number' ? sc : sc[1], sz = typeof sc === 'number' ? sc : sc[2];
          t[POSE_SX] = 1 + (sx - 1) * w;
          t[POSE_SY] = 1 + (sy - 1) * w;
          t[POSE_SZ] = 1 + (sz - 1) * w;
        }
        if (p.body) (bx = p.body[0] * w), (by = p.body[1] * w), (bz = p.body[2] * w);
        if (p.head) eulerToQuat(t, POSE_HEAD_Q, p.head[0] * w, p.head[1] * w, p.head[2] * w);
      }
      if (sw && sw.period > 0) {
        const ph = ((this.times[i] ?? 0) / sw.period) * Math.PI * 2;
        bx += (sw.pitch ?? 0) * w * Math.sin(ph);
        bz += (sw.roll ?? 0) * w * Math.sin(ph * 0.5 + 1.3);
      }
      eulerToQuat(t, POSE_BODY_Q, bx, by, bz);
      acc.set(out);
      composePose(out, acc, t);
    }
    return out;
  }

  /** Channel face + atoms into the frame's writer: eye pose / mouth only where the behavior wrote none. */
  writeChannels(wr: AvatarPoseWriter): void {
    let eye: string | null = null, eyeW = 0, mouth: string | null = null, mouthW = 0;
    const slots = this.channels.slots;
    for (let i = 0; i < slots.length; i++) {
      const k = this.weight(i);
      if (k <= 0) continue;
      const s = slots[i]!.spec;
      if (s.eyes) {
        const ew = (s.eyes.weight ?? 1) * k;
        if (ew > eyeW) (eye = s.eyes.pose), (eyeW = ew);
      }
      if (s.mouth && k > 0.5 && k > mouthW) (mouth = s.mouth), (mouthW = k);
      const atoms = s.atoms;
      if (atoms) {
        for (let j = 0; j < atoms.length; j++) {
          const a = atoms[j]!;
          const aw = wr.atom(a.id, k);
          if (a.anchor) aw.at(a.anchor);
          if (a.offset) aw.offset(a.offset[0], a.offset[1], a.offset[2]);
          if (a.rotate) aw.rotate(a.rotate[0], a.rotate[1], a.rotate[2]);
        }
      }
    }
    if (eye && !(wr.eyeOverlayPose && wr.eyeOverlayWeight > 0)) wr.eyePose(eye, eyeW);
    if (mouth && wr.mouthShape === null) wr.mouth(mouth);
    if (this.calm > wr.limbCalm) wr.limbCalm = this.calm;
    if (this.slack > wr.limbSlack) wr.limbSlack = this.slack;
  }

  reset(): void {
    this.writer.resetChannels();
    this.layers.reset();
    this.times.fill(0);
    this.active = false;
    this.calm = this.slack = 0;
    this.gaze = this.blinkRate = 1;
  }
}
