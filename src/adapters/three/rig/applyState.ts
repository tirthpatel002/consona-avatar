import * as THREE from 'three';
import type { AvatarAccessory, AvatarDefinition } from '../../../core/types/AvatarDefinition.ts';
import { AvatarRuntime } from '../../../core/engine/AvatarRuntime.ts';
import type { AvatarRuntimeHandle, AvatarRuntimeOptions } from '../../../core/engine/AvatarRuntime.ts';
import { assembleRig } from './assembleRig.ts';
import type { RigAccessory, ThreeAvatarRig } from './assembleRig.ts';
import { bindGltfToAvatar, loadGltf } from './gltf.ts';
import type { GltfAvatarBinding } from './gltf.ts';
import { isResolvedAvatar } from '../../../core/define/resolveAvatar.ts';
import { defineAvatar } from '../../../core/define/defineAvatar.ts';
import type { ResolvedAvatarDefinition } from '../../../core/define/resolveAvatar.ts';
import { tintFromBody } from '../../../core/color/tint.ts';
import type { TintMode } from '../../../core/color/tint.ts';
import type { Rgb } from '../../../core/color/color.ts';
import { Tween, easeInCubic, easeOutSoftBack } from '../../../core/math/Motion.ts';
import { COLOR_SPRING, POP_SPRING, PROP_SPRING, Spring } from '../../../core/math/Spring.ts';
import { ColorSpring, colorToRgb } from '../../../core/color/color.ts';
import { FurTweens } from './parts/furTweens.ts';
import { diffAvatarDefinitions } from '../../../core/define/diffAvatar.ts';
import { gazeTargetFromDirection } from '../../../core/controllers/gaze.ts';
import { eyeLayout } from '../../../core/face/eyes.ts';
import { JellySim, applyJelly } from './parts/jelly.ts';
import { createBodyTarget } from './parts/body.ts';
import { morphBody, snapshotBody } from './parts/bodyGrid.ts';
import type { BodyTarget } from './parts/bodyGrid.ts';
import { registerPresetRebuildPaths } from '../../../core/preset/presets.ts';
import { createAnchorFrame } from './anchors.ts';
import type { AvatarAnchorName } from '../../../core/atom/atom.ts';
import type { PresetValue } from '../../../core/preset/presets.ts';
import { glowForValence, leanColor, tintForValence, valencePaletteOf } from '../../../core/color/valence.ts';
import type { ChannelTint } from '../../../core/channel/channel.ts';
import { CHANNEL_VALENCE } from '../../../core/channel/channel.ts';
import type { RigFrame } from './atomDrawers.ts';
import type { EyeFrame } from './parts/reliefEyes.ts';

// Paths that need a geometry / material rebuild (or a resample) on Three rigs: presets never modulate them.
registerPresetRebuildPaths(null, ['body.shape', 'body.params', 'furPattern', 'furStrands', 'fur.shells', 'fur.knit', 'fur.pattern', 'fur.patternRepeat', 'fur.strandRepeat', 'fur.regions', 'eyes.shape', 'accessories', 'model', 'rig']);

/** Fur params a preset can modulate live (pushed into the fur springs, no rebuild). */
const PRESET_FUR: Record<string, 'length' | 'density' | 'rootShade' | 'droop' | 'patternShade' | 'bumpScale'> = {
  'fur.length': 'length',
  'fur.density': 'density',
  'fur.rootShade': 'rootShade',
  'fur.droop': 'droop',
  'fur.patternShade': 'patternShade',
  'fur.bumpScale': 'bumpScale',
};
const PRESET_JELLY = ['jelly.stiffness', 'jelly.damping', 'jelly.amount', 'jelly.idle', 'jelly.poke'];

export interface AvatarFrame {
  dt: number;
  time: number;
  camera: THREE.Camera;
  /** Pointer in NDC (-1..1), or null when pointer follow is off. */
  pointer: THREE.Vector2 | null;
}

export interface ThreeAvatarControllerOptions extends AvatarRuntimeOptions {
  /** Quiet time before shape/eye/accessory edits start morphing, in s (default 0.12; slider drags retarget). */
  swapDebounce?: number;
  /** Body morph duration in s (default 0.55). */
  morphDuration?: number;
}


type Anim = (dt: number) => boolean; // returns true while running
const POOL_MAX = 24;
const fnIds = new WeakMap<object, number>();
let fnSeq = 0;
const keyOf = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => {
    if (typeof x === 'function') {
      if (!fnIds.has(x)) fnIds.set(x, ++fnSeq);
      return `fn#${fnIds.get(x)}`;
    }
    return x;
  });

/**
 * Binds a rig + state machine, and handles blink, gaze (whole-body turn),
 * jelly secondary motion and in-place definition edits. One per avatar; the
 * rig (body, fur, embedded eyes) lives as long as the controller — edits
 * morph it, they never rebuild it.
 */
const TMP_REST = new THREE.Vector3();

