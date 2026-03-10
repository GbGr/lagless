import type { ECSRunner } from '@lagless/core';
import type { DiagnosticsConfig, TickRecord, RollbackEvent, DiagnosticsStats } from './types.js';

const DEFAULT_BUFFER_SIZE = 18000; // 5 min at 60fps
const DEFAULT_MAX_ROLLBACK_EVENTS = 1000;

export class DiagnosticsCollector {
  private readonly _runner: ECSRunner;
  private readonly _maxPlayers: number;
  private readonly _bufferSize: number;

  // Ring buffer — pre-allocated typed arrays
  private readonly _ticks: Uint32Array;
  private readonly _hashes: Uint32Array;
  private readonly _physicsHashes: Uint32Array;
  private readonly _velocityHashes: Uint32Array;
  private readonly _verifiedTicks: Int32Array;
  private readonly _wasRollback: Uint8Array;
  private readonly _inputCounts: Uint8Array; // [bufferSize * maxPlayers]

  private readonly _physicsHashFn: (() => number) | null;
  private readonly _velocityHashFn: (() => number) | null;

  private _head = 0;      // next write index
  private _count = 0;     // number of valid entries

  // Rollback events ring buffer
  private readonly _maxRollbackEvents: number;
  private readonly _rollbackEvents: RollbackEvent[] = [];
  private _totalRollbacks = 0;
  private _lastRollbackTick = 0;

  // Rollback re-simulation tracking
  private _isResimulating = false;
  private _preRollbackTick = 0;
  private _lastTickSeen = 0;

  // VerifiedTick gap detection
  private _prevVerifiedTick = -1;
  private _verifiedTickGapCount = 0;

  // Handler cleanup
  private _removeTickHandler: (() => void) | null = null;
  private _removeRollbackHandler: (() => void) | null = null;
  private _disposed = false;

  constructor(runner: ECSRunner, config?: DiagnosticsConfig) {
    this._runner = runner;
    this._maxPlayers = runner.Config.maxPlayers;
    this._bufferSize = config?.bufferSize ?? DEFAULT_BUFFER_SIZE;
    this._maxRollbackEvents = config?.maxRollbackEvents ?? DEFAULT_MAX_ROLLBACK_EVENTS;

    this._physicsHashFn = config?.physicsHashFn ?? null;
    this._velocityHashFn = config?.velocityHashFn ?? null;

    this._ticks = new Uint32Array(this._bufferSize);
    this._hashes = new Uint32Array(this._bufferSize);
    this._physicsHashes = new Uint32Array(this._bufferSize);
    this._velocityHashes = new Uint32Array(this._bufferSize);
    this._verifiedTicks = new Int32Array(this._bufferSize);
    this._wasRollback = new Uint8Array(this._bufferSize);
    this._inputCounts = new Uint8Array(this._bufferSize * this._maxPlayers);

    this._removeRollbackHandler = runner.Simulation.addRollbackHandler((tick) => {
      this._onRollback(tick);
    });

    this._removeTickHandler = runner.Simulation.addTickHandler((tick) => {
      this._onTick(tick);
    });
  }

  // ─── Public API ──────────────────────────────────────────

  public get runner(): ECSRunner {
    return this._runner;
  }

  public get bufferSize(): number {
    return this._bufferSize;
  }

  public get count(): number {
    return this._count;
  }

  public getTimeline(): TickRecord[] {
    const result: TickRecord[] = [];
    const start = this._count < this._bufferSize ? 0 : this._head;

    for (let i = 0; i < this._count; i++) {
      const idx = (start + i) % this._bufferSize;
      const slotOffset = idx * this._maxPlayers;
      result.push({
        tick: this._ticks[idx],
        hash: this._hashes[idx],
        physicsHash: this._physicsHashes[idx],
        velocityHash: this._velocityHashes[idx],
        verifiedTick: this._verifiedTicks[idx],
        wasRollback: this._wasRollback[idx] !== 0,
        inputCountBySlot: this._inputCounts.slice(slotOffset, slotOffset + this._maxPlayers),
      });
    }

    return result;
  }

