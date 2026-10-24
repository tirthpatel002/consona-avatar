/**
 * 2D Vector mathematics supporting both immutable functional operations
 * and zero-allocation in-place mutation for high-performance 60-144fps render loops.
 */

export interface IVector2D {
  readonly x: number;
  readonly y: number;
}

export class Vector2D implements IVector2D {
  public x: number;
  public y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  static create(x: number = 0, y: number = 0): Vector2D {
    return new Vector2D(x, y);
  }

  static zero(): Vector2D {
    return new Vector2D(0, 0);
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v: IVector2D): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  clone(): Vector2D {
    return new Vector2D(this.x, this.y);
  }

  add(other: IVector2D): Vector2D {
    return new Vector2D(this.x + other.x, this.y + other.y);
  }

  addInPlace(other: IVector2D): this {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  sub(other: IVector2D): Vector2D {
    return new Vector2D(this.x - other.x, this.y - other.y);
  }

  subInPlace(other: IVector2D): this {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  scale(scalar: number): Vector2D {
    return new Vector2D(this.x * scalar, this.y * scalar);
  }

  scaleInPlace(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  magnitudeSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): Vector2D {
    const mag = this.magnitude();
    if (mag === 0) return Vector2D.zero();
    return new Vector2D(this.x / mag, this.y / mag);
  }

  normalizeInPlace(): this {
    const mag = this.magnitude();
    if (mag > 0) {
      this.x /= mag;
      this.y /= mag;
    }
    return this;
  }

  distance(other: IVector2D): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  lerp(target: IVector2D, t: number): Vector2D {
    const clampedT = Math.max(0, Math.min(1, t));
    return new Vector2D(
      this.x + (target.x - this.x) * clampedT,
      this.y + (target.y - this.y) * clampedT
    );
  }

  lerpInPlace(target: IVector2D, t: number): this {
    const clampedT = Math.max(0, Math.min(1, t));
    this.x += (target.x - this.x) * clampedT;
    this.y += (target.y - this.y) * clampedT;
    return this;
  }

  clamp(minX: number, maxX: number, minY: number, maxY: number): Vector2D {
    return new Vector2D(
      Math.max(minX, Math.min(maxX, this.x)),
      Math.max(minY, Math.min(maxY, this.y))
    );
  }

  clampInPlace(minX: number, maxX: number, minY: number, maxY: number): this {
    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.y = Math.max(minY, Math.min(maxY, this.y));
    return this;
  }

  clampMagnitude(maxMag: number): Vector2D {
    const magSq = this.magnitudeSq();
    if (magSq > maxMag * maxMag && magSq > 0) {
      const mag = Math.sqrt(magSq);
      return new Vector2D((this.x / mag) * maxMag, (this.y / mag) * maxMag);
    }
    return this.clone();
  }

  clampMagnitudeInPlace(maxMag: number): this {
    const magSq = this.magnitudeSq();
    if (magSq > maxMag * maxMag && magSq > 0) {
      const mag = Math.sqrt(magSq);
      this.x = (this.x / mag) * maxMag;
      this.y = (this.y / mag) * maxMag;
    }
    return this;
  }

  dot(other: IVector2D): number {
    return this.x * other.x + this.y * other.y;
  }

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  equals(other: IVector2D, epsilon: number = 1e-5): boolean {
    return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other.y) < epsilon;
  }

  toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}