export class ThreeAvatarController extends AvatarRuntime<ThreeAvatarRig> implements AvatarRuntimeHandle {
  private compositionSeen = 0;
  private readonly extended = new Set<string>();
  readonly jelly: JellySim;
  gltf: GltfAvatarBinding | null = null;
  private readonly opts: Required<ThreeAvatarControllerOptions>;
  private disposed = false;
  private readonly tmp = new THREE.Vector3();
  // ---- in-place edits ----
  private anims: Anim[] = [];
  private pending: ResolvedAvatarDefinition | null = null;
  private pendingT = 0;
  private readonly bodyColor: ColorSpring;
  private readonly bodyScale: Spring;
  /** Live fur tweens: owned by the rig's fur part (fallback: own instance for fur-less rigs). */
  private readonly fur: FurTweens;
  private tweening = false;
  private bodyMorph: { from: BodyTarget; to: BodyTarget; tw: Tween } | null = null;
  private patternMix: Tween | null = null;
  /** Hidden, reusable accessories (scaled out, never disposed during edits). */
  private readonly pool = new Map<string, RigAccessory[]>();
  private readonly accKeys = new Map<RigAccessory, string>();
  /** Body-local bounds of each accessory at rest scale (for stable camera framing). */
  private readonly accBoxes = new Map<RigAccessory, THREE.Box3>();
  // eye shape swaps blink through (close, swap geometry at the bottom, reopen)
  private swapBlink = 0; // 0..1 closing, 1..2 opening
  private pendingShape: string | null = null;
  // ---- gaze ----
  private readonly lastPointer = new THREE.Vector2(NaN, NaN);
  /** Behavior-only orientations (gaze is layered on top each frame, then removed before the next behavior step). */
  private readonly gq = new THREE.Quaternion();
  private readonly ge = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly ray = new THREE.Ray();
  private readonly plane = new THREE.Plane();
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly v4 = new THREE.Vector3();
  private readonly v5 = new THREE.Vector3();
  private readonly jellyCenter = new THREE.Vector3();
  /** Camera of the last frame (anchor projection for overlays) + scratch. */
  private viewCamera: THREE.Camera | null = null;
  private readonly screenFrame = createAnchorFrame();
  private readonly screenPoint = new THREE.Vector3();
  // ---- presets ----
  private readonly presetGaze = { x: 0, y: 0 };
  private presetFur = false;
  private presetJelly = false;
  // ---- valence tint / glow, per-frame rig frame ----
  /** Body colour as shown (spring colour after the valence tint, sRGB). */
  private readonly shownRgb: Rgb = [1, 1, 1];
  /** Valence glow colour (sRGB) + strength. */
  private readonly glowRgb: Rgb = [1, 1, 1];
  private glowK = 0;
  /** Valence the colours were last written for (NaN = never). */
  private tintApplied = NaN;
  /** Channel tint (slot, weight) the colours were last written for. */
  private chTintSlot = -1;
  private chTintWeight = 0;
  /** Live `valence` channel (core slot). */
  private get valence(): number {
    return this.machine.channels.slots[CHANNEL_VALENCE]!.value;
  }
  private colorRevision = 0;
  /** Materials that follow the body colour (collected once; reset on structural edits). */
  private colorMats: THREE.MeshStandardMaterial[] | null = null;
  /** The one frame object handed to every rig-part updater (refilled each frame, never reallocated). */
  private readonly rigFrame: RigFrame;
  /** Reused frame for the eye rig (no per-frame allocation). */
  private readonly eyeFrame: EyeFrame = { dt: 0, preset: 'neutral', blink: 0, eyeOverlay: null, resample: false, body: [1, 1, 1], tint: undefined, furLength: 0 };

  constructor(definition: AvatarDefinition, options: ThreeAvatarControllerOptions = {}) {
    const def = isResolvedAvatar(definition) ? definition : defineAvatar(definition);
    super(def, assembleRig(def), options);
    this.opts = { followPointer: true, blink: true, blinkInterval: [2, 5], swapDebounce: 0.12, morphDuration: 0.55, ...defined(options) };
    this.jelly = this.rig.jelly ?? new JellySim(false);
    this.markBodyColored(this.rig.procedural, def.body.color);
    this.colorRef = def.body.colorRef ?? def.body.color;
    this.refreshColorRefRgb();
    for (const a of this.rig.accessories) {
      this.accKeys.set(a, this.accessoryKey(a.spec, def));
      this.accBoxes.set(a, restBox(a.object, this.rig.body));
    }
    this.bodyColor = new ColorSpring(def.body.color, COLOR_SPRING);
    const c0 = colorToRgb(def.body.color);
    this.shownRgb[0] = c0[0];
    this.shownRgb[1] = c0[1];
    this.shownRgb[2] = c0[2];
    this.liveBody = this.shownRgb;
    const m0 = this.machine;
    this.rigFrame = {
      dt: 0,
      time: 0,
      blink: 0,
      eyeOverlay: null,
      mouthShape: null,
      atoms: m0.atoms.states,
      reach: m0.reach,
      preset: m0.face.preset,
      definition: def,
      revision: 0,
      rig: this.rig,
      bodyRgb: this.shownRgb,
      glowRgb: this.glowRgb,
      glow: 0,
      valence: 0,
      colorRevision: 0,
      channels: m0.channels,
      limbs: m0.limbs,
      effects: m0.effects,
      camera: null,
    };
    this.bodyScale = new Spring(def.body.scale ?? 1, PROP_SPRING);
    this.fur = this.rig.furTweens ?? new FurTweens(def);
    // eyes: persistent rig, shape + layout from the definition
    this.rig.eyes?.setShape(def.eyes.shape);
    this.rig.eyes?.setLayout(this.eyeLayoutFor(def), def.eyes, true);
    const model = def.model;
    if (model) {
      loadGltf(model.url)
        .then((gltf) => {
          if (this.disposed) return;
          this.gltf = bindGltfToAvatar(gltf, this.rig, this.machine, model);
        })
        .catch((err) => console.warn(`[avatar:${this.id}] failed to load model ${model.url}`, err));
    }
  }

