export interface VisualSmoother2dOptions {
  /**
   * Distance threshold (px) to detect a rollback-induced position jump.
   * Jumps below this are treated as normal movement.
   * Default: 10
   */
  positionJumpThreshold?: number;

  /**
   * Rotation threshold (radians) to detect a rollback-induced rotation jump.
   * Default: PI / 4
   */
  rotationJumpThreshold?: number;

  /**
   * Half-life of offset decay in ms. Controls how fast the visual offset
   * converges to the true simulation position.
   * Lower = snappier, higher = smoother.
   * Default: 200
   */
  smoothingHalfLifeMs?: number;

  /**
   * Position jumps larger than this snap instantly (teleport/respawn).
   * Default: Infinity (never snap)
   */
  teleportThreshold?: number;
}

/**
 * Handles both sim↔render interpolation and rollback lag smoothing in one place.
 *
 * Takes raw ECS prev/current values + interpolationFactor, outputs smoothed render position.
 * Normal operation: pure linear interpolation, zero added latency.
 * After rollback: absorbs the jump into an offset that decays exponentially.
 *
 * Usage:
 * ```ts
 * const smoother = new VisualSmoother2d();
 *
 * // each render frame:
 * smoother.update(
 *   transform2d.unsafe.prevPositionX[entity],
 *   transform2d.unsafe.prevPositionY[entity],
 *   transform2d.unsafe.positionX[entity],
 *   transform2d.unsafe.positionY[entity],
 *   transform2d.unsafe.prevRotation[entity],
 *   transform2d.unsafe.rotation[entity],
 *   simulation.interpolationFactor,
 * );
 * container.x = smoother.x;
 * container.y = smoother.y;
 * container.rotation = smoother.rotation;
 * ```
 */
export class VisualSmoother2d {
  /** Smoothed X position (read after update). */
  public x = 0;
  /** Smoothed Y position (read after update). */
  public y = 0;
  /** Smoothed rotation (read after update). */
  public rotation = 0;

  /** Whether there is a non-zero offset being smoothed right now. */
  public get isSmoothing(): boolean {
    return this._offsetX !== 0 || this._offsetY !== 0 || this._offsetRotation !== 0;
  }

  private _offsetX = 0;
  private _offsetY = 0;
  private _offsetRotation = 0;

  private _lastSimX = 0;
  private _lastSimY = 0;
  private _lastSimRotation = 0;

  private _initialized = false;
  private _lastTime = 0;

  private readonly _posJumpThreshSq: number;
  private readonly _rotJumpThresh: number;
  private readonly _halfLifeMs: number;
  private readonly _teleportThreshSq: number;

  constructor(options?: VisualSmoother2dOptions) {
    const posThresh = options?.positionJumpThreshold ?? 10;
    this._posJumpThreshSq = posThresh * posThresh;
    this._rotJumpThresh = options?.rotationJumpThreshold ?? Math.PI / 4;
    this._halfLifeMs = options?.smoothingHalfLifeMs ?? 200;
    const teleport = options?.teleportThreshold ?? Infinity;
    this._teleportThreshSq = teleport * teleport;
  }

  /**
   * Feed raw ECS transform data. Call once per render frame.
   * Read `x`, `y`, `rotation` after calling.
   */
  public update(
    prevPositionX: number,
    prevPositionY: number,
    positionX: number,
    positionY: number,
    prevRotation: number,
    rotation: number,
    interpolationFactor: number,
  ): void {
    const now = performance.now();
    const dt = this._lastTime > 0 ? now - this._lastTime : 0;
    this._lastTime = now;

    // --- Step 1: sim interpolation ---
    const simX = prevPositionX + (positionX - prevPositionX) * interpolationFactor;
    const simY = prevPositionY + (positionY - prevPositionY) * interpolationFactor;
    const simRotation = lerpAngle(prevRotation, rotation, interpolationFactor);

    if (!this._initialized) {
      this._initialized = true;
      this.x = this._lastSimX = simX;
      this.y = this._lastSimY = simY;
      this.rotation = this._lastSimRotation = simRotation;
      return;
    }

    // --- Step 2: detect position jump ---
    const dx = simX - this._lastSimX;
    const dy = simY - this._lastSimY;
    const distSq = dx * dx + dy * dy;

    if (distSq >= this._teleportThreshSq) {
      // Intentional teleport — snap, reset offset
      this._offsetX = 0;
      this._offsetY = 0;
    } else if (distSq >= this._posJumpThreshSq) {
      // Rollback jump — absorb into offset so rendered pos stays put
      this._offsetX -= dx;
      this._offsetY -= dy;
    }

    // --- Step 3: detect rotation jump ---
    const dRot = shortestAngleDiff(this._lastSimRotation, simRotation);
    if (Math.abs(dRot) >= this._rotJumpThresh) {
      this._offsetRotation -= dRot;
    }

    // --- Step 4: decay offset (frame-rate independent) ---
    if (dt > 0 && (this._offsetX !== 0 || this._offsetY !== 0 || this._offsetRotation !== 0)) {
      const decay = Math.pow(0.5, dt / this._halfLifeMs);
      this._offsetX *= decay;
      this._offsetY *= decay;
      this._offsetRotation *= decay;

      // Snap to zero when negligible
      if (this._offsetX * this._offsetX + this._offsetY * this._offsetY < 0.01) {
        this._offsetX = 0;
        this._offsetY = 0;
      }
      if (Math.abs(this._offsetRotation) < 0.001) {
        this._offsetRotation = 0;
      }
    }

    // --- Step 5: output ---
    this.x = simX + this._offsetX;
    this.y = simY + this._offsetY;
    this.rotation = simRotation + this._offsetRotation;

    // Store raw sim for next-frame jump detection
    this._lastSimX = simX;
    this._lastSimY = simY;
    this._lastSimRotation = simRotation;
  }

  /** Reset all state. Use when switching entities or reinitializing. */
  public reset(): void {
    this._initialized = false;
    this._offsetX = 0;
    this._offsetY = 0;
    this._offsetRotation = 0;
    this._lastTime = 0;
  }
}

/** Shortest signed angle difference from `from` to `to`, result in (-PI, PI]. */
function shortestAngleDiff(from: number, to: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

/** Interpolate angle along shortest path. */
function lerpAngle(a: number, b: number, t: number): number {
  return a + shortestAngleDiff(a, b) * t;
}
