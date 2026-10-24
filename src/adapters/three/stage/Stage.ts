import { hypot2 } from '../../../core/math/hypot.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EngineTicker } from '../../../core/engine/EngineTicker.ts';
import type { UpdateContext } from '../../../core/types/Lifecycle.ts';
import type { AvatarDefinition } from '../../../core/types/AvatarDefinition.ts';
import type { ThreeAdapter } from '../index.ts';
import { ThreeAvatarController } from '../rig/applyState.ts';
import type { AvatarDescriptor } from '../../../core/types/AvatarDescriptor.ts';
import type { RenderContext } from '../../../core/types/RenderContext.ts';
import type { BodyAvatarRenderer } from '../../../core/renderers/IRenderer.ts';
import { registerRendererFactory } from '../../../core/renderers/IRenderer.ts';
import { getLightingPreset, studioLighting } from './lighting.ts';
import type { LightingPreset } from './lighting.ts';
import { Spring } from '../../../core/math/Spring.ts';
import { premultipliedToImageRows, snapshotSize } from './snapshot.ts';
import type { AvatarSnapshotOptions } from './snapshot.ts';
export * from './snapshot.ts';

// settles in ~0.6 s, matching the body morph; critically damped (no overshoot)
const CAM_SPRING = { stiffness: 90, damping: 1 };
const TMP_SPHERE = new THREE.Sphere();
const TMP_V = new THREE.Vector3();
const TMP_DIR = new THREE.Vector3();
import type { ThreeAvatarControllerOptions } from '../rig/applyState.ts';

const CLICK_NDC = new THREE.Vector2();

/** Default framing padding (bounding-sphere fit × padding). Apparent size scales with 1 / padding. */
export const DEFAULT_FRAME_PADDING = 1.3;

/** Padding for an apparent-size `zoom` (1 = default framing, 2.3 = 2.3× larger). */
export const framePaddingForZoom = (zoom = 1): number => DEFAULT_FRAME_PADDING / Math.max(0.1, zoom);

export interface AvatarStageOptions {
  canvas?: HTMLCanvasElement;
  /** Background colour; `null` = transparent (default 0x111111). */
  background?: THREE.ColorRepresentation | null;
  exposure?: number;
  fov?: number;
  cameraPosition?: [number, number, number];
  target?: [number, number, number];
  /** Constrained orbit controls like the prototype (default true). */
  controls?: boolean;
  /** Lighting: `true`/'studio' (default), another registered preset name, a custom `LightingPreset`, or `false` to bring your own. */
  lighting?: boolean | string | LightingPreset;
  /** Self-drive frames from the ticker (default true). `false` when a host (e.g. `AvatarInstance`) calls `render()`. */
  autoTick?: boolean;
  /** Track the pointer over the whole window (default) or only the canvas. */
  pointerScope?: 'window' | 'canvas';
  pixelRatio?: number;
  /** Use a private ticker instead of the shared core EngineTicker. */
  ticker?: EngineTicker;
  onAvatarClick?: (id: string, controller: ThreeAvatarController) => void;
}

/**
 * AvatarStage — a ThreeAdapter-compatible host that owns renderer, camera,
 * studio lighting, the frame loop (core `EngineTicker`), pointer tracking,
 * picking and a set of `ThreeAvatarController`s.
 */
export class AvatarStage implements ThreeAdapter, BodyAvatarRenderer {
  readonly kind = 'three' as const;
  readonly type = 'webgl' as const;
  readonly rendererKind = 'body-avatar' as const;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls | null;
  readonly avatars = new Map<string, ThreeAvatarController>();
  onAvatarClick: AvatarStageOptions['onAvatarClick'];

