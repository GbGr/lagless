import { MathOps } from './math-ops.js';

export class Vector2 {
  // ---- Static readonly constants (do not mutate) ----
  public static readonly ZERO = new Vector2(0, 0);
  public static readonly ONE = new Vector2(1, 1);
  public static readonly UNIT_X = new Vector2(1, 0);
  public static readonly UNIT_Y = new Vector2(0, 1);

  public static readonly UP = new Vector2(0, 1);
  public static readonly DOWN = new Vector2(0, -1);
  public static readonly LEFT = new Vector2(-1, 0);
  public static readonly RIGHT = new Vector2(1, 0);

  // Small epsilon for safe normalization/comparisons
  public static readonly EPSILON = 1e-8;

  constructor(public x = 0, public y = 0) {
    this.x = x;
    this.y = y;
  }

  // ---- Basic utilities ----
  public setInPlace(x: number, y: number): Vector2 {
    this.x = x;
    this.y = y;
    return this;
  }

  public copyFrom(other: Vector2): Vector2 {
    this.x = other.x;
    this.y = other.y;
    return this;
  }

  public copyToRef(ref: Vector2): Vector2 {
    ref.x = this.x;
    ref.y = this.y;
    return ref;
  }

  public clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  // ---- Addition ----
  public addToNew(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  public addToRef(other: Vector2, ref: Vector2): Vector2 {
    ref.x = this.x + other.x;
    ref.y = this.y + other.y;
    return ref;
  }

  public addInPlace(other: Vector2): Vector2 {
    return this.addToRef(other, this);
  }

  // ---- Subtraction ----
  public subToNew(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  public subToRef(other: Vector2, ref: Vector2): Vector2 {
    ref.x = this.x - other.x;
    ref.y = this.y - other.y;
    return ref;
  }

  public subInPlace(other: Vector2): Vector2 {
    return this.subToRef(other, this);
  }

  // ---- Component-wise multiply/divide ----
  public mulToNew(other: Vector2): Vector2 {
    return new Vector2(this.x * other.x, this.y * other.y);
  }

  public mulToRef(other: Vector2, ref: Vector2): Vector2 {
    ref.x = this.x * other.x;
    ref.y = this.y * other.y;
    return ref;
  }

  public mulInPlace(other: Vector2): Vector2 {
    return this.mulToRef(other, this);
  }

  public divToNew(other: Vector2): Vector2 {
    return new Vector2(this.x / other.x, this.y / other.y);
  }

  public divToRef(other: Vector2, ref: Vector2): Vector2 {
    ref.x = this.x / other.x;
    ref.y = this.y / other.y;
    return ref;
  }

  public divInPlace(other: Vector2): Vector2 {
    return this.divToRef(other, this);
  }

  // ---- Scale by scalar ----
  public scaleToNew(s: number): Vector2 {
    return new Vector2(this.x * s, this.y * s);
  }

  public scaleToRef(s: number, ref: Vector2): Vector2 {
    ref.x = this.x * s;
    ref.y = this.y * s;
    return ref;
  }

  public scaleInPlace(s: number): Vector2 {
    return this.scaleToRef(s, this);
  }

  // ---- Negate / Abs ----
  public negateToNew(): Vector2 {
    return new Vector2(-this.x, -this.y);
  }

  public negateToRef(ref: Vector2): Vector2 {
    ref.x = -this.x;
    ref.y = -this.y;
    return ref;
  }

  public negateInPlace(): Vector2 {
    return this.negateToRef(this);
  }

  public absToNew(): Vector2 {
    return new Vector2(Math.abs(this.x), Math.abs(this.y));
  }

  public absToRef(ref: Vector2): Vector2 {
    ref.x = Math.abs(this.x);
    ref.y = Math.abs(this.y);
    return ref;
  }

  public absInPlace(): Vector2 {
    return this.absToRef(this);
  }

  // ---- Min/Max/Clamp (component-wise) ----
  public minToRef(other: Vector2, ref: Vector2): Vector2 {
    ref.x = Math.min(this.x, other.x);
    ref.y = Math.min(this.y, other.y);
    return ref;
  }

  public minInPlace(other: Vector2): Vector2 {
    return this.minToRef(other, this);
  }

  public maxToRef(other: Vector2, ref: Vector2): Vector2 {
    ref.x = Math.max(this.x, other.x);
    ref.y = Math.max(this.y, other.y);
    return ref;
  }

  public maxInPlace(other: Vector2): Vector2 {
    return this.maxToRef(other, this);
  }

  public clampToRef(min: Vector2, max: Vector2, ref: Vector2): Vector2 {
    ref.x = MathOps.clamp(this.x, min.x, max.x);
    ref.y = MathOps.clamp(this.y, min.y, max.y);
    return ref;
  }

  public clampInPlace(min: Vector2, max: Vector2): Vector2 {
    return this.clampToRef(min, max, this);
  }

  public clampToNew(min: Vector2, max: Vector2): Vector2 {
    return this.clampToRef(min, max, new Vector2());
  }

  // ---- Metrics ----
  public lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  public length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  public distanceSquaredTo(other: Vector2): number {
    const dx = this.x - other.x,
      dy = this.y - other.y;
    return dx * dx + dy * dy;
  }

  public distanceTo(other: Vector2): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  // ---- Dot/Cross ----
  public dot(other: Vector2): number {
    return this.x * other.x + this.y * other.y;
  }

  // 2D cross-product Z component (this x other)
  public crossZ(other: Vector2): number {
    return this.x * other.y - this.y * other.x;
  }

  // ---- Normalization ----
  public normalizeToRef(ref: Vector2): Vector2 {
    const lsq = this.lengthSquared();
    if (lsq > Vector2.EPSILON) {
      const invLen = 1 / Math.sqrt(lsq);
      ref.x = this.x * invLen;
      ref.y = this.y * invLen;
      return ref;
    } else {
      ref.x = 0;
      ref.y = 0;
      return ref;
    }
  }

  public normalizeInPlace(): Vector2 {
    return this.normalizeToRef(this);
  }

  public normalizedToNew(): Vector2 {
    return this.normalizeToRef(new Vector2());
  }

  // ---- Angles & rotation (radians) ----
  /** Angle from +X axis in range (-PI, PI] */
  public angle(): number {
    return MathOps.atan2(this.y, this.x);
  }

  /** Smallest signed angle from this to other in range (-PI, PI] */
  public angleTo(other: Vector2): number {
    const a = MathOps.atan2(this.y, this.x);
    const b = MathOps.atan2(other.y, other.x);
    return MathOps.normalizeAngle(b - a);
  }

  /** Rotate by angle around origin */
  public rotateInPlace(angle: number): Vector2 {
    const c = MathOps.cos(angle),
      s = MathOps.sin(angle);
    const x = this.x,
      y = this.y;
    this.x = x * c - y * s;
    this.y = x * s + y * c;
    return this;
  }

  public rotateToRef(angle: number, ref: Vector2): Vector2 {
    const c = MathOps.cos(angle),
      s = MathOps.sin(angle);
    const x = this.x,
      y = this.y;
    ref.x = x * c - y * s;
    ref.y = x * s + y * c;
    return ref;
  }

  public rotatedToNew(angle: number): Vector2 {
    return this.rotateToRef(angle, new Vector2());
  }

  /** Rotate around pivot by angle */
  public rotateAroundInPlace(pivot: Vector2, angle: number): Vector2 {
    const px = this.x - pivot.x,
      py = this.y - pivot.y;
    const c = MathOps.cos(angle),
      s = MathOps.sin(angle);
    this.x = px * c - py * s + pivot.x;
    this.y = px * s + py * c + pivot.y;
    return this;
  }

  public rotateAroundToRef(
    pivot: Vector2,
    angle: number,
    ref: Vector2
  ): Vector2 {
    const px = this.x - pivot.x,
      py = this.y - pivot.y;
    const c = MathOps.cos(angle),
      s = MathOps.sin(angle);
    ref.x = px * c - py * s + pivot.x;
    ref.y = px * s + py * c + pivot.y;
    return ref;
  }

  public rotatedAroundToNew(pivot: Vector2, angle: number): Vector2 {
    return this.rotateAroundToRef(pivot, angle, new Vector2());
  }

  /** Rotate this vector towards target by at most maxDelta radians (shortest path). */
  public rotateTowardsInPlace(target: Vector2, maxDelta: number): Vector2 {
    const a = this.angle();
    const b = target.angle();
    const next = MathOps.smoothRotate(a, b, maxDelta);
    const len = this.length();
    const c = MathOps.cos(next),
      s = MathOps.sin(next);
    this.x = c * len;
    this.y = s * len;
    return this;
  }

  // ---- Projection / Reflection ----
  /** Project this onto normal (not necessarily unit). */
  public projectOntoToRef(normal: Vector2, ref: Vector2): Vector2 {
    const nlsq = normal.lengthSquared();
    if (nlsq <= Vector2.EPSILON) {
      ref.x = 0;
      ref.y = 0;
      return ref;
    }
    const scale = (this.x * normal.x + this.y * normal.y) / nlsq;
    ref.x = normal.x * scale;
    ref.y = normal.y * scale;
    return ref;
  }

  public projectOntoInPlace(normal: Vector2): Vector2 {
    return this.projectOntoToRef(normal, this);
  }

  public projectOntoToNew(normal: Vector2): Vector2 {
    return this.projectOntoToRef(normal, new Vector2());
  }

  /** Reflect this across a normal (assumed normalized for best results). */
  public reflectToRef(normal: Vector2, ref: Vector2): Vector2 {
    const d = this.dot(normal) * 2;
    ref.x = this.x - d * normal.x;
    ref.y = this.y - d * normal.y;
    return ref;
  }

  public reflectInPlace(normal: Vector2): Vector2 {
    return this.reflectToRef(normal, this);
  }

  public reflectToNew(normal: Vector2): Vector2 {
    return this.reflectToRef(normal, new Vector2());
  }

  // ---- Lerp / Nlerp ----
  public lerpToRef(to: Vector2, t: number, ref: Vector2): Vector2 {
    ref.x = MathOps.lerp(this.x, to.x, t);
    ref.y = MathOps.lerp(this.y, to.y, t);
    return ref;
  }

  public lerpInPlace(to: Vector2, t: number): Vector2 {
    return this.lerpToRef(to, t, this);
  }

  public lerpToNew(to: Vector2, t: number): Vector2 {
    return this.lerpToRef(to, t, new Vector2());
  }

  /** Normalized linear interpolation (useful for directions). */
  public nlerpToRef(to: Vector2, t: number, ref: Vector2): Vector2 {
    this.lerpToRef(to, t, ref);
    return ref.normalizeInPlace();
  }

  public nlerpInPlace(to: Vector2, t: number): Vector2 {
    return this.nlerpToRef(to, t, this);
  }

  public nlerpToNew(to: Vector2, t: number): Vector2 {
    return this.nlerpToRef(to, t, new Vector2());
  }

  // ---- Perpendiculars ----
  /** Left-hand perpendicular (rotate +90°). */
  public perpLeftToRef(ref: Vector2): Vector2 {
    const x = -this.y;
    ref.y = this.x;
    ref.x = x;
    return ref;
  }

  public perpLeftInPlace(): Vector2 {
    return this.perpLeftToRef(this);
  }

  public perpLeftToNew(): Vector2 {
    return this.perpLeftToRef(new Vector2());
  }

  /** Right-hand perpendicular (rotate -90°). */
  public perpRightToRef(ref: Vector2): Vector2 {
    const y = -this.x;
    ref.x = this.y;
    ref.y = y;
    return ref;
  }

  public perpRightInPlace(): Vector2 {
    return this.perpRightToRef(this);
  }

  public perpRightToNew(): Vector2 {
    return this.perpRightToRef(new Vector2());
  }

  // ---- Length clamping ----
  public clampLengthInPlace(minLen: number, maxLen: number): Vector2 {
    const lenSq = this.lengthSquared();
    if (lenSq < minLen * minLen) {
      const len = Math.sqrt(lenSq);
      if (len > Vector2.EPSILON) {
        this.scaleInPlace(minLen / len);
      } else {
        this.setInPlace(minLen, 0);
      }
    } else if (lenSq > maxLen * maxLen) {
      const len = Math.sqrt(lenSq);
      this.scaleInPlace(maxLen / (len > Vector2.EPSILON ? len : 1));
    }
    return this;
  }

  public clampLengthToRef(
    minLen: number,
    maxLen: number,
    ref: Vector2
  ): Vector2 {
    ref.copyFrom(this);
    return ref.clampLengthInPlace(minLen, maxLen);
  }

  public clampLengthToNew(minLen: number, maxLen: number): Vector2 {
    return this.clampLengthToRef(minLen, maxLen, new Vector2());
  }

  // ---- Equality ----
  public equals(other: Vector2): boolean {
    return this.x === other.x && this.y === other.y;
  }

  public approxEquals(other: Vector2, eps = Vector2.EPSILON): boolean {
    return (
      Math.abs(this.x - other.x) <= eps && Math.abs(this.y - other.y) <= eps
    );
  }

  // ---- Serialization ----
  public toArray(out: number[] = [], offset = 0): number[] {
    out[offset] = this.x;
    out[offset + 1] = this.y;
    return out;
  }

  public static fromArray(arr: ArrayLike<number>, offset = 0): Vector2 {
    return new Vector2(arr[offset], arr[offset + 1]);
  }

  public static fromArrayToRef(
    arr: ArrayLike<number>,
    ref: Vector2,
    offset = 0
  ): Vector2 {
    ref.x = arr[offset];
    ref.y = arr[offset + 1];
    return ref;
  }

  // ---- Construction helpers ----
  public static fromAngle(angle: number, length = 1): Vector2 {
    return new Vector2(
      MathOps.cos(angle) * length,
      MathOps.sin(angle) * length
    );
  }

  public static fromAngleToRef(
    angle: number,
    ref: Vector2,
    length = 1
  ): Vector2 {
    ref.x = MathOps.cos(angle) * length;
    ref.y = MathOps.sin(angle) * length;
    return ref;
  }

  public static minToRef(a: Vector2, b: Vector2, ref: Vector2): Vector2 {
    ref.x = Math.min(a.x, b.x);
    ref.y = Math.min(a.y, b.y);
    return ref;
  }

  public static maxToRef(a: Vector2, b: Vector2, ref: Vector2): Vector2 {
    ref.x = Math.max(a.x, b.x);
    ref.y = Math.max(a.y, b.y);
    return ref;
  }
}
