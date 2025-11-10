import { MathOps } from '@lagless/math';
import { Mem } from './mem/index.js';
import { ECSConfig } from './ecs-config.js';
import { SimulationClock, SnapshotHistory } from '@lagless/misc';
import { ECSDeps, IECSSystem } from './types/index.js';
import { AbstractInputProvider } from './input/index.js';

export class ECSSimulation {
  public readonly mem: Mem;
  public readonly clock: SimulationClock;
  private readonly _frameLength: number;
  private readonly _snapshotRate: number;
  private readonly _initialSnapshot!: ArrayBuffer;
  private readonly _systems = new Array<IECSSystem>();

  private _interpolationFactor = 0;
  private _snapshotHistory: SnapshotHistory<ArrayBuffer>;

  public get tick(): number {
    return this.mem.tickManager.tick;
  }

  public get interpolationFactor(): number {
    return this._interpolationFactor;
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

    let currentTick = this.mem.tickManager.tick;
    const targetTick = Math.floor(this.clock.accumulatedTime / this._frameLength);

    const hasRollerBack = this.checkAndRollback(currentTick);

    currentTick = this.mem.tickManager.tick;

    this.simulationTicks(currentTick, targetTick, hasRollerBack);

    const simTick = this.mem.tickManager.tick;
    const tickTime = simTick * this._frameLength;
    const leftover = this.clock.accumulatedTime - tickTime;

    this._interpolationFactor = MathOps.clamp01(leftover / this._frameLength);
  }

  private checkAndRollback(currentTick: number) {
    const rollbackTick = this._inputProvider.getInvalidateRollbackTick();

    if (rollbackTick === undefined || rollbackTick > currentTick) return false;

    this.rollback(rollbackTick);

    return true;
  }

  private simulationTicks(currentTick: number, toTick: number, hasRolledBack: boolean): void {
    if (toTick - currentTick > 1) {
      console.warn(`Simulation ticks: ${currentTick} -> ${toTick} (simulate ${toTick - currentTick})`);
    }

    while (currentTick < toTick) {
      this.mem.tickManager.setTick(++currentTick);
      this.simulate(currentTick);
      if (!hasRolledBack) this._inputProvider.update();
      this.storeSnapshotIfNeeded(currentTick);
    }
  }

  protected rollback(tick: number): void {
    let snapshot: ArrayBuffer;

    try {
      snapshot = this._snapshotHistory.getNearest(tick);
      console.warn(`Rollback to tick ${tick} succeeded`);
    } catch {
      snapshot = this._initialSnapshot;
      console.warn(`Rollback to tick ${tick} failed, using initial snapshot`);
    }

    this.mem.applySnapshot(snapshot);
    this._snapshotHistory.rollback(tick);
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
}
