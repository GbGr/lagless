import { MathOps } from '@lagless/math';
import { Mem } from './mem/index.js';
import { ECSConfig } from './ecs-config.js';
import { SimulationClock, SnapshotHistory } from '@lagless/misc';
import { ECSDeps, IECSSystem } from './types/index.js';
import { AbstractInputProvider } from './input/index.js';
import { SignalsRegistry } from './signals/signals.registry.js';

export class ECSSimulation {
  public readonly mem: Mem;
  public readonly clock: SimulationClock;
  public readonly _signalsRegistry: SignalsRegistry;
  private readonly _frameLength: number;
  private readonly _snapshotRate: number;
  private readonly _initialSnapshot!: ArrayBuffer;
  private readonly _systems = new Array<IECSSystem>();
  private readonly _onTickHandlers = new Set<(tick: number) => void>();

  private _interpolationFactor = 0;
  private _snapshotHistory: SnapshotHistory<ArrayBuffer>;

  public get tick(): number {
    return this.mem.tickManager.tick;
  }

  public get interpolationFactor(): number {
    return this._interpolationFactor;
  }

  /**
   * Get the snapshot history for external access (e.g., late-join voting).
   */
  public get snapshotHistory(): SnapshotHistory<ArrayBuffer> {
    return this._snapshotHistory;
  }

  constructor(
    private readonly _ECSConfig: ECSConfig,
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

  public registerSystems(systems: IECSSystem[]): void {
    if (this._systems.length !== 0) throw new Error('Systems already registered');

    for (const system of systems) {
      this._systems.push(system);
    }
  }

  public throwIfSystemsNotRegistered(): void {
    if (this._systems.length === 0) {
      throw new Error('No systems registered.');
    }
  }

  public start(): void {
    this.clock.start();
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
  }

  private simulationTicks(currentTick: number, toTick: number): void {
    if (toTick - currentTick > 1) {
      console.warn(`Simulation ticks: ${currentTick} -> ${toTick} (simulate ${toTick - currentTick})`);
    }

    while (currentTick < toTick) {
      this.mem.tickManager.setTick(++currentTick);
      this.simulate(currentTick);
      this._signalsRegistry.onTick(currentTick);
      this.storeSnapshotIfNeeded(currentTick);
      for (const handler of this._onTickHandlers) handler(currentTick);
    }
  }

  protected rollback(tick: number): void {
    this._signalsRegistry.onBeforeRollback(tick);
    let snapshot: ArrayBuffer;

    try {
      snapshot = this._snapshotHistory.getNearest(tick);
      console.warn(`Rollback to tick ${tick} succeeded`);
    } catch {
      snapshot = this._initialSnapshot;
      console.warn(`Rollback to tick ${tick} failed, using initial snapshot`);
    }

    this.mem.applySnapshot(snapshot);
    this._snapshotHistory.rollback(this.mem.tickManager.tick);
  }

  protected simulate(tick: number): void {
    this._systems.forEach((system) => system.update(tick));
  }

  private storeSnapshotIfNeeded(tick: number): void {
    if (this._snapshotRate === 0) return;

    if (tick % this._snapshotRate === 0) {
      this.saveSnapshot(tick);
    }

    if (tick % 200 === 0) {
      console.log(`Mem Hash at tick ${tick}: ${this.mem.getHash()}`);
    }
  }

  protected saveSnapshot(tick: number): void {
    this._snapshotHistory.set(tick, this.mem.exportSnapshot());
  }

  /**
   * Apply an external snapshot (e.g., from server late-join bundle).
   *
   * This is used for late-joining clients that receive a snapshot
   * from the server instead of simulating from tick 0.
   *
   * After calling this method:
   * 1. The simulation state is replaced with the snapshot
   * 2. The tick is set to the snapshot tick
   * 3. The snapshot history is rolled back to allow re-simulation
   * 4. Signals are notified of the rollback
   *
   * @param snapshot - The snapshot bytes to apply
   * @param tick - The tick at which the snapshot was taken
   */
  public applyExternalSnapshot(snapshot: ArrayBuffer, tick: number): void {
    console.log(`[ECSSimulation] Applying external snapshot at tick ${tick}`);

    // 1. Apply snapshot to memory
    this.mem.applySnapshot(snapshot);

    // 2. Set the tick
    this.mem.tickManager.setTick(tick);

    // 3. Rollback snapshot history (clear anything >= tick)
    this._snapshotHistory.rollback(tick);

    // 4. Save this snapshot as the new baseline
    this._snapshotHistory.set(tick, snapshot);

    // 5. Notify signals of rollback
    this._signalsRegistry.onBeforeRollback(tick);

    // 6. Align the clock to match the new tick
    this.clock.setAccumulatedTime(tick * this._frameLength);

    console.log(
      `[ECSSimulation] External snapshot applied: tick=${tick}, ` +
      `size=${snapshot.byteLength}, hash=${this.mem.getHash()}`
    );
  }
}