  public getRollbacks(): ReadonlyArray<RollbackEvent> {
    return this._rollbackEvents;
  }

  public getStats(): DiagnosticsStats {
    const oldestIdx = this._count < this._bufferSize ? 0 : this._head;
    const newestIdx = this._count === 0 ? 0 : (this._head - 1 + this._bufferSize) % this._bufferSize;

    return {
      ticksRecorded: this._count,
      totalRollbacks: this._totalRollbacks,
      lastRollbackTick: this._lastRollbackTick,
      verifiedTickGapCount: this._verifiedTickGapCount,
      latestHash: this._count > 0 ? this._hashes[newestIdx] : 0,
      latestPhysicsHash: this._count > 0 ? this._physicsHashes[newestIdx] : 0,
      latestVelocityHash: this._count > 0 ? this._velocityHashes[newestIdx] : 0,
      oldestTick: this._count > 0 ? this._ticks[oldestIdx] : 0,
      newestTick: this._count > 0 ? this._ticks[newestIdx] : 0,
    };
  }

  public dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._removeTickHandler?.();
    this._removeRollbackHandler?.();
    this._removeTickHandler = null;
    this._removeRollbackHandler = null;
  }

  // ─── Private handlers ────────────────────────────────────

  private _onRollback(tick: number): void {
    // Use _lastTickSeen (tracked in _onTick) because Simulation.tick is already
    // restored to the rollback target when the rollback handler fires.
    this._preRollbackTick = this._lastTickSeen;
    this._isResimulating = true;
    this._totalRollbacks++;
    this._lastRollbackTick = tick;

    const event: RollbackEvent = {
      atSimTick: this._preRollbackTick,
      rollbackToTick: tick,
      timestamp: performance.now(),
    };

    if (this._rollbackEvents.length >= this._maxRollbackEvents) {
      this._rollbackEvents.shift();
    }
    this._rollbackEvents.push(event);
  }

  private _onTick(tick: number): void {
    if (this._isResimulating && tick > this._preRollbackTick) {
      this._isResimulating = false;
    }

    const sim = this._runner.Simulation;
    const provider = this._runner.InputProviderInstance;

    // Get hash — prefer hashHistory (already computed), fall back to direct computation
    let hash = sim.getHashAtTick(tick);
    if (hash === undefined) {
      hash = sim.mem.getHash();
    }

    // Get verifiedTick
    const verifiedTick = provider.verifiedTick;

    // Detect verifiedTick gaps (jumps of >1 between consecutive records)
    if (this._prevVerifiedTick >= 0 && verifiedTick > this._prevVerifiedTick + 1) {
      this._verifiedTickGapCount++;
    }
    this._prevVerifiedTick = verifiedTick;

    // Count inputs per slot at this tick
    const rpcs = provider.rpcHistory.getRPCsAtTick(tick);
    const slotOffset = this._head * this._maxPlayers;

    // Zero the slot region
    this._inputCounts.fill(0, slotOffset, slotOffset + this._maxPlayers);
    for (const rpc of rpcs) {
      if (rpc.meta.playerSlot < this._maxPlayers) {
        this._inputCounts[slotOffset + rpc.meta.playerSlot]++;
      }
    }

    // Write to ring buffer
    this._ticks[this._head] = tick;
    this._hashes[this._head] = hash;
    this._physicsHashes[this._head] = this._physicsHashFn ? this._physicsHashFn() : 0;
    this._velocityHashes[this._head] = this._velocityHashFn ? this._velocityHashFn() : 0;
    this._verifiedTicks[this._head] = verifiedTick;
    this._wasRollback[this._head] = this._isResimulating ? 1 : 0;

    this._head = (this._head + 1) % this._bufferSize;
    if (this._count < this._bufferSize) {
      this._count++;
    }

    this._lastTickSeen = tick;
  }
}
