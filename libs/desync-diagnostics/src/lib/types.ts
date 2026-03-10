export interface DiagnosticsConfig {
  /** Number of ticks to keep in the ring buffer. Default: 18000 (5 min at 60fps). */
  bufferSize?: number;
  /** Max rollback events to keep. Default: 1000. */
  maxRollbackEvents?: number;
  /** Optional callback that returns a hash of physics state (e.g. Rapier snapshot). Called every tick. */
  physicsHashFn?: () => number;
  /** Optional callback that returns a hash of velocity state (e.g. all body velocities). Called every tick. */
  velocityHashFn?: () => number;
}

export interface TickRecord {
  tick: number;
  hash: number;
  physicsHash: number;
  velocityHash: number;
  verifiedTick: number;
  wasRollback: boolean;
  inputCountBySlot: Uint8Array;
}

export interface RollbackEvent {
  /** Simulation tick when rollback was triggered. */
  atSimTick: number;
  /** Tick we rolled back to. */
  rollbackToTick: number;
  /** Performance.now() timestamp. */
  timestamp: number;
}

export interface DiagnosticsStats {
  ticksRecorded: number;
  totalRollbacks: number;
  lastRollbackTick: number;
  verifiedTickGapCount: number;
  latestHash: number;
  latestPhysicsHash: number;
  latestVelocityHash: number;
  oldestTick: number;
  newestTick: number;
}
