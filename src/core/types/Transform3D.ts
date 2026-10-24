/**
 * 3D Spatial coordinates and transform contracts for scene graph nodes and root entities.
 */

export interface Transform3D {
  position: [number, number, number]; // [x, y, z]
  rotation: [number, number, number]; // Euler angles in radians [pitch (x), yaw (y), roll (z)]
  scale: [number, number, number];    // [scaleX, scaleY, scaleZ]
}

export function createDefaultTransform3D(): Transform3D {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

export type SpinAxis =
  | 'x'
  | 'y'
  | 'z'
  | 'xy'
  | 'xz'
  | 'yz'
  | 'xyz'
  | '3d'
  | 'pitch'
  | 'yaw'
  | 'roll'
  | 'somersault'
  | 'turntable'
  | { x?: number | boolean; y?: number | boolean; z?: number | boolean }
  | [number, number, number]
  | string;
