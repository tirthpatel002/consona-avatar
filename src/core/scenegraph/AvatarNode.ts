import { type Transform3D, createDefaultTransform3D } from '../types/Transform3D.ts';
import type { UpdateContext } from '../types/Lifecycle.ts';
import { ChannelBuffer } from '../channel/ChannelBuffer.ts';
import type { ChannelSchemaMap } from '../channel/ChannelSchema.ts';
import type { IProjectionManifold, ProjectOptions, ProjectedPointResult } from './manifolds/IProjectionManifold.ts';
import type { NodeSpaceOptions } from './PlaneSpace.ts';
import { Matrix3D } from '../math/Matrix3D.ts';

const _parentRot = new Matrix3D();
const _localRot = new Matrix3D();
const _worldRot = new Matrix3D();

/**
 * AvatarNode: Base scene graph node (analogous to Three.js Object3D / PixiJS Container).
 * Supports hierarchical parent-child transforms, dirty tracking, typed channel buffers,
 * custom projection manifolds / planes, and zIndex ordering.
 */
export abstract class AvatarNode {
  readonly id: string;
  readonly type: string;

  public parent: AvatarNode | null = null;
  public children: AvatarNode[] = [];

  public baseTransform: Transform3D = createDefaultTransform3D();
  public localTransform: Transform3D = createDefaultTransform3D();
  public worldTransform: Transform3D = createDefaultTransform3D();

  /** Composed world rotation matrix (A1). Scratch-safe for read during project. */
  public readonly worldRotationMatrix = new Matrix3D();

  public projectionManifold?: IProjectionManifold;
  /**
   * When true (default), inherit ancestor manifold if this node has none.
   * Set false to opt out of parent curvature (screen/flat attachments).
   */
  public inheritPlane: boolean = true;
  public spaceOptions?: NodeSpaceOptions;
  public channels: ChannelBuffer;

  public zIndex: number = 0;
  public visible: boolean = true;
  public opacity: number = 1.0;

  /** Inherited visibility (self AND ancestors). */
  public worldVisible: boolean = true;
  /** Inherited opacity product along the ancestor chain. */
  public worldOpacity: number = 1.0;

  private dirty: boolean = true;

  constructor(id: string, type: string, schema: ChannelSchemaMap = {}, initialValues?: Record<string, any>) {
    this.id = id;
    this.type = type;
    this.channels = new ChannelBuffer(schema, initialValues);
  }

  get isDirty(): boolean {
    return this.dirty || this.channels.isDirty;
  }

  markDirty(): void {
    this.dirty = true;
    for (const child of this.children) {
      child.markDirty();
    }
  }

  clearDirty(): void {
    this.dirty = false;
    this.channels.clearDirty();
    for (const child of this.children) {
      child.clearDirty();
    }
  }

  add(child: AvatarNode): this {
    if (child.parent) {
      child.parent.remove(child);
    }
    child.parent = this;
    this.children.push(child);
    this.markDirty();
    return this;
  }

