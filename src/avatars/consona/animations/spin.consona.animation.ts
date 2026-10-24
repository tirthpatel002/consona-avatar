import { hypot3 } from '../../../core/math/hypot.ts';
import { defineAnimation, type DefinedAnimation } from '../../../core/define/defineAnimation.ts';
import type { SpinAxis } from '../../../core/types/Transform3D.ts';

export interface Spin3DOptions {
  axis?: SpinAxis;
  duration?: number;
  reverse?: boolean;
  hopScale?: number;
}

/**
 * Quintic smooth polynomial for C2-continuous motion (zero velocity & acceleration at endpoints).
 */
export function smoothQuintic(p: number): number {
  const c = Math.max(0, Math.min(1, p));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

/**
 * Resolves and normalizes any 3D axis configuration into a normalized unit vector [ux, uy, uz].
 * Supports plain X/Y/Z, 45-degree diagonal combinations (XY, XZ, YZ, XYZ), and arbitrary 3D line vectors.
 */
export function resolveNormalizedSpinAxis(axis?: SpinAxis): { ux: number; uy: number; uz: number } {
  if (!axis) {
    return { ux: 0, uy: 1, uz: 0 }; // Default to Y-axis (turntable)
  }

  // 1. Vector Array [x, y, z]
  if (Array.isArray(axis)) {
    const vx = Number(axis[0]) || 0;
    const vy = Number(axis[1]) || 0;
    const vz = Number(axis[2]) || 0;
    const len = hypot3(vx, vy, vz) || 1;
    return { ux: vx / len, uy: vy / len, uz: vz / len };
  }

  // 2. Vector Object { x, y, z }
  if (typeof axis === 'object') {
    const vx = typeof axis.x === 'boolean' ? (axis.x ? 1 : 0) : Number(axis.x) || 0;
    const vy = typeof axis.y === 'boolean' ? (axis.y ? 1 : 0) : Number(axis.y) || 0;
    const vz = typeof axis.z === 'boolean' ? (axis.z ? 1 : 0) : Number(axis.z) || 0;
    const len = hypot3(vx, vy, vz) || 1;
    return { ux: vx / len, uy: vy / len, uz: vz / len };
  }

  // 3. String Keys
  const str = String(axis).toLowerCase().trim();
  switch (str) {
    case 'x':
    case 'pitch':
    case 'somersault':
    case 'flipvertical':
      return { ux: 1, uy: 0, uz: 0 };

    case 'y':
    case 'yaw':
    case 'turntable':
    case 'fliphorizontal':
      return { ux: 0, uy: 1, uz: 0 };

    case 'z':
    case 'roll':
    case '2d':
    case 'inplane':
      return { ux: 0, uy: 0, uz: 1 };

    case 'xy': {
      const invSqrt2 = 1 / Math.SQRT2;
      return { ux: invSqrt2, uy: invSqrt2, uz: 0 };
    }

    case 'xz': {
      const invSqrt2 = 1 / Math.SQRT2;
      return { ux: invSqrt2, uy: 0, uz: invSqrt2 };
    }

    case 'yz': {
      const invSqrt2 = 1 / Math.SQRT2;
      return { ux: 0, uy: invSqrt2, uz: invSqrt2 };
    }

    case 'xyz':
    case '3d':
    case 'tumbler': {
      const invSqrt3 = 1 / Math.sqrt(3);
      return { ux: invSqrt3, uy: invSqrt3, uz: invSqrt3 };
    }

    default: {
      const hasX = str.includes('x');
      const hasY = str.includes('y');
      const hasZ = str.includes('z');
      const vx = hasX ? 1 : 0;
      const vy = hasY ? 1 : 0;
      const vz = hasZ ? 1 : 0;
      const len = hypot3(vx, vy, vz);
      if (len > 0) {
        return { ux: vx / len, uy: vy / len, uz: vz / len };
      }
      return { ux: 0, uy: 1, uz: 0 };
    }
  }
}

/**
 * Evaluates 3D spin kinematics across any arbitrary 3D line in space.
 * Rigid in-place rotation with zero yOffset elevation/hopping so features never disconnect.
 * Every axis rotates the body node (headGroup) only; the ground shadow is not
 * under any rotating transform, so it stays flat on the floor.
 */
export function evaluate3DSpinPose(
  theta: number,
  axis: { ux: number; uy: number; uz: number },
  options?: { hopProgress?: number }
): Record<string, any> {
  const { ux, uy, uz } = axis;
  const p = options?.hopProgress !== undefined ? options.hopProgress : (theta / (Math.PI * 2));
  const smoothEnvelope = Math.sin(Math.max(0, Math.min(1, p)) * Math.PI);

  const isPureZ = uz > 0.95 && Math.abs(ux) < 0.05 && Math.abs(uy) < 0.05;
  const isPureX = ux > 0.95 && Math.abs(uy) < 0.05 && Math.abs(uz) < 0.05;
  const isPureY = uy > 0.95 && Math.abs(ux) < 0.05 && Math.abs(uz) < 0.05;
  const isDiagonalXY = Math.abs(ux) > 0.4 && Math.abs(uy) > 0.4 && Math.abs(uz) < 0.05;

  let headThetaX = 0;
  let headThetaY = 0;
  let headThetaZ = 0;

  if (isPureZ) {
    // Pure 2D in-plane roll of the body (headGroup), never the scene root:
    // the root also carries the ground shadow, which must stay flat.
    headThetaZ = theta;
  } else if (isPureY) {
    // Pure Horizontal 3D Globe Spin
    headThetaY = theta;
  } else if (isPureX) {
    // Pure Vertical Somersault
    headThetaX = theta;
  } else if (isDiagonalXY) {
    // Diagonal 3D Somersault: Body tilts 32° to align with the axis, and spins 360° around that aligned axis
    headThetaZ = Math.sin(p * Math.PI) * (32 * Math.PI / 180);
    headThetaY = theta;
  } else {
    // General 3D Multi-Axis Tumbler
    headThetaX = ux * theta;
    headThetaY = uy * theta;
    headThetaZ = uz * theta;
  }

  // Centrifugal pupil expansion
  const centrifugalDilation = 1.0 + smoothEnvelope * 0.55;

  return {
    'consona:headGroup': {
      rotateX: headThetaX,
      rotateY: headThetaY,
      rotateZ: headThetaZ,
    },
    'consona:head': {
      scaleX: 1.0,
      scaleY: 1.0,
    },
    'consona:eyes': {
      pupilScale: 0.48 * centrifugalDilation,
    },
  };
}

/**
 * Factory function to create a customizable One-Shot Spin Behavior.
 */
export function createSpinAnimation(options: Spin3DOptions = {}): DefinedAnimation {
  const duration = options.duration ?? 0.92;
  const resolvedAxis = resolveNormalizedSpinAxis(options.axis ?? 'y');
  const dirMultiplier = options.reverse ? -1 : 1;

  return defineAnimation({
    name: 'spin',
    duration,
    loop: false,
    evaluate: (time: number) => {
      const p = Math.max(0, Math.min(1, time / duration));
      const smoothP = smoothQuintic(p);
      const theta = smoothP * Math.PI * 2 * dirMultiplier;

      return evaluate3DSpinPose(theta, resolvedAxis, {
        hopProgress: p,
      });
    },
  });
}

/**
 * Factory function to create a continuous looping 360-degree Infinite Rotation Animation.
 */
export function createRotateAnimation(options: Spin3DOptions = {}): DefinedAnimation {
  const duration = options.duration ?? 2.4;
  const resolvedAxis = resolveNormalizedSpinAxis(options.axis ?? 'y');
  const dirMultiplier = options.reverse ? -1 : 1;

  return defineAnimation({
    name: 'rotate',
    duration,
    loop: true,
    evaluate: (time: number) => {
      const cycleT = (((time % duration) + duration) % duration);
      const theta = (cycleT / duration) * Math.PI * 2 * dirMultiplier;

      const rotateX = resolvedAxis.ux * theta;
      const rotateY = resolvedAxis.uy * theta;
      const rotateZ = resolvedAxis.uz * theta;

      return {
        'consona:headGroup': {
          rotateX,
          rotateY,
          rotateZ,
        },
        'consona:head': {
          scaleX: 1.0,
          scaleY: 1.0,
        },
        'consona:eyes': {
          pupilScale: 0.48 * (1.0 + Math.abs(Math.sin(theta)) * 0.15),
        },
      };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Pre-built Spin Behaviors & Rotate Loop Animations
// ─────────────────────────────────────────────────────────────────────────────

function namedSpin(axis: SpinAxis, name: string): DefinedAnimation {
  const base = createSpinAnimation({ axis });
  return { ...base, name, id: name };
}

function namedRotate(axis: SpinAxis, name: string): DefinedAnimation {
  const base = createRotateAnimation({ axis });
  return { ...base, name, id: name };
}

export const consonaSpinAnimation = createSpinAnimation({ axis: 'y' });
export const consonaSpinXAnimation = namedSpin('x', 'spinX');
export const consonaSpinZAnimation = namedSpin('z', 'spinZ');
export const consonaSpinXYAnimation = namedSpin('xy', 'spinXY');
export const consonaSpinXYZAnimation = namedSpin('xyz', 'spinXYZ');

export const consonaRotateAnimation = createRotateAnimation({ axis: 'y' });
export const consonaRotateXPresetAnimation = namedRotate('x', 'rotateX');
export const consonaRotateZPresetAnimation = namedRotate('z', 'rotateZ');
export const consonaRotateXYZPresetAnimation = namedRotate('xyz', 'rotateXYZ');

const NAMED_SPIN_AXES = new Set(['x', 'pitch', 'y', 'yaw', 'z', 'roll', 'xy', 'xyz', '3d']);

/**
 * Map a play({ axis }) option to a pre-registered spin animation name.
 * Returns null when a custom axis needs an on-the-fly factory registration.
 */
export function resolveSpinAnimationName(axis?: SpinAxis): string | null {
  if (axis === undefined || axis === null) return 'spin';
  if (typeof axis !== 'string') return null;
  const ax = axis.toLowerCase();
  if (!NAMED_SPIN_AXES.has(ax)) return null;
  if (ax === 'x' || ax === 'pitch') return 'spinX';
  if (ax === 'y' || ax === 'yaw') return 'spin';
  if (ax === 'z' || ax === 'roll') return 'spinZ';
  if (ax === 'xy') return 'spinXY';
  if (ax === 'xyz' || ax === '3d') return 'spinXYZ';
  return 'spin';
}