  get object(): THREE.Group {
    return this.rig.root;
  }

  // ----- in-place definition edits -----

  /**
   * Show a new definition on the SAME rig: numbers/colours tween; body shape
   * morphs the shared fixed-topology geometry (fur shells share it); yarn
   * patterns crossfade inside the fur materials; shell count fades layers;
   * eyes glide / re-shape on the same meshes (shape swaps blink through); accessories scale in/out from a pool. Nothing that
   * is on screen is disposed. Works across ids too (character switch).
   */
  setDefinition(input: AvatarDefinition): void {
    const next = isResolvedAvatar(input) ? input : defineAvatar(input);
    const cur = this.pending ?? this.definition;
    const d = diffAvatarDefinitions(cur, next);
    if (!d.changed) return;
    const t = d.tween;
    if (t.bodyColor !== undefined) this.bodyColor.set(t.bodyColor);
    if (t.bodyScale !== undefined) this.bodyScale.set(t.bodyScale);
    this.fur.retarget(t);
    // eye numbers / colours (spacing, size, lid, depth…) and the anchor tween immediately
    if (d.eyes !== 'none' || d.anchor) this.rig.eyes?.setLayout(this.eyeLayoutFor(next), next.eyes);
    if (Object.keys(t).length) {
      this.tweening = true;
      // atom edits ripple the soft body a little (water-balloon react)
      if (t.bodyScale !== undefined || t.bodyColor !== undefined) this.jelly.kick(-0.18, 0.08);
      else this.jelly.kick(-0.08, 0.04);
    }
    if (d.jelly) this.jelly.setOptions(next.jelly);
    this.applyRuntimeDiff(d, next);
    if (d.rig) console.warn(`[avatar:${this.id}] GLB model changes apply on the next mount`);
    if (d.body || d.furPattern || d.furStrands || d.eyes === 'shape' || d.accessories) {
      // heavier in-place work (resampling a body) waits for slider input to settle
      this.pending = next;
      this.pendingT = this.opts.swapDebounce;
    } else if (this.pending) this.pending = next;
    else this.commit(next);
  }

  /**
   * World bounding sphere of the avatar's REST pose at its target definition:
   * the body shape it is morphing toward, the target scale and the wanted
   * accessories — independent of tweens, jelly and behaviors, so a host can
   * frame it continuously without jumps.
   */
  restSphere(out = new THREE.Sphere()): THREE.Sphere {
    const box = new THREE.Box3();
    const target = this.bodyMorph?.to;
    if (target) box.copy(boxOfTarget(target));
    else {
      const g = this.rig.bodyGeometry;
      if (!g.boundingBox) g.computeBoundingBox();
      box.copy(g.boundingBox!);
    }
    for (const a of this.rig.accessories) {
      const b = this.accBoxes.get(a);
      if (b) box.union(b);
    }
    const s = this.bodyScale.target;
    box.min.multiplyScalar(s);
    box.max.multiplyScalar(s);
    // REST placement: the pose layer bobs root.y (jump/bounce); framing must not follow it.
    const r = this.rig.root.position;
    box.translate(TMP_REST.set(r.x, this.rig.baseY, r.z));
    return box.getBoundingSphere(out);
  }

  protected override rekeyed(oldId: string, newId: string): void {
    this.rig.root.name = `avatar:${newId}`;
    super.rekeyed(oldId, newId);
  }

  /** Poke the body at a world point (jelly dent + wobble). */
  poke(point: THREE.Vector3, strength = 1): void {
    this.jelly.pokeAt(point, strength);
  }

  private commit(next: ResolvedAvatarDefinition): void {
    this.rig.layers?.setRegions(next.fur ? next.fur.regions : []);
    this.definition = next;
    this.colorRef = next.body.colorRef ?? this.colorRef;
    this.refreshColorRefRgb();
    this.rig.definition = next;
  }

  private applyStructural(next: ResolvedAvatarDefinition): void {
    const prev = this.definition;
    const d = diffAvatarDefinitions(prev, next);
    this.commit(next);
    this.colorMats = null; // materials may have been swapped: re-collect on the next colour write
    const rig = this.rig;
    const rebuildBody = rig.bodyGeometry.userData.rebuildBody as ((body: ResolvedAvatarDefinition['body']) => void) | undefined;
    if (d.body && rebuildBody) {
      // non-grid bodies (e.g. `sdfBody`) rebuild their geometry in place instead of morphing
      rebuildBody(next.body);
      this.jelly.kick(-0.65, 0.28);
      this.tweening = true;
    } else if (d.body) {
      const to = createBodyTarget(next.body, this.rig.bodyCenterY);
      const geo = rig.bodyGeometry;
      this.bodyMorph = { from: snapshotBody(geo), to, tw: new Tween(this.opts.morphDuration, easeOutSoftBack) };
      this.jelly.kick(-0.65, 0.28);
      this.tweening = true;
    }
    if (d.furStrands && next.fur) rig.layers?.setStrandRepeat(next.fur.strandRepeat);
    if (d.furPattern && next.fur) {
      rig.layers?.beginPattern(next.fur.pattern, next.fur.patternRepeat);
      this.patternMix = new Tween(0.42, easeOutSoftBack);
      this.tweening = true;
    }
    if (rig.eyes && (d.eyes === 'shape' || next.eyes.shape !== rig.eyes.shape)) {
      // eye shape swap: close the eyes, swap the geometry on the same meshes at the bottom, reopen
      this.pendingShape = next.eyes.shape;
      if (this.swapBlink === 0 || this.swapBlink > 1) this.swapBlink = Math.max(1e-4, this.swapBlink > 1 ? 2 - this.swapBlink : 0);
    }
    if (d.accessories || d.body || d.furPattern) this.updateAccessories(next, d.body);
  }

