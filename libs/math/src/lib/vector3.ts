import { MathOps } from './math-ops.js';

export interface IVector3Like {
  x: number;
  y: number;
  z: number;
}

export class Vector3 {
  public static readonly ZERO = new Vector3(0, 0, 0);
  public static readonly ONE = new Vector3(1, 1, 1);
  public static readonly UNIT_X = new Vector3(1, 0, 0);
  public static readonly UNIT_Y = new Vector3(0, 1, 0);
  public static readonly UNIT_Z = new Vector3(0, 0, 1);

  public static readonly UP = new Vector3(0, 1, 0);
  public static readonly DOWN = new Vector3(0, -1, 0);
  public static readonly LEFT = new Vector3(-1, 0, 0);
  public static readonly RIGHT = new Vector3(1, 0, 0);
  public static readonly FORWARD = new Vector3(0, 0, 1);
  public static readonly BACKWARD = new Vector3(0, 0, -1);

  public static readonly EPSILON = 1e-8;

  constructor(public x = 0, public y = 0, public z = 0) {}

  // ---- Basic utilities ----

  public setInPlace(x: number, y: number, z: number): Vector3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  public copyFrom(other: IVector3Like): Vector3 {
    this.x = other.x;
    this.y = other.y;
    this.z = other.z;
    return this;
  }

  public copyToRef(ref: IVector3Like): IVector3Like {
    ref.x = this.x;
    ref.y = this.y;
    ref.z = this.z;
    return ref;
  }

  public clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  // ---- Addition ----

