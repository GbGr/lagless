import { MathOps } from './math-ops.js';
import { IVector3Like, Vector3 } from './vector3.js';

export interface IQuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export class Quaternion {
  public static readonly IDENTITY = new Quaternion(0, 0, 0, 1);
  public static readonly EPSILON = 1e-8;

  constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}

  // ---- Basic utilities ----

  public setInPlace(x: number, y: number, z: number, w: number): Quaternion {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  public copyFrom(other: IQuaternionLike): Quaternion {
    this.x = other.x;
    this.y = other.y;
    this.z = other.z;
    this.w = other.w;
    return this;
  }

  public copyToRef(ref: IQuaternionLike): IQuaternionLike {
    ref.x = this.x;
    ref.y = this.y;
    ref.z = this.z;
    ref.w = this.w;
    return ref;
  }

  public clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  // ---- Metrics ----

  public lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
  }

  public length(): number {
    return MathOps.sqrt(this.lengthSquared());
  }

  public dot(other: IQuaternionLike): number {
    return this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w;
  }

  // ---- Normalization ----

  public normalizeInPlace(): Quaternion {
    const lsq = this.lengthSquared();
    if (lsq > Quaternion.EPSILON) {
      const invLen = 1 / MathOps.sqrt(lsq);
      this.x *= invLen;
      this.y *= invLen;
      this.z *= invLen;
      this.w *= invLen;
    }
    return this;
  }

  public normalizeToRef(ref: Quaternion): Quaternion {
    const lsq = this.lengthSquared();
    if (lsq > Quaternion.EPSILON) {
      const invLen = 1 / MathOps.sqrt(lsq);
      ref.x = this.x * invLen;
      ref.y = this.y * invLen;
      ref.z = this.z * invLen;
      ref.w = this.w * invLen;
    } else {
      ref.x = 0;
      ref.y = 0;
      ref.z = 0;
      ref.w = 1;
    }
    return ref;
  }

  public normalizedToNew(): Quaternion {
    return this.normalizeToRef(new Quaternion());
  }

  // ---- Conjugate / Inverse ----

  public conjugateInPlace(): Quaternion {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  public conjugateToRef(ref: Quaternion): Quaternion {
    ref.x = -this.x;
    ref.y = -this.y;
    ref.z = -this.z;
    ref.w = this.w;
    return ref;
  }

  public conjugateToNew(): Quaternion {
    return this.conjugateToRef(new Quaternion());
  }

  public invertInPlace(): Quaternion {
    const lsq = this.lengthSquared();
    if (lsq > Quaternion.EPSILON) {
      const invLsq = 1 / lsq;
      this.x = -this.x * invLsq;
      this.y = -this.y * invLsq;
      this.z = -this.z * invLsq;
      this.w = this.w * invLsq;
    }
    return this;
  }

  public invertToNew(): Quaternion {
    return this.clone().invertInPlace();
  }

  // ---- Multiplication (this * other) ----

  public multiplyToNew(other: IQuaternionLike): Quaternion {
    return this.multiplyToRef(other, new Quaternion());
  }

  public multiplyToRef(other: IQuaternionLike, ref: Quaternion): Quaternion {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = other.x, by = other.y, bz = other.z, bw = other.w;
    ref.x = aw * bx + ax * bw + ay * bz - az * by;
    ref.y = aw * by - ax * bz + ay * bw + az * bx;
    ref.z = aw * bz + ax * by - ay * bx + az * bw;
    ref.w = aw * bw - ax * bx - ay * by - az * bz;
    return ref;
  }

  public multiplyInPlace(other: IQuaternionLike): Quaternion {
    return this.multiplyToRef(other, this);
  }

  // ---- Rotate vector ----

  public rotateVector3ToRef(v: IVector3Like, ref: Vector3): Vector3 {
    const qx = this.x, qy = this.y, qz = this.z, qw = this.w;
    const vx = v.x, vy = v.y, vz = v.z;
    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    // result = v + qw * t + cross(q.xyz, t)
    ref.x = vx + qw * tx + (qy * tz - qz * ty);
    ref.y = vy + qw * ty + (qz * tx - qx * tz);
    ref.z = vz + qw * tz + (qx * ty - qy * tx);
    return ref;
  }

  public rotateVector3ToNew(v: IVector3Like): Vector3 {
    return this.rotateVector3ToRef(v, new Vector3());
  }

  // ---- Slerp ----

  public slerpToRef(to: IQuaternionLike, t: number, ref: Quaternion): Quaternion {
    let bx = to.x, by = to.y, bz = to.z, bw = to.w;
    let cosOmega = this.x * bx + this.y * by + this.z * bz + this.w * bw;

    // Take shortest path
    if (cosOmega < 0) {
      cosOmega = -cosOmega;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }

    let s0: number, s1: number;
    if (cosOmega > 1 - Quaternion.EPSILON) {
      // Very close — use lerp to avoid division by zero
      s0 = 1 - t;
      s1 = t;
    } else {
      const sinOmega = MathOps.sqrt(1 - cosOmega * cosOmega);
      const omega = MathOps.atan2(sinOmega, cosOmega);
      const invSin = 1 / sinOmega;
      s0 = MathOps.sin((1 - t) * omega) * invSin;
      s1 = MathOps.sin(t * omega) * invSin;
    }

    ref.x = s0 * this.x + s1 * bx;
    ref.y = s0 * this.y + s1 * by;
    ref.z = s0 * this.z + s1 * bz;
    ref.w = s0 * this.w + s1 * bw;
    return ref;
  }

  public slerpToNew(to: IQuaternionLike, t: number): Quaternion {
    return this.slerpToRef(to, t, new Quaternion());
  }

  public slerpInPlace(to: IQuaternionLike, t: number): Quaternion {
    return this.slerpToRef(to, t, this);
  }

  // ---- Euler extraction ----

  /** Extract yaw (Y-axis rotation) from this quaternion. */
  public toEulerYaw(): number {
    const sinYaw = 2 * (this.w * this.y + this.x * this.z);
    const cosYaw = 1 - 2 * (this.y * this.y + this.x * this.x);
    return MathOps.atan2(sinYaw, cosYaw);
  }

  // ---- Equality ----

  public equals(other: IQuaternionLike): boolean {
    return this.x === other.x && this.y === other.y && this.z === other.z && this.w === other.w;
  }

  public approxEquals(other: IQuaternionLike, eps = Quaternion.EPSILON): boolean {
    return (
      Math.abs(this.x - other.x) <= eps &&
      Math.abs(this.y - other.y) <= eps &&
      Math.abs(this.z - other.z) <= eps &&
      Math.abs(this.w - other.w) <= eps
    );
  }

  // ---- Static constructors ----

  /** Create quaternion from axis-angle. Axis should be normalized. */
  public static fromAxisAngle(axis: IVector3Like, angle: number): Quaternion {
    return Quaternion.fromAxisAngleToRef(axis, angle, new Quaternion());
  }

  public static fromAxisAngleToRef(axis: IVector3Like, angle: number, ref: Quaternion): Quaternion {
    const halfAngle = angle * 0.5;
    const s = MathOps.sin(halfAngle);
    ref.x = axis.x * s;
    ref.y = axis.y * s;
    ref.z = axis.z * s;
    ref.w = MathOps.cos(halfAngle);
    return ref;
  }

  /** Create quaternion from Euler angles (Y-up convention: yaw=Y, pitch=X, roll=Z). */
  public static fromYawPitchRoll(yaw: number, pitch: number, roll: number): Quaternion {
    return Quaternion.fromYawPitchRollToRef(yaw, pitch, roll, new Quaternion());
  }

  public static fromYawPitchRollToRef(yaw: number, pitch: number, roll: number, ref: Quaternion): Quaternion {
    const hy = yaw * 0.5;
    const hp = pitch * 0.5;
    const hr = roll * 0.5;
    const sy = MathOps.sin(hy);
    const cy = MathOps.cos(hy);
    const sp = MathOps.sin(hp);
    const cp = MathOps.cos(hp);
    const sr = MathOps.sin(hr);
    const cr = MathOps.cos(hr);
    // Rotation order: Y (yaw) * X (pitch) * Z (roll)
    ref.x = cy * sp * cr + sy * cp * sr;
    ref.y = sy * cp * cr - cy * sp * sr;
    ref.z = cy * cp * sr - sy * sp * cr;
    ref.w = cy * cp * cr + sy * sp * sr;
    return ref;
  }

  /** Create quaternion representing rotation around Y axis. */
  public static fromYaw(yaw: number): Quaternion {
    return Quaternion.fromYawToRef(yaw, new Quaternion());
  }

  public static fromYawToRef(yaw: number, ref: Quaternion): Quaternion {
    const half = yaw * 0.5;
    ref.x = 0;
    ref.y = MathOps.sin(half);
    ref.z = 0;
    ref.w = MathOps.cos(half);
    return ref;
  }
}
