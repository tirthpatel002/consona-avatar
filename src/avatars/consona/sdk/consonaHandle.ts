import type { AvatarHandle } from '../../../core/engine/AvatarHandle.ts';
import type { AvatarInstance } from '../../../core/engine/AvatarInstance.ts';
import type { AvatarStateMachine, AvatarPlayOptions, AvatarEvent, AvatarStateSnapshot } from '../../../core/animation/state-machine/AvatarStateMachine.ts';
import type { ConsonaEngine } from './ConsonaEngine.ts';
import { playConsonaClip } from './consonaClips.ts';
import { ANIMATION_CROSSFADE } from '../../../core/animation/AnimationInstance.ts';
import { attachPlugin } from '../../../core/plugins/plugin.ts';
import { getAvatarFamily } from '../../../core/catalog/catalog.ts';
import type { AvatarAnchorName } from '../../../core/atom/atom.ts';

const IDLE_STATE: AvatarStateSnapshot = { behavior: 'idle', preset: 'neutral', defaultPreset: 'neutral', queue: [], elapsed: 0, outcomes: [], message: null, channels: {} };

/** Consona is a face in a square box: where the abstract anchors sit (normalized, y down). */
const CONSONA_ANCHORS: Readonly<Partial<Record<AvatarAnchorName, readonly [number, number]>>> = {
  head: [0.5, 0.06],
  mouth: [0.5, 0.66],
  chest: [0.5, 0.92],
  base: [0.5, 1],
  hand: [0.82, 0.78],
  'hand.right': [0.82, 0.78],
  'hand.left': [0.18, 0.78],
};

/**
 * Unified `AvatarHandle` over a Consona (SVG) avatar, driven by the
 * instance's own `AvatarStateMachine`: every behavior clip is a `'clip'`-duration
 * behavior (queue, `then` chains, interrupts, start/end/preset events come from
 * the machine); the machine advances when the clip finishes (a looping clip runs until replaced and stops with its behavior). Presets are the
 * instance's `PresetLayer` (`apply`). The instance is resolved by id on every
 * call, so the handle can exist before it mounts.
 */
export function createConsonaAvatarHandle(engine: ConsonaEngine, id: string): AvatarHandle {
  const listeners = new Set<(e: AvatarEvent) => void>();
  let bound: { inst: AvatarInstance; machine: AvatarStateMachine; off: () => void } | null = null;
  // options of the run being started (machine.do emits 'start' synchronously)
  let starting: AvatarPlayOptions | undefined;
  let run = 0;

  const play = (inst: AvatarInstance, machine: AvatarStateMachine, name: string, o: AvatarPlayOptions | undefined) => {
    const token = ++run;
    const p = (o?.params ?? {}) as { axis?: never; speed?: number; weight?: number };
    const done = playConsonaClip(inst, name, { end: o?.end, offset: o?.offset, axis: p.axis, speed: p.speed, weight: p.weight });
    // a looping clip has no end of its own: the behavior runs until something replaces it
    if (inst.mixer.get(name)?.loop) return;
    void done.then(() => {
      if (token === run && bound?.inst === inst && machine.behavior === name) machine.complete();
    });
  };

  /** Bind to the live instance (re-binds when the avatar was re-created) and register its clips as behaviors. */
  const bind = () => {
    const inst = engine.core.getInstance(id);
    if (!inst) return null;
    if (bound?.inst !== inst) {
      bound?.off();
      const machine = inst.stateMachine;
      for (const name of inst.mixer.getAnimationNames()) if (!machine.has(name)) machine.register({ name, duration: 'clip', preset: null });
      const off = machine.subscribe((e) => {
        // the behavior ended (replaced / idle): its looping clip stops with it (fades, keeps the motion continuous)
        if (e.type === 'end' && inst.mixer.get(e.behavior)?.loop) inst.mixer.getInstance(e.behavior).fadeOut(ANIMATION_CROSSFADE);
        if (e.type === 'start' && e.behavior !== 'idle') {
          const o = starting;
          starting = undefined;
          play(inst, machine, e.behavior, o);
        }
        for (const l of listeners) l(e);
      });
      bound = { inst, machine, off };
    }
    return bound;
  };

  return {
    id,
    renderer: 'svg',
    get behaviors() {
      return bind()?.machine.behaviorNames ?? [];
    },
    get channels() {
      return bind()?.machine.channelSpecs ?? [];
    },
    behaviorSpec: (b) => bind()?.machine.behaviorSpec(b),
    get presets() {
      return bind()?.machine.presetNames ?? [];
    },
    get atoms() {
      return bind()?.machine.atomIds ?? [];
    },
    get attached() {
      return bind()?.machine.attached ?? [];
    },
    get state() {
      return bind()?.machine.getState() ?? IDLE_STATE;
    },
    play(name, o) {
      const b = bind();
      if (!b) return false;
      starting = o;
      const ok = b.machine.play(name, o);
      starting = undefined;
      return ok;
    },
    enqueue: (...names) => bind()?.machine.enqueue(...names) ?? false,
    resolve: (outcome) => bind()?.machine.resolve(outcome) ?? false,
    get message() {
      return bind()?.machine.message.view ?? null;
    },
    anchorOnScreen(anchor, out) {
      const p = CONSONA_ANCHORS[anchor];
      if (!p || !bind()) return false;
      out.x = p[0];
      out.y = p[1];
      return true;
    },
    pose() {
      // SVG avatars have no pose layer.
    },
    apply(m) {
      bind()?.inst.apply(m);
    },
    idle() {
      const b = bind();
      if (!b) return;
      run++;
      b.machine.idle();
      b.inst.mixer.stopAll();
    },
    blink: () => engine.triggerBlink(id),
    setGazeTarget(target) {
      const inst = bind()?.inst;
      if (!inst) return;
      const g = target ?? { x: 0, y: 0 };
      const excursion = inst.channels.getValue<number>('eyes:gazeExcursion') ?? 12;
      inst.channels.setValue('eyes:gazeX', g.x * excursion);
      inst.channels.setValue('eyes:gazeY', -g.y * excursion);
      inst.channels.setValue('eyes:pointerX', g.x);
      inst.channels.setValue('eyes:pointerY', -g.y);
    },
    playTimeline: (tl) => bind()?.inst.playTimeline(tl) ?? null,
    stopTimeline: () => bind()?.inst.stopTimeline(),
    // Channels: the SVG avatar has no colour tint / pulse / effects layer
    // (no-ops); channel expressions run on its machine (gaze / message state only).
    set: (c, v, o) => bind()?.machine.set(c, v, o?.immediate) ?? false,
    emit: (e) => bind()?.machine.emit(e),
    attach: (a, at) => bind()?.machine.attach(a, at) ?? false,
    detach: (a) => bind()?.machine.detach(a),
    use(plugin) {
      const m = bind()?.machine;
      if (!m) throw new Error('[consona] use() before the avatar is mounted');
      return attachPlugin(m, m.family, m.family ? getAvatarFamily(m.family)?.plugins : undefined, plugin);
    },
    get plugins() {
      return bind()?.machine.plugins ?? [];
    },
    subscribe(l) {
      bind();
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