  /** Accessory identity: its spec on a given body shape + yarn (placement/fur depend on them). */
  private accessoryKey(spec: AvatarAccessory, def: ResolvedAvatarDefinition): string {
    const { color: _c, scale: _s, colorRef: _r, ...shape } = def.body;
    return keyOf([spec, shape, def.fur ? [def.fur.pattern, def.fur.patternRepeat] : false]);
  }

  /** Pool-backed accessory update: leaving ones scale out and park hidden; entering ones are reused or built, then spring in. */
  private updateAccessories(next: ResolvedAvatarDefinition, bodyMorphing: boolean): void {
    const rig = this.rig;
    const want = (next.accessories ?? []).filter((a) => a.enabled !== false);
    const active = [...rig.accessories];
    const keep: RigAccessory[] = [];
    const delay = bodyMorphing ? this.opts.morphDuration * 0.55 : 0;
    for (const spec of want) {
      const key = this.accessoryKey(spec, next);
      const i = active.findIndex((a) => this.accKeys.get(a) === key);
      if (i >= 0) {
        keep.push(active.splice(i, 1)[0]!);
        continue;
      }
      let a = this.pool.get(key)?.pop();
      if (!a) {
        a = rig.buildAccessory(spec, { target: bodyMorphing ? this.bodyMorph?.to : undefined, def: next });
        applyJelly(a.object, this.jelly.uniforms);
        a.object.userData.restScale = a.object.scale.clone();
        this.accKeys.set(a, key);
        rig.procedural.add(a.object);
        this.accBoxes.set(a, restBox(a.object, rig.body));
      }
      this.scaleIn(a, delay);
      keep.push(a);
    }
    for (const a of active) this.scaleOut(a);
    const oldHand = rig.hand;
    rig.accessories = keep;
    rig.refreshHand();
    if (rig.hand && oldHand && rig.hand !== oldHand) rig.hand.rotation.z = rig.handRest;
  }

  private scaleIn(a: RigAccessory, delay: number): void {
    const o = a.object;
    const rest = (o.userData.restScale as THREE.Vector3 | undefined) ?? (o.userData.restScale = o.scale.clone());
    o.userData.anim = (o.userData.anim ?? 0) + 1;
    const token = o.userData.anim;
    o.visible = true;
    o.scale.copy(rest).multiplyScalar(0.001);
    const s = new Spring(0.001, POP_SPRING).set(1);
    let wait = delay;
    this.anims.push((dt) => {
      if (o.userData.anim !== token) return false;
      if (wait > 0) {
        wait -= dt;
        return true;
      }
      o.scale.copy(rest).multiplyScalar(Math.max(0.001, s.update(dt)));
      return !s.settled;
    });
  }

  private scaleOut(a: RigAccessory): void {
    const o = a.object;
    const rest = (o.userData.restScale as THREE.Vector3 | undefined) ?? (o.userData.restScale = o.scale.clone());
    o.userData.anim = (o.userData.anim ?? 0) + 1;
    const token = o.userData.anim;
    const from = o.scale.x / (rest.x || 1);
    const tw = new Tween(0.18, easeInCubic);
    this.anims.push((dt) => {
      if (o.userData.anim !== token) return false;
      const k = tw.update(dt);
      o.scale.copy(rest).multiplyScalar(Math.max(0.001, from * (1 - k)));
      if (!tw.done) return true;
      o.visible = false;
      this.park(a);
      return false;
    });
  }

  private park(a: RigAccessory): void {
    const key = this.accKeys.get(a)!;
    const list = this.pool.get(key) ?? [];
    list.push(a);
    this.pool.set(key, list);
    let total = 0;
    for (const l of this.pool.values()) total += l.length;
    // bound memory: only long-hidden extras are ever disposed (never anything visible)
    for (const [k, l] of this.pool) {
      while (total > POOL_MAX && l.length) {
        const old = l.shift()!;
        disposeObject(old.object);
        this.accKeys.delete(old);
        this.accBoxes.delete(old);
        total--;
      }
      if (!l.length) this.pool.delete(k);
    }
  }

