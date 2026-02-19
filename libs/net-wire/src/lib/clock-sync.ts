import { InferBinarySchemaValues } from '@lagless/binary';
import { createLogger } from '@lagless/misc';
import { PongSchema } from './protocol.js';

const log = createLogger('ClockSync');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EWMA_ALPHA = 0.15;
const WARMUP_SAMPLE_COUNT = 5;
const INITIAL_RTT_MS = 100;
const INITIAL_JITTER_MS = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PongSample {
  readonly rtt: number;
  readonly serverTimeOffset: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ClockSync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maintains network timing statistics with warmup phase.
 *
 * During warmup: collects samples and uses median for initial estimate.
 * After warmup: uses EWMA for smooth tracking.
 */
export class ClockSync {
  // ─────────────────────────────────────────────────────────────────────────
  // Private state
  // ─────────────────────────────────────────────────────────────────────────

  private _rttEwmaMs: number = INITIAL_RTT_MS;
  private _jitterEwmaMs: number = INITIAL_JITTER_MS;
  private _serverTimeOffsetMs = 0;
  private _sampleCount = 0;
  private _isReady = false;

  // Warmup sample buffer
  private readonly _warmupSamples: PongSample[] = [];
  private readonly _warmupSampleCount: number;

  // ─────────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────────

  public constructor(warmupSampleCount: number = WARMUP_SAMPLE_COUNT) {
    this._warmupSampleCount = warmupSampleCount;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public getters
  // ─────────────────────────────────────────────────────────────────────────

  public get rttEwmaMs(): number {
    return this._rttEwmaMs;
  }

  public get jitterEwmaMs(): number {
    return this._jitterEwmaMs;
  }

  public get serverTimeOffsetMs(): number {
    return this._serverTimeOffsetMs;
  }

  public get sampleCount(): number {
    return this._sampleCount;
  }

  /**
   * Returns true when ClockSync has enough data for reliable estimates.
   * Until ready, consumers should NOT use timing data for game-critical decisions.
   */
  public get isReady(): boolean {
    return this._isReady;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Updates timing statistics from a pong response.
   * Returns true if this sample caused the ClockSync to become ready.
   */
  public updateFromPong(
    clientReceiveMs: number,
    pong: InferBinarySchemaValues<typeof PongSchema>,
  ): boolean {
    const rtt = clientReceiveMs - pong.cSend;

    // Sanity check: reject negative or impossibly large RTT
    if (rtt < 0 || rtt > 10000) {
      log.warn(`Invalid RTT ${rtt}ms, skipping sample`);
      return false;
    }

    // Calculate server time offset for this sample
    // offset = serverTime - clientTime
    // At the moment client sent ping, server received it ~RTT/2 later
    const oneWayDelay = rtt / 2;
    const serverTimeOffset = pong.sRecv - (pong.cSend + oneWayDelay);

    const sample: PongSample = { rtt, serverTimeOffset };
    this._sampleCount++;

    // During warmup: collect samples
    if (!this._isReady) {
      return this.processWarmupSample(sample);
    }

    // After warmup: use EWMA
    this.updateEWMA(sample);
    return false;
  }

  /**
   * Converts local client time to estimated server time.
   */
  public serverNowMs(clientNowMs: number): number {
    return clientNowMs + this._serverTimeOffsetMs;
  }

  /**
   * Converts server time to estimated client time.
   */
  public clientNowMs(serverNowMs: number): number {
    return serverNowMs - this._serverTimeOffsetMs;
  }

  public reset(): void {
    this._rttEwmaMs = INITIAL_RTT_MS;
    this._jitterEwmaMs = INITIAL_JITTER_MS;
    this._serverTimeOffsetMs = 0;
    this._sampleCount = 0;
    this._isReady = false;
    this._warmupSamples.length = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Warmup processing
  // ─────────────────────────────────────────────────────────────────────────

  private processWarmupSample(sample: PongSample): boolean {
    this._warmupSamples.push(sample);

    if (this._warmupSamples.length < this._warmupSampleCount) {
      return false;
    }

    // Warmup complete: calculate initial estimates using median
    this.finalizeWarmup();
    return true;
  }

  private finalizeWarmup(): void {
    const rtts = this._warmupSamples.map(s => s.rtt);
    const offsets = this._warmupSamples.map(s => s.serverTimeOffset);

    // Use median for robustness against outliers
    this._rttEwmaMs = median(rtts);
    this._serverTimeOffsetMs = median(offsets);

    // Initial jitter estimate from sample variance
    this._jitterEwmaMs = calculateMAD(rtts);

    this._isReady = true;
    this._warmupSamples.length = 0; // Free memory

    log.info(
      `Ready: RTT=${this._rttEwmaMs.toFixed(1)}ms, ` +
      `offset=${this._serverTimeOffsetMs.toFixed(1)}ms, ` +
      `jitter=${this._jitterEwmaMs.toFixed(1)}ms`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: EWMA updates (post-warmup)
  // ─────────────────────────────────────────────────────────────────────────

  private updateEWMA(sample: PongSample): void {
    const prevRtt = this._rttEwmaMs;

    // EWMA for RTT
    this._rttEwmaMs = EWMA_ALPHA * sample.rtt + (1 - EWMA_ALPHA) * this._rttEwmaMs;

    // EWMA for jitter (deviation from previous RTT)
    const jitterSample = Math.abs(sample.rtt - prevRtt);
    this._jitterEwmaMs = EWMA_ALPHA * jitterSample + (1 - EWMA_ALPHA) * this._jitterEwmaMs;

    // EWMA for server time offset
    this._serverTimeOffsetMs =
      EWMA_ALPHA * sample.serverTimeOffset +
      (1 - EWMA_ALPHA) * this._serverTimeOffsetMs;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median Absolute Deviation - robust measure of variability
 */
function calculateMAD(values: number[]): number {
  if (values.length < 2) return 0;

  const med = median(values);
  const deviations = values.map(v => Math.abs(v - med));

  return median(deviations);
}
