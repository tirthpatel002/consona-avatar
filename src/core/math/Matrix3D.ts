import { Vector2D, type IVector2D } from './Vector2D.ts';
import { Vector3D, type IVector3D } from './Vector3D.ts';

/**
 * 3x3 Matrix for 2D Affine & 3D Euler coordinate transformations.
 * Backed by Float64Array for maximum numerical precision and zero GC overhead.
 * Matrix layout (row-major):
 * [ m00, m01, m02 ]
 * [ m10, m11, m12 ]
 * [ m20, m21, m22 ]
 */
export class Matrix3D {
  public readonly elements: Float64Array;

  constructor(elements?: ArrayLike<number>) {
    this.elements = new Float64Array(9);
    if (elements) {
      for (let i = 0; i < 9; i++) {
        this.elements[i] = elements[i] ?? (i % 4 === 0 ? 1 : 0);
      }
    } else {
      this.identity();
    }
  }

  static identity(): Matrix3D {
    return new Matrix3D();
  }

  identity(): this {
    const el = this.elements;
    el[0] = 1; el[1] = 0; el[2] = 0;
    el[3] = 0; el[4] = 1; el[5] = 0;
    el[6] = 0; el[7] = 0; el[8] = 1;
    return this;
  }

  copy(m: Matrix3D): this {
    this.elements.set(m.elements);
    return this;
  }

  clone(): Matrix3D {
    return new Matrix3D(this.elements);
  }

  /**
   * Sets the matrix from Euler angles (in radians) with order Pitch(X) -> Yaw(Y) -> Roll(Z).
   */
  setFromEuler(pitch: number, yaw: number, roll: number): this {
    const cx = Math.cos(pitch);
    const sx = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cz = Math.cos(roll);
    const sz = Math.sin(roll);

    const el = this.elements;

    // R = Rz * Ry * Rx
    el[0] = cy * cz;
    el[1] = sx * sy * cz - cx * sz;
    el[2] = cx * sy * cz + sx * sz;

    el[3] = cy * sz;
    el[4] = sx * sy * sz + cx * cz;
    el[5] = cx * sy * sz - sx * cz;

    el[6] = -sy;
    el[7] = sx * cy;
    el[8] = cx * cy;

    return this;
  }

  /**
   * Transforms a 3D vector by this 3x3 matrix in-place or returning a new Vector3D.
   */
  transformVector3(v: IVector3D, out?: Vector3D): Vector3D {
    const x = v.x;
    const y = v.y;
    const z = v.z;
    const el = this.elements;

    const rx = el[0]! * x + el[1]! * y + el[2]! * z;
    const ry = el[3]! * x + el[4]! * y + el[5]! * z;
    const rz = el[6]! * x + el[7]! * y + el[8]! * z;

    if (out) {
      return out.set(rx, ry, rz);
    }
    return new Vector3D(rx, ry, rz);
  }

  /**
   * Multiplies this matrix by another (this = this * m).
   */
  multiply(m: Matrix3D): this {
    const a = this.elements;
    const b = m.elements;

    const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!;
    const a10 = a[3]!, a11 = a[4]!, a12 = a[5]!;
    const a20 = a[6]!, a21 = a[7]!, a22 = a[8]!;

    const b00 = b[0]!, b01 = b[1]!, b02 = b[2]!;
    const b10 = b[3]!, b11 = b[4]!, b12 = b[5]!;
    const b20 = b[6]!, b21 = b[7]!, b22 = b[8]!;

    a[0] = a00 * b00 + a01 * b10 + a02 * b20;
    a[1] = a00 * b01 + a01 * b11 + a02 * b21;
    a[2] = a00 * b02 + a01 * b12 + a02 * b22;

    a[3] = a10 * b00 + a11 * b10 + a12 * b20;
    a[4] = a10 * b01 + a11 * b11 + a12 * b21;
    a[5] = a10 * b02 + a11 * b12 + a12 * b22;

    a[6] = a20 * b00 + a21 * b10 + a22 * b20;
    a[7] = a20 * b01 + a21 * b11 + a22 * b21;
    a[8] = a20 * b02 + a21 * b12 + a22 * b22;

    return this;
  }
}