  remove(child: AvatarNode): this {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
      this.markDirty();
    }
    return this;
  }

  find(id: string): AvatarNode | null {
    if (this.id === id || (id === 'root' && (this.id === 'root' || this.id.endsWith(':root')))) return this;
    for (const child of this.children) {
      const found = child.find(id);
      if (found) return found;
    }
    return null;
  }

  traverse(callback: (node: AvatarNode) => void): void {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }

  /**
   * A1: Compose local TRS into world via rotation matrices.
   * Child offsets are rotated by the parent rotation before translation (fixes attachment drift).
   * A2: Propagate worldVisible / worldOpacity.
   */
  updateWorldTransform(): void {
    const l = this.localTransform;

    if (!this.parent) {
      this.worldTransform.position[0] = l.position[0];
      this.worldTransform.position[1] = l.position[1];
      this.worldTransform.position[2] = l.position[2];
      this.worldTransform.rotation[0] = l.rotation[0];
      this.worldTransform.rotation[1] = l.rotation[1];
      this.worldTransform.rotation[2] = l.rotation[2];
      this.worldTransform.scale[0] = l.scale[0];
      this.worldTransform.scale[1] = l.scale[1];
      this.worldTransform.scale[2] = l.scale[2];
      this.worldRotationMatrix.setFromEuler(l.rotation[0], l.rotation[1], l.rotation[2]);
      this.worldVisible = this.visible;
      this.worldOpacity = this.opacity;
    } else {
      const p = this.parent.worldTransform;
      _parentRot.copy(this.parent.worldRotationMatrix);
      _localRot.setFromEuler(l.rotation[0], l.rotation[1], l.rotation[2]);
      _worldRot.copy(_parentRot).multiply(_localRot);
      this.worldRotationMatrix.copy(_worldRot);

      // Parent scale → rotate by parent → translate (standard TRS nesting)
      const lx = l.position[0] * p.scale[0];
      const ly = l.position[1] * p.scale[1];
      const lz = l.position[2] * p.scale[2];
      const el = _parentRot.elements;
      const rx = el[0]! * lx + el[1]! * ly + el[2]! * lz;
      const ry = el[3]! * lx + el[4]! * ly + el[5]! * lz;
      const rz = el[6]! * lx + el[7]! * ly + el[8]! * lz;

      this.worldTransform.position[0] = p.position[0] + rx;
      this.worldTransform.position[1] = p.position[1] + ry;
      this.worldTransform.position[2] = p.position[2] + rz;

      // Expose composed Euler for manifolds / atoms (parent + local; matrix used for positions)
      this.worldTransform.rotation[0] = p.rotation[0] + l.rotation[0];
      this.worldTransform.rotation[1] = p.rotation[1] + l.rotation[1];
      this.worldTransform.rotation[2] = p.rotation[2] + l.rotation[2];

      this.worldTransform.scale[0] = p.scale[0] * l.scale[0];
      this.worldTransform.scale[1] = p.scale[1] * l.scale[1];
      this.worldTransform.scale[2] = p.scale[2] * l.scale[2];

      this.worldVisible = this.parent.worldVisible && this.visible;
      this.worldOpacity = this.parent.worldOpacity * this.opacity;
    }

    for (let i = 0; i < this.children.length; i++) {
      this.children[i]!.updateWorldTransform();
    }
  }

  /**
   * A3: Project local-space geometry through this node's effective manifold + world rotation.
   * Atoms should prefer this over hand-rolled getEffectiveManifold().project(...).
   */
  projectLocal(options: Omit<ProjectOptions, 'rotation' | 'baseOpacity'> & {
    baseOpacity?: number;
  }): ProjectedPointResult | undefined {
    const manifold = this.getEffectiveManifold();
    if (!manifold) return undefined;
    return manifold.project({
      ...options,
      rotation: this.worldTransform.rotation,
      baseOpacity: (options.baseOpacity ?? 1) * this.worldOpacity,
    });
  }

  /**
   * Called on every frame tick.
   */
  update(context: UpdateContext): void {
    const s = this.channels.schema;
    if (s.xOffset || s.yOffset || s.zOffset || s.rotateX || s.rotateY || s.rotateZ || s.scaleX || s.scaleY || s.scaleZ || s.opacity) {
      this.localTransform.position[0] = this.baseTransform.position[0] + (s.xOffset ? (this.channels.get<number>('xOffset') ?? 0) : 0);
      this.localTransform.position[1] = this.baseTransform.position[1] + (s.yOffset ? (this.channels.get<number>('yOffset') ?? 0) : 0);
      this.localTransform.position[2] = this.baseTransform.position[2] + (s.zOffset ? (this.channels.get<number>('zOffset') ?? 0) : 0);

      this.localTransform.rotation[0] = this.baseTransform.rotation[0] + (s.rotateX ? (this.channels.get<number>('rotateX') ?? 0) : 0);
      this.localTransform.rotation[1] = this.baseTransform.rotation[1] + (s.rotateY ? (this.channels.get<number>('rotateY') ?? 0) : 0);
      this.localTransform.rotation[2] = this.baseTransform.rotation[2] + (s.rotateZ ? (this.channels.get<number>('rotateZ') ?? 0) : 0);

      this.localTransform.scale[0] = this.baseTransform.scale[0] * (s.scaleX ? (this.channels.get<number>('scaleX') ?? 1.0) : 1.0);
      this.localTransform.scale[1] = this.baseTransform.scale[1] * (s.scaleY ? (this.channels.get<number>('scaleY') ?? 1.0) : 1.0);
      this.localTransform.scale[2] = this.baseTransform.scale[2] * (s.scaleZ ? (this.channels.get<number>('scaleZ') ?? 1.0) : 1.0);

      if (s.opacity !== undefined) {
        this.opacity = this.channels.get<number>('opacity') ?? 1.0;
      }
    }

    for (let i = 0; i < this.children.length; i++) {
      this.children[i]!.update(context);
    }
  }

  /**
   * Resolves the projection manifold for this node:
   * own manifold → else inherit ancestor when inheritPlane is true.
   * Siblings under the same plane group share one surface and stay coplanar.
   */
  getEffectiveManifold(): IProjectionManifold | undefined {
    if (this.projectionManifold) return this.projectionManifold;
    if (!this.inheritPlane) return undefined;
    if (this.parent) return this.parent.getEffectiveManifold();
    return undefined;
  }

  /** True when this node and `other` resolve to the same manifold instance. */
  sharesPlaneWith(other: AvatarNode): boolean {
    const a = this.getEffectiveManifold();
    const b = other.getEffectiveManifold();
    return Boolean(a && b && a === b);
  }
}
