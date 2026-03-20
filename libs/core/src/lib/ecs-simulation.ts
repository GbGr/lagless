import { MathOps } from '@lagless/math';
import { Mem } from './mem/index.js';
import { ECSConfig } from './ecs-config.js';
import { SimulationClock, SnapshotHistory, createLogger } from '@lagless/misc';
import { ECSDeps, IECSSystem } from './types/index.js';
import { AbstractInputProvider } from './input/index.js';
import { SignalsRegistry } from './signals/signals.registry.js';

const log = createLogger('ECSSimulation');

export class ECSSimulation {
  public readonly mem: Mem;
  public readonly clock: SimulationClock;
  private readonly _signalsRegistry: SignalsRegistry;
  private readonly _frameLength: number;
  private readonly _snapshotRate: number;
  protected _initialSnapshot!: ArrayBuffer;
  private readonly _systems = new Array<IECSSystem>();
  private readonly _onTickHandlers = new Set<(tick: number) => void>();
  private readonly _onRollbackHandlers = new Set<(tick: number) => void>();
  private readonly _onStateTransferHandlers = new Set<(tick: number) => void>();

  private _interpolationFactor = 0;
  protected _snapshotHistory: SnapshotHistory<ArrayBuffer>;
  private _hashTrackingInterval = 0;
  private _hashHistory = new Map<number, number>();

  public get tick(): number {
    return this.mem.tickManager.tick;
  }

  public get interpolationFactor(): number {
    return this._interpolationFactor;
  }

  constructor(
    protected readonly _ECSConfig: ECSConfig,
    private readonly _ECSDeps: ECSDeps,
    private readonly _inputProvider: AbstractInputProvider,
  ) {
    this.mem = new Mem(this._ECSConfig, this._ECSDeps);
    this._frameLength = this._ECSConfig.frameLength;
    this._snapshotRate = this._ECSConfig.snapshotRate;
    this._snapshotHistory = new SnapshotHistory<ArrayBuffer>(this._ECSConfig.snapshotHistorySize);
    this._initialSnapshot = this.mem.exportSnapshot();
    this.clock = new SimulationClock(_ECSConfig.frameLength, _ECSConfig.maxNudgePerFrame);
    this._signalsRegistry = new SignalsRegistry();
  }

  public addTickHandler(handler: (tick: number) => void): () => void {
    this._onTickHandlers.add(handler);
    return () => {
      this._onTickHandlers.delete(handler);
    };
  }

  public removeTickHandler(handler: (tick: number) => void): void {
    this._onTickHandlers.delete(handler);
  }

  public addRollbackHandler(handler: (tick: number) => void): () => void {
    this._onRollbackHandlers.add(handler);
    return () => { this._onRollbackHandlers.delete(handler); };
  }

  public addStateTransferHandler(handler: (tick: number) => void): () => void {
    this._onStateTransferHandlers.add(handler);
    return () => { this._onStateTransferHandlers.delete(handler); };
  }

  public registerSystems(systems: IECSSystem[]): void {
    if (this._systems.length !== 0) throw new Error('Systems already registered');

    for (const system of systems) {
      this._systems.push(system);
    }
  }

  public initSignals(signals: import('./signals/signal.js').Signal[]): void {
    this._signalsRegistry.init(signals);
  }

  public disposeSignals(): void {
    this._signalsRegistry.dispose();
  }

  public throwIfSystemsNotRegistered(): void {
    if (this._systems.length === 0) {
      throw new Error('No systems registered.');
    }
  }

  public get registeredSystems(): ReadonlyArray<IECSSystem> {
    return this._systems;
  }

  public get frameLength(): number {
    return this._frameLength;
  }

  public get inputProvider(): AbstractInputProvider {
    return this._inputProvider;
  }

  public enableHashTracking(interval: number): void {
    this._hashTrackingInterval = interval;
  }

  public disableHashTracking(): void {
    this._hashTrackingInterval = 0;
    this._hashHistory.clear();
  }

  public getHashAtTick(tick: number): number | undefined {
    return this._hashHistory.get(tick);
  }

  public start(): void {
    this.clock.start();
  }

