/**
 * Declarative plane / space options for scene nodes.
 * Applied by the scene builder onto AvatarNode (group = shared surface).
 */
export type NodeSpace = 'plane' | 'local' | 'screen' | 'world';

export interface PlaneDesc {
  type: 'flat' | 'spherical' | 'cylindrical';
  radius?: number;
  /** Canvas-space plane origin, default [50, 50] (spherical/cyl use as center). */
  center?: [number, number];
}

export interface NodeSpaceOptions {
  space?: NodeSpace;
  /** Own projection surface. When set, this node defines (or overrides) the plane. */
  plane?: PlaneDesc;
  /**
   * When true (default), inherit ancestor manifold if this node has none.
   * Set false for flat/screen attachments that must not follow parent curvature
   * (e.g. HUD badge). Children with inheritPlane true still share *this* node's plane.
   */
  inheritPlane?: boolean;
  inheritTransform?: boolean;
  inheritVisibility?: boolean;
  inheritOpacity?: boolean;
  socket?: string;
}