  private markBodyColored(root: THREE.Object3D, color: AvatarDefinition['body']['color']): void {
    const [r, g, b] = colorToRgb(color);
    const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.color && Math.abs(m.color.r - c.r) + Math.abs(m.color.g - c.g) + Math.abs(m.color.b - c.b) < 1e-3) m.userData.followBody = true;
    });
    // accessories follow through the relative tint pass instead (and may opt out)
    for (const a of this.rig.accessories) a.object.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m?.userData) delete m.userData.followBody;
    });
  }

  /** Body colour the accessories / tinted eye parts were authored against. */
  private colorRef: AvatarDefinition['body']['color'] = '#ffffff';
  /** Parsed `colorRef`, refreshed whenever `colorRef` is assigned. */
  private colorRefRgb: Rgb = [1, 1, 1];

  private refreshColorRefRgb(): void {
    const [r, g, b] = colorToRgb(this.colorRef);
    this.colorRefRgb[0] = r;
    this.colorRefRgb[1] = g;
    this.colorRefRgb[2] = b;
  }

  /**
   * Re-tint accessories from the live (tweening) body colour. Materials
   * remember their authored colour; if something else rewrites a colour, that
   * becomes the new authored colour. (Eyes are tinted by the eye rig.)
   */
  private applyTints(body: Rgb): void {
    for (const a of this.rig.accessories) {
      if (a.spec.followBody === false) continue;
      a.object.traverse((o) => this.tintMaterial((o as THREE.Mesh).material, this.colorRefRgb, body, 'accessory'));
    }
  }

  /** Body-relative tint for eye colours (eye rules: neutrals fixed). */
  private eyeTint = (c: Rgb): Rgb => tintFromBody(c, this.colorRefRgb, this.liveBody, 'eye');
  private liveBody: Rgb = [1, 1, 1];

  private tintMaterial(mat: THREE.Material | THREE.Material[] | undefined, ref: Rgb, body: Rgb, mode: TintMode): void {
    const m = mat as THREE.MeshStandardMaterial | undefined;
    if (!m || Array.isArray(mat) || !m.color) return;
    const ud = m.userData;
    m.color.getRGB(TMP_RGB, THREE.SRGBColorSpace);
    const ap = ud.tintApplied as Rgb | undefined;
    if (!ud.tintBase || !ap || Math.abs(ap[0] - TMP_RGB.r) + Math.abs(ap[1] - TMP_RGB.g) + Math.abs(ap[2] - TMP_RGB.b) > 2e-3) {
      ud.tintBase = [TMP_RGB.r, TMP_RGB.g, TMP_RGB.b];
      ud.tintEmissive = !!m.emissive && m.emissive.equals(m.color);
    } else {
      // steady state: same authored colour, same ref/body inputs, material still
      // shows the tint we last wrote — skip the tint math and all writes
      const lr = ud.tintRefRgb as Rgb | undefined, lb = ud.tintBodyRgb as Rgb | undefined;
      if (
        lr &&
        lb &&
        Math.abs(lr[0] - ref[0]) + Math.abs(lr[1] - ref[1]) + Math.abs(lr[2] - ref[2]) < 1e-6 &&
        Math.abs(lb[0] - body[0]) + Math.abs(lb[1] - body[1]) + Math.abs(lb[2] - body[2]) < 1e-6
      ) {
        return;
      }
    }
    const out = tintFromBody(ud.tintBase as Rgb, ref, body, mode);
    m.color.setRGB(out[0], out[1], out[2], THREE.SRGBColorSpace);
    if (ud.tintEmissive && m.emissive) m.emissive.copy(m.color);
    m.color.getRGB(TMP_RGB, THREE.SRGBColorSpace);
    const applied = (ud.tintApplied as Rgb | undefined) ?? (ud.tintApplied = [0, 0, 0]);
    applied[0] = TMP_RGB.r;
    applied[1] = TMP_RGB.g;
    applied[2] = TMP_RGB.b;
    const lastRef = (ud.tintRefRgb as Rgb | undefined) ?? (ud.tintRefRgb = [0, 0, 0]);
    const lastBody = (ud.tintBodyRgb as Rgb | undefined) ?? (ud.tintBodyRgb = [0, 0, 0]);
    lastRef[0] = ref[0];
    lastRef[1] = ref[1];
    lastRef[2] = ref[2];
    lastBody[0] = body[0];
    lastBody[1] = body[1];
    lastBody[2] = body[2];
    const u = ud.fur as { uRim?: { value: THREE.Color } } | undefined;
    u?.uRim?.value.copy(m.color).lerp(WHITE, 0.5);
  }

  /** Push the tweened values into uniforms/transforms/geometry. */
  private applyLive(): void {
    const rig = this.rig;
    const L = rig.layers;
    this.applyColor();
    L?.follow(this.fur, this.definition.family);
    const sc = this.bodyScale.x;
    rig.squash.scale.set(sc, sc, sc);
  }

  /**
   * Body colour = spring colour tinted by the valence channel (OKLab, keeps
   * lightness), rim glow leaning toward the preset's glow colour. Uniform /
   * colour writes only — called while the colour tweens or the tint moves,
   * never rebuilt; the follow-body material list is collected once.
   */
  private applyColor(): void {
    const rig = this.rig;
    const v = this.valence, vp = valencePaletteOf(this.definition.family);
    tintForValence(this.bodyColor.update(0), v, this.shownRgb, vp);
    // a channel's body tint on top (e.g. a plugin's pale / dull look), by its weight
    const res = this.machine.resolver, ts = res.tintSlot, tw = res.tintWeight;
    if (ts >= 0) {
      const t = this.machine.channels.slots[ts]!.spec.tint!;
      leanColor(this.shownRgb, tintRgb(t), (t.amount ?? 0.25) * tw, 1 + ((t.saturation ?? 1) - 1) * tw, (t.lift ?? 0) * tw, this.shownRgb);
    }
    this.chTintSlot = ts;
    this.chTintWeight = tw;
    this.glowK = glowForValence(v, this.glowRgb, vp);
    this.tintApplied = v;
    const [r, g, b] = this.shownRgb;
    const col = TMP_COLOR.setRGB(r, g, b, THREE.SRGBColorSpace);
    const k = this.glowK, gl = this.glowRgb;
    const rimTo = TMP_RIM.setRGB(1 + (gl[0] - 1) * k, 1 + (gl[1] - 1) * k, 1 + (gl[2] - 1) * k, THREE.SRGBColorSpace);
    const L = rig.layers;
    if (L) L.setColor(col);
    else (rig.bodyMesh.material as THREE.MeshStandardMaterial).color?.copy(col);
    let mats = this.colorMats;
    if (!mats) {
      mats = this.colorMats = [];
      const seen = new Set<THREE.Material>();
      rig.procedural.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && !Array.isArray(m) && m.userData?.followBody && m.color && !seen.has(m)) {
          seen.add(m);
          mats!.push(m);
        }
      });
    }
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i]!;
      m.color.copy(col);
      const u = m.userData.fur as { uRim?: { value: THREE.Color } } | undefined;
      // a warm / cool halo at the silhouette (stronger toward the preset's glow)
      u?.uRim?.value.copy(col).lerp(rimTo, 0.5 + 0.25 * k);
    }
    this.colorRevision++;
  }

  private eyeLayoutFor(def: ResolvedAvatarDefinition) {
    const l = eyeLayout(def.anchor, def.eyes);
    return { ...l, y: this.rig.bodyCenterY + l.y };
  }

  /** Run pop tweens in place, dropping finished ones (no per-frame array churn). */
  private stepAnims(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.anims.length; i++) if (this.anims[i]!(dt)) this.anims[w++] = this.anims[i]!;
    this.anims.length = w;
  }

  private stepTweens(dt: number): void {
    if (this.pending) {
      this.pendingT -= dt;
      if (this.pendingT <= 0) {
        const p = this.pending;
        this.pending = null;
        this.applyStructural(p);
      }
    }
    if (!this.tweening) {
      this.stepAnims(dt);
      return;
    }
    this.bodyColor.update(dt);
    this.bodyScale.update(dt);
    this.fur.update(dt);
    const bm = this.bodyMorph;
    if (bm) {
      morphBody(this.rig.bodyGeometry, bm.from, bm.to, bm.tw.update(dt));
      if (bm.tw.done) this.bodyMorph = null;
    }
    if (this.patternMix) {
      this.rig.layers?.setPatternMix(this.patternMix.update(dt));
      if (this.patternMix.done) this.patternMix = null;
    }
    this.applyLive();
    if (this.bodyColor.settled && this.bodyScale.settled && this.fur.settled && !this.bodyMorph && !this.patternMix) this.tweening = false;
    this.stepAnims(dt);
  }

  /** Eye shape swaps close the eyes, swap the geometry at the bottom, and reopen. Returns the extra blink. */
  private stepEyeSwap(dt: number): number {
    if (this.swapBlink === 0) return 0;
    const close = 0.07, open = 0.1;
    if (this.swapBlink < 1) {
      this.swapBlink = Math.min(1, this.swapBlink + dt / close);
      if (this.swapBlink >= 1 && this.pendingShape !== null) {
        this.rig.eyes?.setShape(this.pendingShape);
        this.pendingShape = null;
      }
      return this.swapBlink;
    }
    this.swapBlink = Math.min(2, this.swapBlink + dt / open);
    const b = 2 - this.swapBlink;
    if (this.swapBlink >= 2) this.swapBlink = 0;
    return b;
  }

  /** Jelly: simulate from the body's own motion (eyes are part of the body and deform with it). */
  private stepJelly(dt: number): void {
    const rig = this.rig;
    rig.root.updateMatrixWorld(true);
    const sc = rig.squash.getWorldScale(this.v1).y;
    const base = rig.squash.getWorldPosition(this.v2);
    const center = rig.body.localToWorld(this.jellyCenter.set(0, this.rig.bodyCenterY, 0));
    const g = rig.bodyGeometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bodyH = g.boundingBox ? g.boundingBox.max.y : 1.5;
    this.jelly.update({ dt, time: this.time, center, base, height: bodyH * sc * rig.body.scale.y, yaw: rig.body.rotation.y, behaviorScaleY: rig.body.scale.y });
  }

  // ----- frame -----
  update(frame: AvatarFrame): void {
    const { dt } = frame;
    this.viewCamera = frame.camera;
    const face = this.stepBlink(dt);

    const wasTweening = this.tweening;
    this.stepTweens(dt);
    // the tint drifts on its own (no colour tween running): colour + rim uniforms only
    const valence = this.valence;
    const res = this.machine.resolver;
    const tintMoved =
      (valence !== this.tintApplied && !(Number.isNaN(this.tintApplied) && valence === 0)) || res.tintSlot !== this.chTintSlot || res.tintWeight !== this.chTintWeight;
    if (tintMoved) this.applyColor();
    // the machine writes the composed behavior pose (hold ∘ carry ∘ behavior) every frame; gaze layers on top
    this.machine.update({ deltaTime: this.stepTimeline(dt) });
    this.stepPreset(dt);
    this.applyPreset();
    this.stepGaze(frame);
    this.gltf?.update(dt);
    this.stepJelly(dt);
    this.applyTints(this.liveBody);
    const tb = this.stepEyeSwap(dt);
    // eyes follow the wanted preset directly (their poses tween) — one reused frame object
    const live = this.live;
    const ef = this.eyeFrame;
    ef.dt = dt;
    ef.preset = (live.eyes as { pose?: string } | undefined)?.pose ?? face.preset;
    ef.blink = Math.max(face.blink, tb);
    ef.eyeOverlay = face.eyeOverlay;
    ef.resample = wasTweening || this.tweening || tintMoved;
    ef.body = this.liveBody;
    ef.tint = this.eyeTint;
    ef.furLength = this.fur.eyeClearance(this.definition.family);
    this.rig.eyes?.update(ef);
    this.rig.anchors.source.def = live;
    const m = this.machine;
    // plugin composition atoms (built once, when a plugin adds them)
    if (this.compositionSeen !== m.compositionRevision) {
      this.compositionSeen = m.compositionRevision;
      for (const k of m.composition) if (!this.extended.has(k)) (this.extended.add(k), this.rig.extend(k));
    }
    // one reused frame object (no per-frame allocation)
    const f = this.rigFrame;
    f.dt = dt;
    f.time = this.time;
    f.blink = Math.max(face.blink, tb);
    f.eyeOverlay = face.eyeOverlay;
    f.mouthShape = face.mouth;
    f.atoms = m.atoms.states;
    f.reach = m.reach;
    f.preset = face.preset;
    f.definition = live;
    f.revision = this.liveRevision;
    f.glow = this.glowK;
    f.valence = this.valence;
    f.colorRevision = this.colorRevision;
    f.camera = frame.camera;
    const ups = this.rig.updaters;
    for (let i = 0; i < ups.length; i++) ups[i]!(f);
  }

  /** Anchor projected through the last frame's camera (normalized viewport, y down); false behind the camera. */
  override anchorOnScreen(anchor: AvatarAnchorName, out: { x: number; y: number }): boolean {
    const cam = this.viewCamera;
    if (!cam || !this.rig.anchors.resolve(anchor, this.screenFrame)) return false;
    const p = this.rig.procedural.localToWorld(this.screenPoint.copy(this.screenFrame.position)).project(cam);
    if (p.z > 1 || p.z < -1) return false;
    out.x = (p.x + 1) / 2;
    out.y = (1 - p.y) / 2;
    return true;
  }

  /** Gaze: target from lookAt / setGazeTarget / pointer (spatial) → whole-body turn / tilt / lean. */
  private stepGaze(frame: AvatarFrame): void {
    const rig = this.rig;
    const opts = this.gaze.options;
    let target: { x: number; y: number } | null = null;
    let moved = false;
    // gaze only reads `procedural`'s world transform (via localToWorld below);
    // stepJelly does the full-subtree update after the pose mutates
    rig.procedural.updateWorldMatrix(true, false);
    // gaze origin: between the eyes
    // (no eyes: the body front at its centre height)
    const fw = rig.eyes
      ? rig.procedural.localToWorld(this.tmp.set(0, rig.eyes.layoutY(), rig.eyes.eyes[0].frame.c.z))
      : rig.procedural.localToWorld(this.tmp.set(0, rig.bodyCenterY, 1));
    if (this.lookPoint) {
      target = this.dirTarget(this.v2.set(this.lookPoint.x, this.lookPoint.y, this.lookPoint.z).sub(fw));
      moved = true;
    } else if (this.gazeTarget) {
      target = this.gazeTarget;
      moved = true;
    } else if (frame.pointer && this.pointerFollow && !this.scripted && opts.followPointer) {
      // spatial pointer: the ray through the cursor meets a camera-facing plane between the avatar and the viewer
      const cam = frame.camera as THREE.PerspectiveCamera;
      const camPos = cam.getWorldPosition(this.v1);
      const mid = this.v2.copy(fw).lerp(camPos, 0.35);
      const viewDir = cam.getWorldDirection(this.v3);
      this.plane.setFromNormalAndCoplanarPoint(viewDir, mid);
      const p = this.v4.set(frame.pointer.x, frame.pointer.y, 0.5).unproject(cam);
      this.ray.set(camPos, p.sub(camPos).normalize());
      const hit = this.ray.intersectPlane(this.plane, this.v5);
      if (hit) target = this.dirTarget(hit.sub(fw));
      moved = frame.pointer.x !== this.lastPointer.x || frame.pointer.y !== this.lastPointer.y;
      this.lastPointer.copy(frame.pointer);
    }
    if (!target) {
      // preset gaze bias (e.g. thinking looks up and around)
      const gx = this.presetParam('gaze.x'), gy = this.presetParam('gaze.y');
      if (gx !== 0 || gy !== 0) {
        this.presetGaze.x = gx;
        this.presetGaze.y = gy;
        target = this.presetGaze;
        moved = true;
      }
    }
    const g = this.solveGaze(frame.dt, target, moved);
    // the whole body turns on top of the behavior pose (the eyes are fixed on it)
    rig.body.quaternion.premultiply(this.gq.setFromEuler(this.ge.set(g.body.pitch, g.body.yaw, g.body.roll, 'YXZ')));
  }

  /**
   * Preset overrides that are not read from the definition each frame: rest
   * pose offsets, body scale, fur springs and jelly. Everything else reaches
   * the atom drawers through the live definition. No allocations, no rebuilds.
   */
  private applyPreset(): void {
    const rig = this.rig;
    // the preset owns the body's offset (behaviors move the root): absolute, so it never accumulates
    rig.body.position.set(this.presetParam('pose.sway'), this.presetParam('pose.bob'), 0);
    const tilt = this.presetParam('pose.tilt'), lean = this.presetParam('pose.lean'), turn = this.presetParam('pose.turn');
    if (tilt !== 0 || lean !== 0 || turn !== 0) rig.body.quaternion.multiply(this.gq.setFromEuler(this.ge.set(lean, turn, tilt, 'YXZ')));
    const ms = this.presets.get('body.scale');
    if (ms !== undefined) {
      const base = this.definition.body.scale ?? 1;
      const sc = this.bodyScale.x * (base !== 0 ? ms / base : 1);
      rig.squash.scale.set(sc, sc, sc);
    }
    const slots = this.presets.slots;
    let fur = false, jelly = false;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      const f = PRESET_FUR[s.path];
      if (f) {
        this.fur[f].snap(s.value);
        fur = true;
      } else if (this.jelly.opts && PRESET_JELLY.includes(s.path)) {
        (this.jelly.opts as unknown as Record<string, number>)[s.path.slice(6)] = s.value;
        jelly = true;
      }
    }
    if (fur) rig.layers?.follow(this.fur, this.definition.family);
    if (this.presetFur && !fur) {
      // released: back to the definition's values
      this.fur.retarget(furTargets(this.definition));
      this.tweening = true;
    }
    if (this.presetJelly && !jelly) this.jelly.setOptions(this.definition.jelly ?? {});
    this.presetFur = fur;
    this.presetJelly = jelly;
  }

  protected override presetAccepts(path: string): boolean {
    // eye layout params are resampled on edits only; the eye pose is the preset's eye variant
    if (path.startsWith('eyes.')) return path === 'eyes.pose';
    return true;
  }

  protected override presetVariant(path: string, value: PresetValue | undefined): void {
    super.presetVariant(path, value);
    if (path === 'body.color' && this.bodyColor) {
      this.bodyColor.set((value as string | undefined) ?? this.definition.body.color);
      this.tweening = true;
    }
  }

  /** Direction (world) from the eyes → normalized gaze target in the avatar's root frame. */
  private dirTarget(d: THREE.Vector3): { x: number; y: number } {
    const inv = this.rig.root.getWorldQuaternion(this.gq).invert();
    d.applyQuaternion(inv);
    return gazeTargetFromDirection(d.x, d.y, d.z);
  }

  dispose(): void {
    this.disposed = true;
    this.gltf?.dispose();
    for (const l of this.pool.values()) l.forEach((a) => disposeObject(a.object));
    this.pool.clear();
    this.rig.dispose();
  }
}

