import * as THREE from 'three';
import type { BodyShapeName, ShapeDeformer } from '../../../../core/types/AvatarDefinition.ts';
import { resolveShape } from '../../../../core/scenegraph/bodyShapes.ts';
import { registerAvatarOption } from '../../../../core/registry/options.ts';
import { resampleRadially } from './bodyGrid.ts';
import { registerBodySurface } from '../../../../core/scenegraph/bodyGrid.ts';
import type { BodyGridSurfaceBuilder } from '../../../../core/scenegraph/bodyGrid.ts';
export { createBodyTarget } from '../../../../core/scenegraph/bodyGrid.ts';
export type { BodyGridSurfaceBuilder } from '../../../../core/scenegraph/bodyGrid.ts';
import type { AvatarBodyOptions } from '../../../../core/types/AvatarDefinition.ts';

/** Unit sphere deformed by a shape function (built-in name or custom deformer). */
export function createShapedSphere(
  shape: BodyShapeName | ShapeDeformer,
  radius = 1,
  segments: [number, number] = [96, 64],
): THREE.BufferGeometry {
  const fn = resolveShape(shape);
  const geo = new THREE.SphereGeometry(radius, segments[0], segments[1]);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v, Math.atan2(v.z, v.x));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Tube along a Catmull-Rom curve that tapers toward the tip (tufts, antennae, tails). */
export function createTaperedTubeGeometry(points: [number, number, number][], radius = 0.13, taper = 0.6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((a) => new THREE.Vector3(...a)));
  const tubular = 40;
  const radial = 16;
  const tube = new THREE.TubeGeometry(curve, tubular, radius, radial);
  const tp = tube.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const u = Math.floor(i / (radial + 1)) / tubular;
    const k = 1 - taper * u;
    const pt = curve.getPoint(u);
    tp.setXYZ(i, pt.x + (tp.getX(i) - pt.x) * k, pt.y + (tp.getY(i) - pt.y) * k, pt.z + (tp.getZ(i) - pt.z) * k);
  }
  tube.computeVertexNormals();
  return tube;
}

// ---------- body geometry registry ----------

/**
 * Builder for bodies that aren't deformed spheres (tori, arches, tubes...).
 * Convention: unit-sphere-like space, centred near the origin, bottom at y ≈ -1,
 * smooth normals and UVs (needed by shell fur and surface patterns).
 */
export type BodyGeometryBuilder = (params: Record<string, unknown>, body: AvatarBodyOptions) => THREE.BufferGeometry;

const bodyGeometries = new Map<string, BodyGeometryBuilder>();

/**
 * Register a non-sphere body. Pass `surface` so the body can morph to/from
 * any other body on the shared grid; without it the geometry is resampled
 * radially (exact only for star-shaped bodies).
 */
export function registerBodyGeometry(name: string, builder: BodyGeometryBuilder, surface?: BodyGridSurfaceBuilder): void {
  bodyGeometries.set(name, builder);
  // grid form for morphing: explicit surface, else radial resample of the geometry
  registerBodySurface(name, surface ?? ((params, body) => ({ surface: resampleRadially(builder(params, body)) })));
  registerAvatarOption('bodyGeometry', name);
}

/** Body geometry: a registered builder when `shape` names one, else a deformed sphere. */
export function createBodyGeometry(body: AvatarBodyOptions): THREE.BufferGeometry {
  if (typeof body.shape === 'string') {
    const b = bodyGeometries.get(body.shape);
    if (b) return b(body.params ?? {}, body);
  }
  return createShapedSphere(body.shape, 1, body.segments);
}