  public addToNew(other: IVector3Like): Vector3 {
    return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  public addToRef(other: IVector3Like, ref: Vector3): Vector3 {
    ref.x = this.x + other.x;
    ref.y = this.y + other.y;
    ref.z = this.z + other.z;
    return ref;
  }

  public addInPlace(other: IVector3Like): Vector3 {
    this.x += other.x;
    this.y += other.y;
    this.z += other.z;
    return this;
  }

  // ---- Subtraction ----

  public subToNew(other: IVector3Like): Vector3 {
    return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  public subToRef(other: IVector3Like, ref: Vector3): Vector3 {
    ref.x = this.x - other.x;
    ref.y = this.y - other.y;
    ref.z = this.z - other.z;
    return ref;
  }

  public subInPlace(other: IVector3Like): Vector3 {
    this.x -= other.x;
    this.y -= other.y;
    this.z -= other.z;
    return this;
  }

  // ---- Component-wise multiply ----

  public mulToNew(other: IVector3Like): Vector3 {
    return new Vector3(this.x * other.x, this.y * other.y, this.z * other.z);
  }

  public mulToRef(other: IVector3Like, ref: Vector3): Vector3 {
    ref.x = this.x * other.x;
    ref.y = this.y * other.y;
    ref.z = this.z * other.z;
    return ref;
  }

  public mulInPlace(other: IVector3Like): Vector3 {
    this.x *= other.x;
    this.y *= other.y;
    this.z *= other.z;
    return this;
  }

  // ---- Component-wise divide ----

  public divToNew(other: IVector3Like): Vector3 {
    return new Vector3(this.x / other.x, this.y / other.y, this.z / other.z);
  }

  public divToRef(other: IVector3Like, ref: Vector3): Vector3 {
    ref.x = this.x / other.x;
    ref.y = this.y / other.y;
    ref.z = this.z / other.z;
    return ref;
  }

  public divInPlace(other: IVector3Like): Vector3 {
    this.x /= other.x;
    this.y /= other.y;
    this.z /= other.z;
    return this;
  }

  // ---- Scale by scalar ----

  public scaleToNew(s: number): Vector3 {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }

  public scaleToRef(s: number, ref: Vector3): Vector3 {
    ref.x = this.x * s;
    ref.y = this.y * s;
    ref.z = this.z * s;
    return ref;
  }

  public scaleInPlace(s: number): Vector3 {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  // ---- Negate / Abs ----

  public negateToNew(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  public negateToRef(ref: Vector3): Vector3 {
    ref.x = -this.x;
    ref.y = -this.y;
    ref.z = -this.z;
    return ref;
  }

  public negateInPlace(): Vector3 {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  public absToNew(): Vector3 {
    return new Vector3(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z));
  }

  public absToRef(ref: Vector3): Vector3 {
    ref.x = Math.abs(this.x);
    ref.y = Math.abs(this.y);
    ref.z = Math.abs(this.z);
    return ref;
  }

  public absInPlace(): Vector3 {
    this.x = Math.abs(this.x);
    this.y = Math.abs(this.y);
    this.z = Math.abs(this.z);
    return this;
  }

  // ---- Min/Max/Clamp (component-wise) ----

  public minToRef(other: IVector3Like, ref: Vector3): Vector3 {
    ref.x = Math.min(this.x, other.x);
    ref.y = Math.min(this.y, other.y);
    ref.z = Math.min(this.z, other.z);
    return ref;
  }

  public minInPlace(other: IVector3Like): Vector3 {
    this.x = Math.min(this.x, other.x);
    this.y = Math.min(this.y, other.y);
    this.z = Math.min(this.z, other.z);
    return this;
  }

  public maxToRef(other: IVector3Like, ref: Vector3): Vector3 {
    ref.x = Math.max(this.x, other.x);
    ref.y = Math.max(this.y, other.y);
    ref.z = Math.max(this.z, other.z);
    return ref;
  }

  public maxInPlace(other: IVector3Like): Vector3 {
    this.x = Math.max(this.x, other.x);
    this.y = Math.max(this.y, other.y);
    this.z = Math.max(this.z, other.z);
    return this;
  }

  public clampToRef(min: IVector3Like, max: IVector3Like, ref: Vector3): Vector3 {
    ref.x = MathOps.clamp(this.x, min.x, max.x);
    ref.y = MathOps.clamp(this.y, min.y, max.y);
    ref.z = MathOps.clamp(this.z, min.z, max.z);
    return ref;
  }

  public clampInPlace(min: IVector3Like, max: IVector3Like): Vector3 {
    return this.clampToRef(min, max, this);
  }

  public clampToNew(min: IVector3Like, max: IVector3Like): Vector3 {
    return this.clampToRef(min, max, new Vector3());
  }

  // ---- Metrics ----

  public lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  public length(): number {
    return MathOps.sqrt(this.lengthSquared());
  }

  public distanceSquaredTo(other: IVector3Like): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    return dx * dx + dy * dy + dz * dz;
  }

  public distanceTo(other: IVector3Like): number {
    return MathOps.sqrt(this.distanceSquaredTo(other));
  }

  // ---- Dot / Cross ----

  public dot(other: IVector3Like): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  public crossToNew(other: IVector3Like): Vector3 {
    return new Vector3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x,
    );
  }

  public crossToRef(other: IVector3Like, ref: Vector3): Vector3 {
    const rx = this.y * other.z - this.z * other.y;
    const ry = this.z * other.x - this.x * other.z;
    const rz = this.x * other.y - this.y * other.x;
    ref.x = rx;
    ref.y = ry;
    ref.z = rz;
    return ref;
  }

  public crossInPlace(other: IVector3Like): Vector3 {
    return this.crossToRef(other, this);
  }

  // ---- Normalization ----

  public normalizeToRef(ref: Vector3): Vector3 {
    const lsq = this.lengthSquared();
    if (lsq > Vector3.EPSILON) {
      const invLen = 1 / MathOps.sqrt(lsq);
      ref.x = this.x * invLen;
      ref.y = this.y * invLen;
      ref.z = this.z * invLen;
    } else {
      ref.x = 0;
      ref.y = 0;
      ref.z = 0;
    }
    return ref;
  }

  public normalizeInPlace(): Vector3 {
    return this.normalizeToRef(this);
  }

  public normalizedToNew(): Vector3 {
    return this.normalizeToRef(new Vector3());
  }

  // ---- Projection / Reflection ----

  public projectOntoToRef(normal: IVector3Like, ref: Vector3): Vector3 {
    const nlsq = normal.x * normal.x + normal.y * normal.y + normal.z * normal.z;
    if (nlsq <= Vector3.EPSILON) {
      ref.x = 0;
      ref.y = 0;
      ref.z = 0;
      return ref;
    }
    const scale = (this.x * normal.x + this.y * normal.y + this.z * normal.z) / nlsq;
    ref.x = normal.x * scale;
    ref.y = normal.y * scale;
    ref.z = normal.z * scale;
    return ref;
  }

  public projectOntoInPlace(normal: IVector3Like): Vector3 {
    return this.projectOntoToRef(normal, this);
  }

  public projectOntoToNew(normal: IVector3Like): Vector3 {
    return this.projectOntoToRef(normal, new Vector3());
  }

  public reflectToRef(normal: IVector3Like, ref: Vector3): Vector3 {
    const d = (this.x * normal.x + this.y * normal.y + this.z * normal.z) * 2;
    ref.x = this.x - d * normal.x;
    ref.y = this.y - d * normal.y;
    ref.z = this.z - d * normal.z;
    return ref;
  }

  public reflectInPlace(normal: IVector3Like): Vector3 {
    return this.reflectToRef(normal, this);
  }

  public reflectToNew(normal: IVector3Like): Vector3 {
    return this.reflectToRef(normal, new Vector3());
  }

  // ---- Lerp ----

  public lerpToRef(to: IVector3Like, t: number, ref: Vector3): Vector3 {
    ref.x = MathOps.lerp(this.x, to.x, t);
    ref.y = MathOps.lerp(this.y, to.y, t);
    ref.z = MathOps.lerp(this.z, to.z, t);
    return ref;
  }

  public lerpInPlace(to: IVector3Like, t: number): Vector3 {
    return this.lerpToRef(to, t, this);
  }

  public lerpToNew(to: IVector3Like, t: number): Vector3 {
    return this.lerpToRef(to, t, new Vector3());
  }

  // ---- Length clamping ----

  public clampLengthInPlace(minLen: number, maxLen: number): Vector3 {
    const lenSq = this.lengthSquared();
    if (lenSq < minLen * minLen) {
      const len = MathOps.sqrt(lenSq);
      if (len > Vector3.EPSILON) {
        this.scaleInPlace(minLen / len);
      } else {
        this.setInPlace(minLen, 0, 0);
      }
    } else if (lenSq > maxLen * maxLen) {
      const len = MathOps.sqrt(lenSq);
      this.scaleInPlace(maxLen / (len > Vector3.EPSILON ? len : 1));
    }
    return this;
  }

  public clampLengthToRef(minLen: number, maxLen: number, ref: Vector3): Vector3 {
    ref.copyFrom(this);
    return ref.clampLengthInPlace(minLen, maxLen);
  }

  public clampLengthToNew(minLen: number, maxLen: number): Vector3 {
    return this.clampLengthToRef(minLen, maxLen, new Vector3());
  }

  // ---- Equality ----

  public equals(other: IVector3Like): boolean {
    return this.x === other.x && this.y === other.y && this.z === other.z;
  }

  public approxEquals(other: IVector3Like, eps = Vector3.EPSILON): boolean {
    return Math.abs(this.x - other.x) <= eps && Math.abs(this.y - other.y) <= eps && Math.abs(this.z - other.z) <= eps;
  }

  // ---- Serialization ----

  public toArray(out: number[] = [], offset = 0): number[] {
    out[offset] = this.x;
    out[offset + 1] = this.y;
    out[offset + 2] = this.z;
    return out;
  }

  public static fromArray(arr: ArrayLike<number>, offset = 0): Vector3 {
    return new Vector3(arr[offset], arr[offset + 1], arr[offset + 2]);
  }

  public static fromArrayToRef(arr: ArrayLike<number>, ref: Vector3, offset = 0): Vector3 {
    ref.x = arr[offset];
    ref.y = arr[offset + 1];
    ref.z = arr[offset + 2];
    return ref;
  }

  // ---- Static helpers ----

  public static minToRef(a: IVector3Like, b: IVector3Like, ref: Vector3): Vector3 {
    ref.x = Math.min(a.x, b.x);
    ref.y = Math.min(a.y, b.y);
    ref.z = Math.min(a.z, b.z);
    return ref;
  }

  public static maxToRef(a: IVector3Like, b: IVector3Like, ref: Vector3): Vector3 {
    ref.x = Math.max(a.x, b.x);
    ref.y = Math.max(a.y, b.y);
    ref.z = Math.max(a.z, b.z);
    return ref;
  }
}
