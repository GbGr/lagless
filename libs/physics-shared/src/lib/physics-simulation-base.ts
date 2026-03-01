import { ECSConfig, ECSSimulation, AbstractInputProvider, ECSDeps } from '@lagless/core';
import { SnapshotHistory, createLogger } from '@lagless/misc';

const log = createLogger('PhysicsSimulationBase');

/** Minimal interface for a physics world manager that supports snapshot/restore. */
export interface IPhysicsWorldManagerBase {
  takeSnapshot(): Uint8Array;
  restoreSnapshot(data: Uint8Array): void;
}

export class PhysicsSimulationBase extends ECSSimulation {
  private _rapierSnapshotHistory: SnapshotHistory<Uint8Array>;
  private readonly _initialRapierSnapshot: Uint8Array;

  constructor(
    config: ECSConfig,
    deps: ECSDeps,
    inputProvider: AbstractInputProvider,
    private readonly _physicsWorldManager: IPhysicsWorldManagerBase,
  ) {
    super(config, deps, inputProvider);
    this._rapierSnapshotHistory = new SnapshotHistory<Uint8Array>(config.snapshotHistorySize);
    this._initialRapierSnapshot = this._physicsWorldManager.takeSnapshot();
  }

  protected override saveSnapshot(tick: number): void {
    super.saveSnapshot(tick);
    this._rapierSnapshotHistory.set(tick, this._physicsWorldManager.takeSnapshot());
  }

  protected override rollback(tick: number): void {
    // Rollback ECS state first (calls super which restores ArrayBuffer)
    super.rollback(tick);

    // Rollback Rapier world
    let rapierSnapshot: Uint8Array;
    try {
      rapierSnapshot = this._rapierSnapshotHistory.getNearest(tick);
      log.warn(`Rapier rollback to tick ${tick} succeeded`);
    } catch {
      rapierSnapshot = this._initialRapierSnapshot;
      log.warn(`Rapier rollback to tick ${tick} failed, using initial snapshot`);
    }

    this._physicsWorldManager.restoreSnapshot(rapierSnapshot);
    this._rapierSnapshotHistory.rollback(this.mem.tickManager.tick);
  }

  public override applyExternalState(state: ArrayBuffer, tick: number): void {
    // Reset rapier snapshot history BEFORE super call — super.applyExternalState()
    // calls this.saveSnapshot(tick), which writes to _rapierSnapshotHistory.
    // If we reset after, the old _lastTick causes "Ticks must be non-decreasing".
    this._rapierSnapshotHistory = new SnapshotHistory<Uint8Array>(this._ECSConfig.snapshotHistorySize);
    super.applyExternalState(state, tick);
  }

  /**
   * Apply an external Rapier snapshot (e.g. from late-join state transfer).
   */
  public applyExternalPhysicsState(rapierSnapshot: Uint8Array, tick: number): void {
    log.info(`Applying external physics state at tick ${tick} (${rapierSnapshot.byteLength} bytes)`);
    this._physicsWorldManager.restoreSnapshot(rapierSnapshot);
    this._rapierSnapshotHistory = new SnapshotHistory<Uint8Array>(this._ECSConfig.snapshotHistorySize);
    this._rapierSnapshotHistory.set(tick, this._physicsWorldManager.takeSnapshot());
  }

  /**
   * Export current Rapier world snapshot for state transfer.
   */
  public exportPhysicsSnapshot(): Uint8Array {
    return this._physicsWorldManager.takeSnapshot();
  }

  /**
   * Export combined ECS + Rapier state for network transfer.
   * Format: [ecsLength:u32LE][ecsBytes][rapierBytes]
   */
  public override exportStateForTransfer(): ArrayBuffer {
    const ecsSnapshot = this.mem.exportSnapshot();
    const rapierSnapshot = this._physicsWorldManager.takeSnapshot();

    const blob = new ArrayBuffer(4 + ecsSnapshot.byteLength + rapierSnapshot.byteLength);
    const view = new DataView(blob);
    view.setUint32(0, ecsSnapshot.byteLength, true);
    new Uint8Array(blob, 4, ecsSnapshot.byteLength).set(new Uint8Array(ecsSnapshot));
    new Uint8Array(blob, 4 + ecsSnapshot.byteLength).set(rapierSnapshot);

    log.info(`exportStateForTransfer: ecs=${ecsSnapshot.byteLength} rapier=${rapierSnapshot.byteLength} total=${blob.byteLength}`);
    return blob;
  }

  /**
   * Apply combined ECS + Rapier state from network transfer.
   * Splits the blob, applies ECS state, restores Rapier world, saves snapshot.
   */
  public override applyStateFromTransfer(blob: ArrayBuffer, tick: number): void {
    const view = new DataView(blob);
    const ecsLength = view.getUint32(0, true);
    const ecsState = blob.slice(4, 4 + ecsLength);
    const rapierBytes = new Uint8Array(blob, 4 + ecsLength);

    log.info(`applyStateFromTransfer: tick=${tick} ecs=${ecsLength} rapier=${rapierBytes.byteLength}`);

    // Apply ECS state (calls applyExternalState → saveSnapshot)
    this.applyExternalState(ecsState, tick);

    // Restore Rapier world from transferred snapshot
    this._physicsWorldManager.restoreSnapshot(rapierBytes);

    // Save rapier snapshot at this tick (overwrite the empty one saved by applyExternalState)
    this._rapierSnapshotHistory = new SnapshotHistory<Uint8Array>(this._ECSConfig.snapshotHistorySize);
    this._rapierSnapshotHistory.set(tick, this._physicsWorldManager.takeSnapshot());

    this.notifyStateTransferHandlers(tick);
  }
}
