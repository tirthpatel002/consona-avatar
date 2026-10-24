import * as THREE from 'three';
import type { ResolvedAvatarDefinition } from '../../../../core/define/resolveAvatar.ts';
import { getMouthShape, installDefaultMouthShapes, isAutoMouthColor, mouthColors, presetMouthShape, sampleMouth } from '../../../../core/face/mouth.ts';
import { PROP_SPRING, Spring } from '../../../../core/math/Spring.ts';
import { registerAtomDrawer } from '../atomDrawers.ts';
import { MOUTH_SAMPLES } from './mouthMask.ts';

/**
 * Relief mouth as a decal-in-shader: this part owns NO geometry. It only
 * animates the mouth's parameters on atoms springs (width, curve, openness,
 * position, shape morph — the jelly feel) and writes them as uniforms through
 * the surface part's `ctx.mouthClearing` (`furShells` / `shellFur`), whose
 * skin shader draws the carved mouth from an analytic SDF and whose shells
 * clear the fur over it (see `mouthMask.ts`). It rides body morphs / jelly for
 * free: nothing is seated, raycast or rebuilt, and no program ever recompiles.
 * Per frame (only while something moves): 2×17 floats + a few uniforms.
 *
 * Placement: centred on x = 0 at `bodyCenterY + anchor.y + mouth.height`
 * (body space), front half of the body. Presets pick the shape (their
 * `mouth.presetShape` / `mouth.idleShape` variants, `presetMouthShape`); a manual
 * mouth choice wins until the next preset change.
 */
registerAtomDrawer({
  kind: 'reliefMouth',
  build(ctx) {
    installDefaultMouthShapes();
    const N = MOUTH_SAMPLES;
    const sp = { width: new Spring(0, PROP_SPRING), curve: new Spring(1, PROP_SPRING), open: new Spring(0, PROP_SPRING), height: new Spring(0, PROP_SPRING), wmul: new Spring(1, PROP_SPRING), morph: new Spring(1, PROP_SPRING) };
    const springs = Object.values(sp);
    const fromLo = new Float32Array(N), fromUp = new Float32Array(N);
    const toLo = new Float32Array(N), toUp = new Float32Array(N);
    const lo = new Float32Array(N), up = new Float32Array(N);
    const outLo = new Float32Array(N), outUp = new Float32Array(N);
    const lineCol = new THREE.Color(), innerCol = new THREE.Color();
    const c = new THREE.Vector3();
    let shape = '';
    let first = true;
    let settled = false;
    let manual = false;
    let seenShape: string | null = null, seenPreset: string | null = null;
    let lastColHex = -1, lastColSpec: unknown = null, lastCz = NaN;
    let lastW = NaN, lastH = NaN, lastCurve = NaN, lastOpen = NaN, lastAnchor = NaN;
    const fallbackCol = new THREE.Color(ctx.def.body.color as THREE.ColorRepresentation);
    const bodyCol = () => (ctx.bodyMesh?.material as THREE.MeshStandardMaterial | undefined)?.color ?? fallbackCol;

    const update = (def: ResolvedAvatarDefinition, preset: string | undefined, dt: number, behavior?: string | null) => {
      const m = def.mouth;
      const hook = ctx.mouthClearing;
      if (!m || !hook) {
        hook?.disable();
        return;
      }
      // an explicit (manual) mouth choice wins until the next preset change; presets pick otherwise
      if (seenShape !== null && m.shape !== seenShape) manual = true;
      if (seenPreset !== null && (preset ?? '') !== seenPreset) manual = false;
      seenShape = m.shape;
      seenPreset = preset ?? '';
      // an behavior's mouth (e.g. wink → 'wobbly') shows on top for its duration, then morphs back
      const want = behavior ? behavior : manual ? m.shape : presetMouthShape(def);
      const ws = getMouthShape(want);
      if (want !== shape) {
        // morph from what is shown now
        fromLo.set(first ? toLo : lo);
        fromUp.set(first ? toUp : up);
        shape = want;
        sp.morph.snap(first ? 1 : 0).set(1);
        sp.wmul.set(ws.width ?? 1);
        settled = false;
      }
      sp.width.set(m.width);
      sp.curve.set(m.curve);
      sp.open.set(ws.open ? m.open : 0);
      // the anchor rides the same spring (character switches glide)
      sp.height.set(def.anchor.y + m.height);
      if (first) {
        for (const s of springs) s.snap(s.target);
        sampleMouth(shape, m.curve, ws.open ? m.open : 0, N, toLo, toUp);
        fromLo.set(toLo);
        fromUp.set(toUp);
        first = false;
      }
      let moving = false;
      for (const s of springs) {
        s.update(dt);
        if (Math.abs(s.x - s.target) > 1e-4 || Math.abs(s.v) > 1e-4) moving = true;
        else if (s.x !== s.target) s.snap(s.target);
      }
      const cz = ctx.geometry?.boundingSphere?.center.z ?? 0;
      // 'auto' (or unset) follows the live body colour every frame it changes
      const colHex = isAutoMouthColor(m.color) ? bodyCol().getHex() : -2;
      const colChanged = colHex !== lastColHex || m.color !== lastColSpec;
      const changed = colChanged || cz !== lastCz || m.width !== lastW || m.height !== lastH || m.curve !== lastCurve || m.open !== lastOpen || def.anchor.y !== lastAnchor;
      if (!moving && settled && !changed) return;
      lastColHex = colHex;
      lastColSpec = m.color;
      lastCz = cz;
      lastW = m.width; lastH = m.height; lastCurve = m.curve; lastOpen = m.open; lastAnchor = def.anchor.y;
      settled = !moving;

      sampleMouth(shape, sp.curve.x, Math.max(0, sp.open.x), N, toLo, toUp);
      const k = sp.morph.x;
      const W = Math.max(0.01, sp.width.x * sp.wmul.x);
      for (let i = 0; i < N; i++) {
        lo[i] = fromLo[i]! + (toLo[i]! - fromLo[i]!) * k;
        up[i] = fromUp[i]! + (toUp[i]! - fromUp[i]!) * k;
        if (up[i]! < lo[i]!) up[i] = lo[i]!;
        outLo[i] = lo[i]! * W;
        outUp[i] = up[i]! * W;
      }
      if (colChanged) {
        // 'auto' follows the live (tweened) body colour; an explicit colour overrides
        const mc = mouthColors(m.color, `#${bodyCol().getHexString(THREE.SRGBColorSpace)}`);
        lineCol.setRGB(mc.line[0], mc.line[1], mc.line[2], THREE.SRGBColorSpace);
        innerCol.setRGB(mc.inner[0], mc.inner[1], mc.inner[2], THREE.SRGBColorSpace);
      }
      const lt = Math.max(0.008, W * 0.065); // half line thickness
      c.set(0, ctx.profile.bodyCenterY + sp.height.x, cz);
      hook.update(c, W / 2, lt * 0.6, lt, outLo, outUp, lineCol, innerCol);
    };
    update(ctx.def, undefined, 0);
    ctx.updaters.push((f) => update(f.definition, f.preset, f.dt, f.mouthShape));
  },
});
