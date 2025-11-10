import { InferBinarySchemaValues } from '@lagless/binary';
import { PongStruct } from './protocol.js';

export class ClockSync {
  private _rttEwmaMs = 0;
  private _jitterEwmaMs = 0;
  private _thetaMs = 0; // текущая поправка (ms)

  public get rttEwmaMs(): number {
    return this._rttEwmaMs;
  }

  public get jitterEwmaMs(): number {
    return this._jitterEwmaMs;
  }

  public get thetaMs(): number {
    return this._thetaMs;
  }

  public serverNowMs(localNowMs: number): number {
    return localNowMs + this._thetaMs;
  }

  public updateFromPong(
    nowMs: number, // cRecv
    pong: InferBinarySchemaValues<typeof PongStruct>,
    alpha = 0.2,
    beta = 0.2
  ): void {
    const cSend = pong.cSend;
    const sRecv = pong.sRecv;
    const sSend = pong.sSend;
    const cRecv = nowMs;

    // NTP-style RTT and offset (both epoch-safe)
    const serverProcMs = Math.max(0, sSend - sRecv);
    const rttMs = Math.max(0, cRecv - cSend - serverProcMs);
    const thetaMs = 0.5 * (sRecv - cSend + (sSend - cRecv));

    // EWMA RTT + Jitter on NTP RTT
    const prevRtt = this._rttEwmaMs || rttMs;
    this._rttEwmaMs = (1 - alpha) * this._rttEwmaMs + alpha * rttMs;
    const dev = Math.abs(rttMs - prevRtt);
    this._jitterEwmaMs = (1 - beta) * this._jitterEwmaMs + beta * dev;

    this._thetaMs = thetaMs; // snap; if you later want smoothing, move toward target in a slewStep

//     console.log(`[ClockSync]
// Pong RTT(ntp)=${rttMs.toFixed(2)}ms
// JitterEWMA=${this._jitterEwmaMs.toFixed(2)}ms
// Theta=${thetaMs.toFixed(2)}ms (serverProc=${serverProcMs.toFixed(2)}ms)
// `
//     );
  }
}