  /**
   * Apply external state received from another client (late-join / reconnect).
   * Replaces the entire simulation state, sets the tick, and resets history.
   */
  public applyExternalState(state: ArrayBuffer, tick: number): void {
    log.info(`Applying external state at tick ${tick} (${state.byteLength} bytes)`);

    // Apply the snapshot to memory
    this.mem.applySnapshot(state);

    // Set tick (snapshot may have been taken at a different tick than requested)
    this.mem.tickManager.setTick(tick);

    // Reset snapshot history — old snapshots are from a different timeline
    this._snapshotHistory = new SnapshotHistory<ArrayBuffer>(this._ECSConfig.snapshotHistorySize);

    // Save the received state as the new baseline snapshot
    this.saveSnapshot(tick);

    // Adjust clock to match the new tick
    this.clock.setAccumulatedTime(tick * this._frameLength);

    // Reset signals — old predictions are invalid
    this._signalsRegistry.dispose();

    // Clear hash history — old hashes are from a different timeline
    this._hashHistory.clear();
  }

  /**
   * Export simulation state for network state transfer (late-join / reconnect).
   * Override in subclasses to include additional state (e.g. physics world).
   */
  public exportStateForTransfer(): ArrayBuffer {
    return this.mem.exportSnapshot();
  }

  /**
   * Apply state received from network state transfer (late-join / reconnect).
   * Override in subclasses to restore additional state (e.g. physics world).
   */
  public applyStateFromTransfer(blob: ArrayBuffer, tick: number): void {
    this.applyExternalState(blob, tick);
    this.notifyStateTransferHandlers(tick);
  }

  protected notifyStateTransferHandlers(tick: number): void {
    for (const handler of this._onStateTransferHandlers) handler(tick);
  }

  public update(dt: number) {
    this.clock.update(dt);

    const targetTick = Math.floor(this.clock.accumulatedTime / this._frameLength);

    this.checkAndRollback(this.mem.tickManager.tick);
    this.simulationTicks(this.mem.tickManager.tick, targetTick);

    this._inputProvider.update();

    const simTick = this.mem.tickManager.tick;
    const tickTime = simTick * this._frameLength;
    const leftover = this.clock.accumulatedTime - tickTime;

    this._interpolationFactor = MathOps.clamp01(leftover / this._frameLength);
  }

  private checkAndRollback(currentTick: number) {
    const rollbackTick = this._inputProvider.getInvalidateRollbackTick();

    if (rollbackTick === undefined || rollbackTick > currentTick) return;

    this.rollback(rollbackTick);

    for (const handler of this._onRollbackHandlers) handler(this.tick);
  }

  private simulationTicks(currentTick: number, toTick: number): void {
    if (toTick - currentTick > 1) {
      log.warn(`Simulation ticks: ${currentTick} -> ${toTick} (simulate ${toTick - currentTick})`);
    }

    while (currentTick < toTick) {
      this.mem.tickManager.setTick(++currentTick);
      this.simulate(currentTick);

      if (this._hashTrackingInterval > 0 && currentTick % this._hashTrackingInterval === 0) {
        this._hashHistory.set(currentTick, this.mem.getHash());
      }

      this._signalsRegistry.onTick(Math.min(this._inputProvider.verifiedTick, currentTick));
      this.storeSnapshotIfNeeded(currentTick);
      for (const handler of this._onTickHandlers) handler(currentTick);
    }

    // Prune old hash entries
    if (this._hashHistory.size > 0) {
      const pruneBelow = this._inputProvider.verifiedTick - 600;
      if (pruneBelow > 0) {
        for (const tick of this._hashHistory.keys()) {
          if (tick < pruneBelow) this._hashHistory.delete(tick);
        }
      }
    }
  }

  protected rollback(tick: number): void {
    this._signalsRegistry.onBeforeRollback(tick);
    let snapshot: ArrayBuffer;

    try {
      snapshot = this._snapshotHistory.getNearest(tick);
      log.warn(`Rollback to tick ${tick} succeeded`);
    } catch {
      snapshot = this._initialSnapshot;
      log.warn(`Rollback to tick ${tick} failed, using initial snapshot`);
    }

    this.mem.applySnapshot(snapshot);
    this._snapshotHistory.rollback(this.mem.tickManager.tick);
  }

  protected simulate(tick: number): void {
    for (let i = 0; i < this._systems.length; i++) {
      this._systems[i].update(tick);
    }
  }

  private storeSnapshotIfNeeded(tick: number): void {
    if (this._snapshotRate === 0) return;

    if (tick % this._snapshotRate === 0) {
      this.saveSnapshot(tick);
    }

    if (tick % 200 === 0) {
      log.debug(`Mem Hash at tick ${tick}: ${this.mem.getHash()}`);
    }
  }

  protected saveSnapshot(tick: number): void {
    this._snapshotHistory.set(tick, this.mem.exportSnapshot());
  }
}
