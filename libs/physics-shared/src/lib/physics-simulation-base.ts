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
    super.applyExternalState(state, tick);
    // Reset rapier snapshot history — old physics snapshots are from a different timeline
    this._rapierSnapshotHistory = new SnapshotHistory<Uint8Array>(this._ECSConfig.snapshotHistorySize);
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
}
