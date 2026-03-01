import { MathOps } from '@lagless/math';

export interface VisualSmoother3dOptions {
  /** Distance threshold to detect a rollback-induced position jump. Default: 10 */
  positionJumpThreshold?: number;
  /** Quaternion dot threshold to detect a rollback-induced rotation jump. Default: 0.95 */
  rotationJumpThreshold?: number;
  /** Half-life of offset decay in ms. Default: 200 */
  smoothingHalfLifeMs?: number;
  /** Position jumps larger than this snap instantly (teleport/respawn). Default: Infinity */
  teleportThreshold?: number;
}

/**
 * 3D visual smoother — handles sim↔render interpolation and rollback lag smoothing.
 * Position offset: XYZ exponential decay.
 * Rotation offset: quaternion, decays toward identity via slerp.
 */
export class VisualSmoother3d {
  public x = 0;
  public y = 0;
  public z = 0;
  public rotX = 0;
  public rotY = 0;
  public rotZ = 0;
  public rotW = 1;

  public get isSmoothing(): boolean {
    return (
      this._offsetX !== 0 || this._offsetY !== 0 || this._offsetZ !== 0 ||
      this._offsetRotX !== 0 || this._offsetRotY !== 0 || this._offsetRotZ !== 0 || this._offsetRotW !== 1
    );
  }

  private _offsetX = 0;
  private _offsetY = 0;
  private _offsetZ = 0;
  // Rotation offset as quaternion (identity = no offset)
  private _offsetRotX = 0;
  private _offsetRotY = 0;
  private _offsetRotZ = 0;
  private _offsetRotW = 1;

  private _lastSimX = 0;
  private _lastSimY = 0;
  private _lastSimZ = 0;
  private _lastSimRotX = 0;
  private _lastSimRotY = 0;
  private _lastSimRotZ = 0;
  private _lastSimRotW = 1;

  private _initialized = false;
  private _lastTime = 0;

  private readonly _posJumpThreshSq: number;
  private readonly _rotJumpThresh: number;
  private readonly _halfLifeMs: number;
  private readonly _teleportThreshSq: number;

  constructor(options?: VisualSmoother3dOptions) {
    const posThresh = options?.positionJumpThreshold ?? 10;
    this._posJumpThreshSq = posThresh * posThresh;
    this._rotJumpThresh = options?.rotationJumpThreshold ?? 0.95;
    this._halfLifeMs = options?.smoothingHalfLifeMs ?? 200;
    const teleport = options?.teleportThreshold ?? Infinity;
    this._teleportThreshSq = teleport * teleport;
  }

  public update(
    prevPosX: number, prevPosY: number, prevPosZ: number,
    posX: number, posY: number, posZ: number,
    prevRotX: number, prevRotY: number, prevRotZ: number, prevRotW: number,
    rotX: number, rotY: number, rotZ: number, rotW: number,
    interpolationFactor: number,
  ): void {
    const now = performance.now();
    const dt = this._lastTime > 0 ? now - this._lastTime : 0;
    this._lastTime = now;

    // Step 1: sim interpolation
    const simX = prevPosX + (posX - prevPosX) * interpolationFactor;
    const simY = prevPosY + (posY - prevPosY) * interpolationFactor;
    const simZ = prevPosZ + (posZ - prevPosZ) * interpolationFactor;

    // Slerp for rotation
    const simRot = slerpInline(
      prevRotX, prevRotY, prevRotZ, prevRotW,
      rotX, rotY, rotZ, rotW,
      interpolationFactor,
    );

    if (!this._initialized) {
      this._initialized = true;
      this.x = this._lastSimX = simX;
      this.y = this._lastSimY = simY;
      this.z = this._lastSimZ = simZ;
      this.rotX = this._lastSimRotX = simRot.x;
      this.rotY = this._lastSimRotY = simRot.y;
      this.rotZ = this._lastSimRotZ = simRot.z;
      this.rotW = this._lastSimRotW = simRot.w;
      return;
    }

    // Step 2: detect position jump
    const dx = simX - this._lastSimX;
    const dy = simY - this._lastSimY;
    const dz = simZ - this._lastSimZ;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq >= this._teleportThreshSq) {
      this._offsetX = 0;
      this._offsetY = 0;
      this._offsetZ = 0;
    } else if (distSq >= this._posJumpThreshSq) {
      this._offsetX -= dx;
      this._offsetY -= dy;
      this._offsetZ -= dz;
    }

