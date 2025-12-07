const LARGE_DEBT_THRESHOLD_MS = 50;
const MAX_SINGLE_CORRECTION_MS = 5_000;

export class PhaseNudger {
  private _phaseDebtMs = 0;
  private _isActive = false;

  public constructor(
    private readonly _frameLength: number,
    private readonly _maxNudgePerFrame: number,
  ) {}

  public get isActive(): boolean {
    return this._isActive;
  }

  public get currentDebtMs(): number {
    return this._phaseDebtMs;
  }

  /**
   * Activates the nudger. Call this when ClockSync becomes ready.
   */
  public activate(): void {
    this._isActive = true;
    console.log('[PhaseNudger] Activated');
  }

  /**
   * Call on every server tick hint (after ClockSync is ready).
   */
  public onServerTickHint(serverTick: number, localTick: number): void {
    if (!this._isActive) {
      return;
    }

    const dTicks = (serverTick - localTick) | 0;
    const correctionMs = dTicks * this._frameLength;

    // Reject unreasonably large corrections (likely bad data)
    if (Math.abs(correctionMs) > MAX_SINGLE_CORRECTION_MS) {
      console.warn(
        `[PhaseNudger] Rejected large correction: ${correctionMs.toFixed(0)}ms ` +
        `(${dTicks} ticks)`
      );
      return;
    }

    // Accumulate (not replace) - smooth out fluctuations
    // Using weighted accumulation to prevent oscillation
    const weight = 0.3;
    this._phaseDebtMs = this._phaseDebtMs * (1 - weight) + correctionMs * weight;

    // console.log(
    //   `[PhaseNudger] Hint: ${dTicks} ticks, ` +
    //   `debt: ${this._phaseDebtMs.toFixed(1)}ms`
    // );
  }

  /**
   * Resets debt to zero. Use when doing hard time sync.
   */
  public reset(): void {
    this._phaseDebtMs = 0;
  }

  /**
   * Drain a small portion of phase debt each frame.
   * @returns milliseconds to add to accumulatedTime
   */
  public drain(): number {
    if (!this._isActive || this._phaseDebtMs === 0) {
      return 0;
    }

    const absDebt = Math.abs(this._phaseDebtMs);

    // For large debt: drain faster but still limited
    // For small debt: drain slowly for smoothness
    let drainAmount: number;

    if (absDebt >= LARGE_DEBT_THRESHOLD_MS) {
      // Drain up to 50% of large debt per frame, but not more than frameLength
      drainAmount = Math.min(absDebt * 0.5, this._frameLength);
    } else {
      // Drain small amounts gradually
      drainAmount = Math.min(absDebt, this._maxNudgePerFrame);
    }

    drainAmount *= Math.sign(this._phaseDebtMs);
    this._phaseDebtMs -= drainAmount;

    // Snap to zero if very small
    if (Math.abs(this._phaseDebtMs) < 0.1) {
      this._phaseDebtMs = 0;
    }

    return drainAmount;
  }
}
