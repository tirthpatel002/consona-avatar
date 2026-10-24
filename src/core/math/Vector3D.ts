/**
 * 3D Vector mathematics for 3D spatial transforms, rotations (Euler), and manifold math.
 */

export interface IVector3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class Vector3D implements IVector3D {
  public x: number;
  public y: number;
  public z: number;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  static create(x: number = 0, y: number = 0, z: number = 0): Vector3D {
    return new Vector3D(x, y, z);
  }

  static zero(): Vector3D {
    return new Vector3D(0, 0, 0);
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: IVector3D): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  clone(): Vector3D {
    return new Vector3D(this.x, this.y, this.z);
  }

  add(other: IVector3D): Vector3D {
    return new Vector3D(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  addInPlace(other: IVector3D): this {
    this.x += other.x;
    this.y += other.y;
    this.z += other.z;
    return this;
  }

  sub(other: IVector3D): Vector3D {
    return new Vector3D(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  subInPlace(other: IVector3D): this {
    this.x -= other.x;
    this.y -= other.y;
    this.z -= other.z;
    return this;
  }

  scale(scalar: number): Vector3D {
    return new Vector3D(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  scaleInPlace(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }

  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  magnitudeSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  normalize(): Vector3D {
    const mag = this.magnitude();
    if (mag === 0) return Vector3D.zero();
    return new Vector3D(this.x / mag, this.y / mag, this.z / mag);
  }

  normalizeInPlace(): this {
    const mag = this.magnitude();
    if (mag > 0) {
      this.x /= mag;
      this.y /= mag;
      this.z /= mag;
    }
    return this;
  }

  dot(other: IVector3D): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  cross(other: IVector3D): Vector3D {
    return new Vector3D(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x
    );
  }

  lerp(target: IVector3D, t: number): Vector3D {
    const clampedT = Math.max(0, Math.min(1, t));
    return new Vector3D(
      this.x + (target.x - this.x) * clampedT,
      this.y + (target.y - this.y) * clampedT,
      this.z + (target.z - this.z) * clampedT
    );
  }

  lerpInPlace(target: IVector3D, t: number): this {
    const clampedT = Math.max(0, Math.min(1, t));
    this.x += (target.x - this.x) * clampedT;
    this.y += (target.y - this.y) * clampedT;
    this.z += (target.z - this.z) * clampedT;
    return this;
  }

  distance(other: IVector3D): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  toJSON(): { x: number; y: number; z: number } {
    return { x: this.x, y: this.y, z: this.z };
  }
}