    // Step 3: detect rotation jump (via quaternion dot)
    const rotDot = Math.abs(
      this._lastSimRotX * simRot.x + this._lastSimRotY * simRot.y +
      this._lastSimRotZ * simRot.z + this._lastSimRotW * simRot.w,
    );
    if (rotDot < this._rotJumpThresh) {
      // Compute the delta rotation: delta = simRot * inverse(lastSimRot)
      // Then: offsetRot = inverse(delta) * currentOffsetRot
      // This absorbs the jump so the rendered rotation stays put.
      const invLastW = this._lastSimRotW;
      const invLastX = -this._lastSimRotX;
      const invLastY = -this._lastSimRotY;
      const invLastZ = -this._lastSimRotZ;
      // delta = simRot * inv(lastSimRot) — normalized since both are unit quaternions
      const deltaW = simRot.w * invLastW - simRot.x * invLastX - simRot.y * invLastY - simRot.z * invLastZ;
      const deltaX = simRot.w * invLastX + simRot.x * invLastW + simRot.y * invLastZ - simRot.z * invLastY;
      const deltaY = simRot.w * invLastY - simRot.x * invLastZ + simRot.y * invLastW + simRot.z * invLastX;
      const deltaZ = simRot.w * invLastZ + simRot.x * invLastY - simRot.y * invLastX + simRot.z * invLastW;
      // inv(delta)
      const invDeltaX = -deltaX;
      const invDeltaY = -deltaY;
      const invDeltaZ = -deltaZ;
      const invDeltaW = deltaW;
      // newOffset = inv(delta) * currentOffset
      const oW = this._offsetRotW;
      const oX = this._offsetRotX;
      const oY = this._offsetRotY;
      const oZ = this._offsetRotZ;
      this._offsetRotW = invDeltaW * oW - invDeltaX * oX - invDeltaY * oY - invDeltaZ * oZ;
      this._offsetRotX = invDeltaW * oX + invDeltaX * oW + invDeltaY * oZ - invDeltaZ * oY;
      this._offsetRotY = invDeltaW * oY - invDeltaX * oZ + invDeltaY * oW + invDeltaZ * oX;
      this._offsetRotZ = invDeltaW * oZ + invDeltaX * oY - invDeltaY * oX + invDeltaZ * oW;
    }

    // Step 4: decay offset
    if (dt > 0) {
      const decay = Math.pow(0.5, dt / this._halfLifeMs);

      // Position offset decay
      if (this._offsetX !== 0 || this._offsetY !== 0 || this._offsetZ !== 0) {
        this._offsetX *= decay;
        this._offsetY *= decay;
        this._offsetZ *= decay;
        if (this._offsetX * this._offsetX + this._offsetY * this._offsetY + this._offsetZ * this._offsetZ < 0.01) {
          this._offsetX = 0;
          this._offsetY = 0;
          this._offsetZ = 0;
        }
      }

      // Rotation offset decay: slerp toward identity
      if (this._offsetRotX !== 0 || this._offsetRotY !== 0 || this._offsetRotZ !== 0 || this._offsetRotW !== 1) {
        const r = slerpInline(
          this._offsetRotX, this._offsetRotY, this._offsetRotZ, this._offsetRotW,
          0, 0, 0, 1, // identity
          1 - decay,
        );
        this._offsetRotX = r.x;
        this._offsetRotY = r.y;
        this._offsetRotZ = r.z;
        this._offsetRotW = r.w;
        // Snap to identity when negligible
        if (Math.abs(this._offsetRotW) > 1 - 0.0001 &&
            this._offsetRotX * this._offsetRotX + this._offsetRotY * this._offsetRotY +
            this._offsetRotZ * this._offsetRotZ < 0.0001) {
          this._offsetRotX = 0;
          this._offsetRotY = 0;
          this._offsetRotZ = 0;
          this._offsetRotW = 1;
        }
      }
    }

    // Step 5: output
    this.x = simX + this._offsetX;
    this.y = simY + this._offsetY;
    this.z = simZ + this._offsetZ;

    // Apply rotation offset: output = offset * simRot
    const sw = simRot.w, sx = simRot.x, sy = simRot.y, sz = simRot.z;
    const ow = this._offsetRotW, ox = this._offsetRotX, oy = this._offsetRotY, oz = this._offsetRotZ;
    this.rotW = ow * sw - ox * sx - oy * sy - oz * sz;
    this.rotX = ow * sx + ox * sw + oy * sz - oz * sy;
    this.rotY = ow * sy - ox * sz + oy * sw + oz * sx;
    this.rotZ = ow * sz + ox * sy - oy * sx + oz * sw;

    // Store raw sim for next-frame comparison
    this._lastSimX = simX;
    this._lastSimY = simY;
    this._lastSimZ = simZ;
    this._lastSimRotX = simRot.x;
    this._lastSimRotY = simRot.y;
    this._lastSimRotZ = simRot.z;
    this._lastSimRotW = simRot.w;
  }

  public reset(): void {
    this._initialized = false;
    this._offsetX = 0;
    this._offsetY = 0;
    this._offsetZ = 0;
    this._offsetRotX = 0;
    this._offsetRotY = 0;
    this._offsetRotZ = 0;
    this._offsetRotW = 1;
    this._lastTime = 0;
  }
}

// Reusable slerp result to avoid allocation in hot path
const _slerpResult = { x: 0, y: 0, z: 0, w: 1 };

function slerpInline(
  ax: number, ay: number, az: number, aw: number,
  bx: number, by: number, bz: number, bw: number,
  t: number,
): { x: number; y: number; z: number; w: number } {
  let cosOmega = ax * bx + ay * by + az * bz + aw * bw;
  if (cosOmega < 0) {
    cosOmega = -cosOmega;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let s0: number, s1: number;
  if (cosOmega > 1 - 1e-8) {
    s0 = 1 - t;
    s1 = t;
  } else {
    const sinOmega = MathOps.sqrt(1 - cosOmega * cosOmega);
    const omega = MathOps.atan2(sinOmega, cosOmega);
    const invSin = 1 / sinOmega;
    s0 = MathOps.sin((1 - t) * omega) * invSin;
    s1 = MathOps.sin(t * omega) * invSin;
  }
  _slerpResult.x = s0 * ax + s1 * bx;
  _slerpResult.y = s0 * ay + s1 * by;
  _slerpResult.z = s0 * az + s1 * bz;
  _slerpResult.w = s0 * aw + s1 * bw;
  return _slerpResult;
}
