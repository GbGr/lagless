const LARGE_DEBT_THRESHOLD_MS = 50;

export class PhaseNudger {
  private _phaseDebtMs = 0;

  public constructor(
    private readonly _frameLength: number,
    private readonly _maxNudgePerFrame: number,
  ) {}

  /** Call on every server tick hint (Fanout.serverTick or Pong.sTick). */
  public onServerTickHint(serverTick: number, localTick: number): void {
    const dTicks = (serverTick - localTick) | 0; // integer difference
    this._phaseDebtMs += dTicks * this._frameLength;
    // console.log(`PhaseNudger onServerTickHint: ${dTicks} ticks, adding ${dTicks * this._frameLength}ms debt, total debt: ${this._phaseDebtMs}ms`);
  }

  /** Drain a small portion of phase debt each frame; return ms to add to accumulatedTime. */
  public drain(): number {
    if (this._phaseDebtMs === 0) return 0;
    const absDebt = Math.abs(this._phaseDebtMs);
    const n = absDebt >= LARGE_DEBT_THRESHOLD_MS
      ? this._phaseDebtMs
      : Math.sign(this._phaseDebtMs) * Math.min(absDebt, this._maxNudgePerFrame);
    this._phaseDebtMs -= n;
    // console.log('PhaseNudger drain:', n, 'remaining debt:', this._phaseDebtMs);
    return n;
  }
}
