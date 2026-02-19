export interface LatencySimulatorConfig {
  delayMs: number;
  jitterMs: number;
  packetLossPercent: number;
}

/**
 * Wraps callbacks with artificial delay, jitter, and packet loss.
 * Used for testing network adaptation under poor conditions.
 */
export class LatencySimulator {
  private _delayMs: number;
  private _jitterMs: number;
  private _packetLossPercent: number;

  constructor(config: LatencySimulatorConfig) {
    this._delayMs = config.delayMs;
    this._jitterMs = config.jitterMs;
    this._packetLossPercent = config.packetLossPercent;
  }

  /** Wraps a callback with artificial delay; drops it on simulated packet loss. */
  apply(fn: () => void): void {
    // Simulate packet loss
    if (this._packetLossPercent > 0 && Math.random() * 100 < this._packetLossPercent) {
      return;
    }

    const jitter = this._jitterMs > 0
      ? (Math.random() * 2 - 1) * this._jitterMs
      : 0;
    const delay = Math.max(0, this._delayMs + jitter);

    if (delay === 0) {
      fn();
    } else {
      setTimeout(fn, delay);
    }
  }

  setDelay(ms: number): void {
    this._delayMs = Math.max(0, ms);
  }

  setJitter(ms: number): void {
    this._jitterMs = Math.max(0, ms);
  }

  setPacketLoss(percent: number): void {
    this._packetLossPercent = Math.max(0, Math.min(100, percent));
  }

  get config(): LatencySimulatorConfig {
    return {
      delayMs: this._delayMs,
      jitterMs: this._jitterMs,
      packetLossPercent: this._packetLossPercent,
    };
  }
}
