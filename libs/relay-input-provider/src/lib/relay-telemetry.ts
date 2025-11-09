// RelayTelemetry.ts
export type TelemetryHistory = Readonly<{
  readonly rtt: readonly number[];
  readonly jitter: readonly number[];
  readonly delta: readonly number[];
  readonly backlog: readonly number[];
}>;

export type RelayTelemetrySnapshot = Readonly<{
  readonly now: number;
  readonly rttMs: number | null;
  readonly jitterMs: number | null;
  readonly deltaTicks: number | null;
  readonly localTick: number | null;
  readonly serverTickHint: number | null;
  readonly targetTick: number | null;
  readonly backlogTicks: number | null;
  readonly sentInputs: number;
  readonly sentHeartbeats: number;
  readonly fanoutBatches: number;
  readonly cancelInputs: number;
  readonly rollbacks: number;
  readonly lastSendAt: number;
  readonly lastRecvAt: number;
  readonly history: TelemetryHistory;
}>;

export class RelayTelemetry {
  private readonly _cap: number;
  private readonly _hist = {
    rtt: [] as number[],
    jitter: [] as number[],
    delta: [] as number[],
    backlog: [] as number[],
  };
  private _sentInputs = 0;
  private _sentHeartbeats = 0;
  private _fanoutBatches = 0;
  private _cancelInputs = 0;
  private _rollbacks = 0;
  private _lastSendAt = 0;
  private _lastRecvAt = 0;

  private _rttMs: number | null = null;
  private _jitterMs: number | null = null;
  private _deltaTicks: number | null = null;
  private _localTick: number | null = null;
  private _serverTickHint: number | null = null;
  private _targetTick: number | null = null;
  private _backlogTicks: number | null = null;

  public constructor(historyCapacity = 180) {
    this._cap = historyCapacity;
  }

  // ---- pushes (internal helpers) ----
  private _push(arr: number[], v: number): void {
    arr.push(v);
    if (arr.length > this._cap) arr.shift();
  }

  // ---- public update API ----
  public onPong(rttMs: number, jitterMs: number): void {
    this._rttMs = rttMs;
    this._jitterMs = jitterMs;
    this._push(this._hist.rtt, rttMs);
    this._push(this._hist.jitter, jitterMs);
    this._lastRecvAt = performance.now();
  }

  public onDelta(deltaTicks: number): void {
    this._deltaTicks = deltaTicks;
    this._push(this._hist.delta, deltaTicks);
  }

  public onState(localTick: number, serverTickHint: number | null, targetTick: number | null): void {
    this._localTick = localTick;
    this._serverTickHint = serverTickHint;
    this._targetTick = targetTick;
    this._backlogTicks = serverTickHint != null ? serverTickHint - localTick : null;
    if (this._backlogTicks != null) this._push(this._hist.backlog, this._backlogTicks);
  }

  public onSend(inputOrHeartbeat: 'input' | 'heartbeat'): void {
    if (inputOrHeartbeat === 'input') this._sentInputs++;
    else this._sentHeartbeats++;
    this._lastSendAt = performance.now();
  }

  public onFanout(batchCount: number): void {
    this._fanoutBatches += Math.max(1, batchCount);
    this._lastRecvAt = performance.now();
  }

  public onCancel(): void {
    this._cancelInputs++;
  }

  public onRollback(): void {
    this._rollbacks++;
  }

  // ---- read snapshot ----
  public snapshot(): RelayTelemetrySnapshot {
    return {
      now: performance.now(),
      rttMs: this._rttMs,
      jitterMs: this._jitterMs,
      deltaTicks: this._deltaTicks,
      localTick: this._localTick,
      serverTickHint: this._serverTickHint,
      targetTick: this._targetTick,
      backlogTicks: this._backlogTicks,
      sentInputs: this._sentInputs,
      sentHeartbeats: this._sentHeartbeats,
      fanoutBatches: this._fanoutBatches,
      cancelInputs: this._cancelInputs,
      rollbacks: this._rollbacks,
      lastSendAt: this._lastSendAt,
      lastRecvAt: this._lastRecvAt,
      history: {
        rtt: this._hist.rtt,
        jitter: this._hist.jitter,
        delta: this._hist.delta,
        backlog: this._hist.backlog,
      },
    };
  }
}
