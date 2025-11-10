export class InputDelayController {
  private _deltaTicks: number;

  public constructor(
    private readonly _minTicks = 1,
    private readonly _maxTicks = 8,
    initial = 2,
  ) {
    this._deltaTicks = Math.max(this._minTicks, Math.min(initial, this._maxTicks));
  }

  public get deltaTicks() {
    return this._deltaTicks;
  }

  /**
   *   Δ = ceil( (RTT_EWMA/2 + k*JITTER_EWMA + SAFETY_ms) / TICK_ms )
   */
  public recompute(
    tickMs: number,
    rttEwmaMs: number,
    jitterEwmaMs: number,
    k = 1.8,
    safetyMs = 3,
  ): number {
    const prevDelta = this._deltaTicks;
    const needMs = rttEwmaMs * 0.5 + k * jitterEwmaMs + safetyMs;
    const want = Math.ceil(needMs / tickMs);

    // Hysteresis: up - fast, down - slow (minus 1 per step)
    if (want > this._deltaTicks) this._deltaTicks = want;
    else if (want < this._deltaTicks) this._deltaTicks = Math.max(want, this._deltaTicks - 1);

    this._deltaTicks = Math.max(this._minTicks, Math.min(this._deltaTicks, this._maxTicks));

    if (this._deltaTicks !== prevDelta) {
      console.log(
        `[InputDelayController] Recomputed deltaTicks: ${prevDelta} -> ${
          this._deltaTicks
        } (want: ${want}, needMs: ${needMs.toFixed(2)} ms, RTT_EWMA: ${rttEwmaMs.toFixed(
          2
        )} ms, JITTER_EWMA: ${jitterEwmaMs.toFixed(2)} ms)`
      );
    }

    return this._deltaTicks;
  }
}
