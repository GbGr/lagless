/**
 * Authoritative server clock for a match room.
 * Provides the canonical tick number based on elapsed wall-clock time.
 */
export class ServerClock {
  private readonly _startedAt: number;
  private readonly _tickMs: number;

  constructor(tickRateHz: number, startedAt = performance.now()) {
    this._tickMs = 1000 / tickRateHz;
    this._startedAt = startedAt;
  }

  public get tickMs(): number {
    return this._tickMs;
  }

  public get tick(): number {
    return Math.floor((performance.now() - this._startedAt) / this._tickMs);
  }

  public get startedAt(): number {
    return this._startedAt;
  }

  public get elapsedMs(): number {
    return performance.now() - this._startedAt;
  }
}
