import { InferBinarySchemaValues } from '@lagless/binary';
import { PongStruct } from './protocol.js';

export class ClockSync {
  private _targetThetaMs = 0; // целевая поправка (ms)
  private _rttEwmaMs = 0;
  private _jitterEwmaMs = 0;

  public get rttEwmaMs(): number { return this._rttEwmaMs; }
  public get jitterEwmaMs(): number { return this._jitterEwmaMs; }

  public updateFromPong(
    nowMs: number,
    pong: InferBinarySchemaValues<typeof PongStruct>,
    alpha = 0.2,
    beta = 0.2,
  ): void {
    // RTT (client estimate)
    const rttMs = nowMs - pong.cSend;
    // offset θ ~ ((sRecv + sSend)/2 - now)
    const theta = ((pong.sRecv + pong.sSend) * 0.5) - nowMs;

    // EWMA RTT + Jitter
    const prevRtt = this._rttEwmaMs;
    this._rttEwmaMs = (1 - alpha) * this._rttEwmaMs + alpha * rttMs;
    const dev = Math.abs(rttMs - (prevRtt || rttMs));
    this._jitterEwmaMs = (1 - beta) * this._jitterEwmaMs + beta * dev;

    // целевая поправка (резкие скачки — в target; фактическая — через slew)
    this._targetThetaMs = theta;

    console.log(`[ClockSync] Pong received. RTT: ${rttMs.toFixed(2)} ms (EWMA: ${this._rttEwmaMs.toFixed(2)} ms), Jitter EWMA: ${this._jitterEwmaMs.toFixed(2)} ms, Theta: ${theta.toFixed(2)} ms, TargetTheta: ${this._targetThetaMs.toFixed(2)} ms`);
  }
}