/** Fur spring targets of a definition (preset release). */
/** sRGB of a channel tint colour (parsed once per spec). */
const tintColors = new WeakMap<ChannelTint, Rgb>();
function tintRgb(t: ChannelTint): Rgb {
  let c = tintColors.get(t);
  if (!c) {
    const k = { r: 0, g: 0, b: 0 };
    new THREE.Color(t.color).getRGB(k, THREE.SRGBColorSpace);
    tintColors.set(t, (c = [k.r, k.g, k.b]));
  }
  return c;
}

function furTargets(def: ResolvedAvatarDefinition): import('../../../core/define/diffAvatar.ts').AvatarDiffTween {
  const f = def.fur;
  if (!f) return {};
  const knit = f.knit !== false;
  return { furLength: f.length, furDensity: f.density, furRootShade: f.rootShade, furDroop: f.droop, furPatternShade: knit ? f.patternShade : 0, furBumpScale: knit ? f.bumpScale : 0 };
}

/** Drop `undefined` fields so explicit-undefined options keep their defaults. */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const targetBoxes = new WeakMap<BodyTarget, THREE.Box3>();
function boxOfTarget(t: BodyTarget): THREE.Box3 {
  let b = targetBoxes.get(t);
  if (!b) {
    b = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < t.position.length; i += 3) b.expandByPoint(v.set(t.position[i]!, t.position[i + 1]!, t.position[i + 2]!));
    targetBoxes.set(t, b);
  }
  return b;
}

/** Bounds of `o` (at its rest transform) in `space`'s local coordinates. */
function restBox(o: THREE.Object3D, space: THREE.Object3D): THREE.Box3 {
  space.updateMatrixWorld(true);
  const inv = space.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  o.updateMatrixWorld(true);
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
  });
  return box;
}

function disposeObject(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((y) => y.dispose());
    }
  });
}

const TMP_COLOR = new THREE.Color();
const TMP_RIM = new THREE.Color();
const TMP_RGB = { r: 0, g: 0, b: 0 };
const WHITE = new THREE.Color(0xffffff);