  private readonly models = new Map<string, string>();
  private readonly pointer = new THREE.Vector2();
  private hasPointer = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ticker: EngineTicker;
  private readonly tick = (ctx: UpdateContext) => this.frame(ctx);
  private readonly cleanups: (() => void)[] = [];
  private lightingDispose: (() => void) | null = null;
  private readonly autoTick: boolean;
  private framed: { object: THREE.Object3D; padding: number } | null = null;
  /** Continuous framing of one avatar's rest bounds (critically damped, never jumps). */
  private follow: { c: ThreeAvatarController; padding: number; fit: number; /** Rest centre xyz + fit distance of the last re-frame. */ bounds: Float64Array } | null = null;
  private readonly camCenter = { x: new Spring(0, CAM_SPRING), y: new Spring(0, CAM_SPRING), z: new Spring(0, CAM_SPRING) };
  private readonly camDist = new Spring(10, CAM_SPRING);
  private camMoving = false;
  /** False while the canvas is off-screen / in a hidden tab (display:none) / the page is hidden: no sim, no render. */
  private visible = true;
  private visObserver: IntersectionObserver | null = null;
  /** Async (KHR_parallel_shader_compile) program warm-ups in flight: rendering waits instead of blocking on a sync link. */
  private compiling = 0;
  constructor(options: AvatarStageOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true, alpha: options.background === null });
    // default: device pixel ratio capped at 2 (3x phones would triple the fur shell fill cost for no visible gain)
    this.renderer.setPixelRatio(options.pixelRatio ?? Math.min(globalThis.devicePixelRatio ?? 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = options.exposure ?? 0.85;
    if (options.background !== null) this.scene.background = new THREE.Color(options.background ?? 0x111111);

    this.camera = new THREE.PerspectiveCamera(options.fov ?? 30, 1, 0.1, 100);
    this.camera.position.set(...(options.cameraPosition ?? [0, 1.2, 11.5]));
    const target = new THREE.Vector3(...(options.target ?? [0, 0.9, 0]));
    this.camera.lookAt(target);

    if (options.controls !== false) {
      const c = new OrbitControls(this.camera, this.renderer.domElement);
      c.target.copy(target);
      c.enablePan = false;
      c.enableDamping = true;
      c.minDistance = 7;
      c.maxDistance = 14;
      c.minPolarAngle = Math.PI * 0.38;
      c.maxPolarAngle = Math.PI * 0.52;
      c.minAzimuthAngle = -0.5;
      c.maxAzimuthAngle = 0.5;
      // User guard: an orbit/zoom gesture always wins over an in-flight re-frame.
      c.addEventListener('start', () => this.yieldCamera());
      this.controls = c;
    } else {
      this.controls = null;
    }

    if (options.lighting !== false) {
      const l = options.lighting;
      const preset = typeof l === 'function' ? l : typeof l === 'string' ? getLightingPreset(l) : studioLighting;
      if (!preset) console.warn(`[stage] unknown lighting preset '${String(l)}'`);
      else this.lightingDispose = preset(this.scene, this.renderer);
    }
    this.onAvatarClick = options.onAvatarClick;
    this.bindInput(options.pointerScope ?? 'window');
    this.bindResize();
    this.ticker = options.ticker ?? EngineTicker.getShared();
    this.autoTick = options.autoTick !== false;
    if (this.autoTick) this.ticker.add(this.tick);
    this.bindVisibility();
  }

  /** Compile a new avatar's programs off the main thread before its first draw (no first-frame hitch). */
  private warmUp(object: THREE.Object3D): void {
    const r = this.renderer as THREE.WebGLRenderer & { compileAsync?: THREE.WebGLRenderer['compileAsync'] };
    if (!r.compileAsync) return;
    this.compiling++;
    const done = () => {
      this.compiling = Math.max(0, this.compiling - 1);
    };
    r.compileAsync(object, this.camera, this.scene).then(done, done);
  }

  /** Pause everything (avatar sims, springs, idle timers, rendering) while the canvas can't be seen. */
  private bindVisibility(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    const el = this.renderer.domElement;
    let onScreen = true;
    const sync = () => {
      this.visible = onScreen && !(typeof document !== 'undefined' && document.hidden);
    };
    this.visObserver = new IntersectionObserver((entries) => {
      for (const e of entries) onScreen = e.isIntersecting;
      sync();
    });
    this.visObserver.observe(el);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', sync);
      this.cleanups.push(() => document.removeEventListener('visibilitychange', sync));
    }
  }

  /** Add the default studio lighting (see `stage/lighting.ts`). */
  addStudioLighting(): void {
    this.lightingDispose?.();
    this.lightingDispose = studioLighting(this.scene, this.renderer);
  }

  // ----- IRenderer (body-avatar kind): lets core `AvatarInstance` drive the stage -----
  initialize(container: HTMLElement | null, descriptor: AvatarDescriptor): void {
    const el = this.renderer.domElement;
    if (container && el.parentElement !== container) container.appendChild(el);
    if (descriptor.bodyAvatar) this.add(descriptor.bodyAvatar);
  }

  render(_scene: unknown, context: RenderContext): void {
    this.frame({ deltaTime: context.deltaTime, time: context.time });
  }

  // ----- avatars -----
  add(definition: AvatarDefinition, options?: ThreeAvatarControllerOptions): ThreeAvatarController {
    this.remove(definition.id);
    const c = new ThreeAvatarController(definition, options);
    c.onRekey = (oldId, newId) => {
      if (this.avatars.get(oldId) !== c) return;
      this.avatars.delete(oldId);
      this.avatars.set(newId, c);
      const url = this.models.get(oldId);
      if (url) {
        this.models.delete(oldId);
        this.models.set(newId, url);
      }
    };
    this.avatars.set(c.id, c);
    this.scene.add(c.object);
    this.warmUp(c.object);
    if (definition.model) this.registerModel(definition.id, definition.model.url);
    return c;
  }

  get(id: string): ThreeAvatarController | undefined {
    return this.avatars.get(id);
  }

  remove(id: string): void {
    const c = this.avatars.get(id);
    if (!c) return;
    if (this.framed?.object === c.object) this.framed = null;
    if (this.follow?.c === c) this.follow = null;
    c.dispose();
    this.avatars.delete(id);
    this.models.delete(id);
  }

  /** Broadcast an behavior to every avatar. */
  doAll(behavior: string, options?: Parameters<ThreeAvatarController['play']>[1]): void {
    for (const c of this.avatars.values()) c.play(behavior, options);
  }

  // ----- ThreeAdapter -----
  registerModel(id: string, url: string): void {
    this.models.set(id, url);
  }
  listModels(): string[] {
    return Array.from(this.models.keys());
  }

  // ----- loop -----
  /** Advance one frame manually (used by the ticker; also handy for tests/screenshots). */
  frame(ctx: Pick<UpdateContext, 'deltaTime' | 'time'>): void {
    if (!this.visible) return;
    this.controls?.update();
    this.scene.updateMatrixWorld();
    const pointer = this.hasPointer ? this.pointer : null;
    for (const c of this.avatars.values()) {
      c.update({ dt: ctx.deltaTime, time: ctx.time, camera: this.camera, pointer });
    }
    this.updateFollow(ctx.deltaTime);
    if (this.compiling > 0) return; // programs still compiling in parallel: keep the last frame
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Capture exactly the frame on screen (same camera, pose, animation state)
   * as an image — always on a TRANSPARENT background, at
   * CSS size × devicePixelRatio × `scale` (default 2; the live pixel-ratio cap
   * does not apply), clamped to GPU / memory limits, aspect ratio kept.
   *
   * Time never advances: no ticker frame, no controls / spring / physics
   * update — only `renderer.render(scene, camera)` of the current state, into
   * an offscreen MSAA RGBA target, read back in the same task (no
   * `preserveDrawingBuffer`). The live canvas is never resized, so the view
   * doesn't glitch. Objects with `userData.snapshotHidden` (backdrops,
   * floors) are hidden for the capture.
   */
  async snapshot(opts: AvatarSnapshotOptions = {}): Promise<Blob> {
    const { width, height, pixels } = this.renderSnapshotPixels(opts);
    const rgba = premultipliedToImageRows(pixels, width, height);
    return encodeImage(rgba, width, height, opts.type ?? 'image/png', opts.quality);
  }

  /**
   * Synchronous part of `snapshot()`: render the current state offscreen and
   * read it back (bottom-up rows, premultiplied alpha, sRGB, tone-mapped).
   */
  renderSnapshotPixels(opts: Pick<AvatarSnapshotOptions, 'scale' | 'maxSize' | 'maxPixels'> = {}): { width: number; height: number; pixels: Uint8Array } {
    const r = this.renderer;
    const gl = r.getContext();
    const css = r.getSize(new THREE.Vector2());
    const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as ArrayLike<number> | null;
    const gpuMaxSize = Math.min(
      r.capabilities.maxTextureSize,
      (gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number) || Infinity,
      vp?.[0] ?? Infinity,
      vp?.[1] ?? Infinity,
    );
    const { width, height } = snapshotSize({
      cssWidth: css.x,
      cssHeight: css.y,
      devicePixelRatio: globalThis.devicePixelRatio ?? r.getPixelRatio(),
      scale: opts.scale,
      maxSize: opts.maxSize,
      maxPixels: opts.maxPixels,
      gpuMaxSize,
    });

    // RGBA8 target that renders EXACTLY like the canvas: three only applies tone
    // mapping + the sRGB output transfer for the default framebuffer or an XR
    // target, so flag it as one (texture.colorSpace = output space). Same
    // program cache keys as the live view → no recompiles, identical shading.
    // internalFormat RGBA8 keeps the MSAA renderbuffer and the resolve texture
    // linear-storage (the shader already wrote sRGB-encoded values).
    const rt = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: r.outputColorSpace as THREE.ColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      // MSAA like the antialiased canvas (also drives the fur shells' alphaToCoverage)
      samples: Math.min(4, r.capabilities.maxSamples ?? 4),
      generateMipmaps: false,
    });
    rt.texture.internalFormat = 'RGBA8';
    (rt as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;

    // transparent background for the capture only
    const prevTarget = r.getRenderTarget();
    const prevBackground = this.scene.background;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevClearAlpha = r.getClearAlpha();
    const prevAutoClear = r.autoClear;
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (o.userData?.snapshotHidden && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });
    const pixels = new Uint8Array(width * height * 4);
    try {
      this.scene.background = null;
      r.setClearColor(0x000000, 0);
      r.autoClear = true;
      r.setRenderTarget(rt);
      r.clear(true, true, true);
      r.render(this.scene, this.camera);
      r.readRenderTargetPixels(rt, 0, 0, width, height, pixels);
    } finally {
      for (const o of hidden) o.visible = true;
      this.scene.background = prevBackground;
      r.setClearColor(prevClear, prevClearAlpha);
      r.autoClear = prevAutoClear;
      r.setRenderTarget(prevTarget);
      rt.dispose();
    }
    // redraw the live view from the same (unadvanced) state so the canvas stays current
    if (this.visible && this.compiling === 0 && prevTarget === null) r.render(this.scene, this.camera);
    return { width, height, pixels };
  }

  /** Pick the closest avatar under an NDC point. */
  pick(ndc: THREE.Vector2): ThreeAvatarController | undefined {
    return this.pickHit(ndc)?.c;
  }

  /** Pick the closest avatar and the world hit point under an NDC point. */
  pickHit(ndc: THREE.Vector2): { c: ThreeAvatarController; point: THREE.Vector3 } | undefined {
    this.raycaster.setFromCamera(ndc, this.camera);
    let best: { c: ThreeAvatarController; d: number; point: THREE.Vector3 } | undefined;
    for (const c of this.avatars.values()) {
      const hit = this.raycaster.intersectObjects(c.rig.pickables, false)[0];
      if (hit && (!best || hit.distance < best.d)) best = { c, d: hit.distance, point: hit.point.clone() };
    }
    return best && { c: best.c, point: best.point };
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.framed) this.frameObject(this.framed.object, this.framed.padding);
    if (this.follow) this.updateFollow(0, 'resize');
  }

  /**
   * Auto-fit the camera (and orbit target/limits) to an object's bounds, from
   * a slightly raised front view. Re-applied on resize until `unframe()`.
   */
  frameObject(object: THREE.Object3D, padding = DEFAULT_FRAME_PADDING): void {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    this.framed = { object, padding };
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const fitH = sphere.radius / Math.sin(halfFov);
    const dist = (fitH / Math.min(1, this.camera.aspect)) * padding;
    const dir = new THREE.Vector3(0, 0.12, 1).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.01, dist / 100);
    this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(sphere.center);
    if (this.controls) {
      this.controls.target.copy(sphere.center);
      this.controls.minDistance = dist * 0.6;
      this.controls.maxDistance = dist * 1.8;
      this.controls.update();
    }
  }

  unframe(): void {
    this.framed = null;
    this.follow = null;
  }

  /**
   * Keep a avatar framed as it changes: the camera eases (critically damped,
   * in step with the morph) toward the avatar's REST bounds at its target
   * definition, so character switches never snap. The user's orbit angle is
   * kept; the camera is only touched while a re-frame is in progress.
   */
  frameAvatar(c: ThreeAvatarController, padding = DEFAULT_FRAME_PADDING): void {
    this.framed = null;
    const first = this.follow?.c !== c;
    if (first) this.follow = { c, padding, fit: 0, bounds: new Float64Array(4) };
    else this.follow!.padding = padding;
    this.follow!.bounds.fill(NaN);
    this.updateFollow(0, first ? 'first' : 'tick');
  }

  /** Hand the camera to the user: stop easing and rebase the springs on where the camera is now. */
  private yieldCamera(): void {
    if (!this.follow || !this.controls) return;
    const t = this.controls.target;
    this.camCenter.x.snap(t.x);
    this.camCenter.y.snap(t.y);
    this.camCenter.z.snap(t.z);
    this.camDist.snap(this.camera.position.distanceTo(t));
    this.camMoving = false;
  }

  private fitDistance(radius: number, padding: number): number {
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    return (radius / Math.sin(halfFov) / Math.min(1, this.camera.aspect)) * padding;
  }

  /**
   * Re-frame ONLY when the rest bounds or viewport change (never per behavior:
   * restSphere ignores the animated pose). The user's zoom ratio (distance /
   * fit) and orbit direction carry over to the new fit; only the first framing
   * uses the default front view.
   */
  private updateFollow(dt: number, mode: 'tick' | 'first' | 'resize' = 'tick'): void {
    const f = this.follow;
    if (!f) return;
    const sphere = f.c.restSphere(TMP_SPHERE);
    const fit = this.fitDistance(sphere.radius, f.padding);
    const first = mode === 'first';
    const k = f.bounds;
    const { x, y, z } = sphere.center;
    const moved = Math.abs(k[0]! - x) >= 1e-4 || Math.abs(k[1]! - y) >= 1e-4 || Math.abs(k[2]! - z) >= 1e-4 || Math.abs(k[3]! - fit) >= 1e-4;
    if (moved || mode !== 'tick') {
      const pivot = this.controls ? this.controls.target : TMP_V.set(this.camCenter.x.x, this.camCenter.y.x, this.camCenter.z.x);
      const ratio = first || f.fit <= 0 ? 1 : THREE.MathUtils.clamp(this.camera.position.distanceTo(pivot) / f.fit, 0.6, 1.8);
      k[0] = x, k[1] = y, k[2] = z, k[3] = fit;
      f.fit = fit;
      const d = fit * ratio;
      const cc = this.camCenter;
      if (mode !== 'tick') {
        cc.x.snap(sphere.center.x);
        cc.y.snap(sphere.center.y);
        cc.z.snap(sphere.center.z);
        this.camDist.snap(d);
      } else {
        cc.x.set(sphere.center.x);
        cc.y.set(sphere.center.y);
        cc.z.set(sphere.center.z);
        this.camDist.set(d);
      }
      if (this.controls) {
        this.controls.minDistance = fit * 0.6;
        this.controls.maxDistance = fit * 1.8;
      }
      this.camMoving = true;
    }
    if (!this.camMoving) return;
    const cc = this.camCenter;
    const center = TMP_V.set(cc.x.update(dt), cc.y.update(dt), cc.z.update(dt));
    const d = this.camDist.update(dt);
    // keep the current orbit direction (default: slightly raised front view on first framing)
    const dir = TMP_DIR.copy(this.camera.position).sub(this.controls ? this.controls.target : center);
    if (first || dir.lengthSq() < 1e-8) dir.set(0, 0.12, 1);
    dir.normalize();
    this.camera.position.copy(center).addScaledVector(dir, d);
    this.camera.near = Math.max(0.01, d / 100);
    this.camera.far = d * 10;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(center);
    if (this.controls) this.controls.target.copy(center);
    if (cc.x.settled && cc.y.settled && cc.z.settled && this.camDist.settled) this.camMoving = false;
  }

  private toNdc(e: PointerEvent | MouseEvent, out: THREE.Vector2, scope: 'window' | 'canvas'): void {
    if (scope === 'window') {
      out.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    } else {
      const r = this.renderer.domElement.getBoundingClientRect();
      out.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    }
  }

  private bindInput(scope: 'window' | 'canvas'): void {
    const el = this.renderer.domElement;
    const move = (e: PointerEvent) => {
      this.toNdc(e, this.pointer, scope);
      this.hasPointer = true;
    };
    const target: EventTarget = scope === 'window' ? window : el;
    target.addEventListener('pointermove', move as EventListener);
    // pointer gone (left the window / canvas, or the tab lost focus): gaze returns to idle wander
    const leave = (e: Event) => {
      if (scope === 'window' && (e as MouseEvent).relatedTarget) return;
      this.hasPointer = false;
    };
    const leaveTarget: EventTarget = scope === 'window' ? document : el;
    leaveTarget.addEventListener(scope === 'window' ? 'mouseout' : 'pointerleave', leave);
    window.addEventListener('blur', leave);
    let downAt = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const click = (e: MouseEvent) => {
      if (hypot2(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return; // was an orbit drag
      const ndc = CLICK_NDC;
      this.toNdc(e, ndc, 'canvas');
      const hit = this.pickHit(ndc);
      if (hit) {
        hit.c.poke(hit.point);
        this.onAvatarClick?.(hit.c.id, hit.c);
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('click', click);
    this.cleanups.push(() => {
      target.removeEventListener('pointermove', move as EventListener);
      leaveTarget.removeEventListener(scope === 'window' ? 'mouseout' : 'pointerleave', leave);
      window.removeEventListener('blur', leave);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('click', click);
    });
  }

  private bindResize(): void {
    const el = this.renderer.domElement;
    const apply = () => this.resize(el.clientWidth, el.clientHeight);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(apply);
      ro.observe(el);
      this.cleanups.push(() => ro.disconnect());
    }
    apply();
  }

  dispose(): void {
    if (this.autoTick) this.ticker.remove(this.tick);
    this.visObserver?.disconnect();
    for (const id of Array.from(this.avatars.keys())) this.remove(id);
    this.cleanups.forEach((f) => f());
    this.controls?.dispose();
    this.lightingDispose?.();
    this.lightingDispose = null;
    this.renderer.dispose();
    this.models.clear();
  }
}

/** Encode straight-alpha, top-down RGBA as an image Blob (2D canvas; PNG keeps alpha). */
async function encodeImage(rgba: Uint8ClampedArray, width: number, height: number, type: string, quality?: number): Promise<Blob> {
  const data = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(width, height);
    const ctx = oc.getContext('2d');
    if (ctx) {
      ctx.putImageData(data, 0, 0);
      return oc.convertToBlob({ type, quality });
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[stage] snapshot: 2D canvas unavailable');
  ctx.putImageData(data, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('[stage] snapshot: encoding failed'))), type, quality),
  );
}

export function createAvatarStage(options?: AvatarStageOptions): AvatarStage {
  return new AvatarStage(options);
}

/** Body-avatar stage as a core renderer: `AvatarEngine` instances with `renderer: 'webgl'` get a stage driven by `AvatarInstance.render()`. */
registerRendererFactory('webgl', () => new AvatarStage({ autoTick: false }));

/** Neutral name. */
export { AvatarStage as ThreeStage, createAvatarStage as createThreeStage };
export type ThreeStageOptions = AvatarStageOptions;
