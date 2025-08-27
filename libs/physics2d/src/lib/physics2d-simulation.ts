import { AbstractInputProvider, ECSSimulation } from '@lagless/core';
import { ECSDeps } from '@lagless/types';
import { Physics2dConfig } from './physics2d-config.js';
import { SnapshotHistory } from '@lagless/misc';
import Rapier from '@dimforge/rapier2d-deterministic-compat';

export class Physics2dSimulation extends ECSSimulation {
  public static Rapier2d: any;

  public static async init() {
    if (this.Rapier2d) return;
    await Rapier.init();
    this.Rapier2d = Rapier;
  }

  private readonly _substeps: number;
  private readonly _physicsEventQueue: Rapier.EventQueue;
  private readonly _initialPhysicsSnapshot: ArrayBuffer;
  private _physicsWorld: Rapier.World;
  private _physicsSnapshotHistory: SnapshotHistory<ArrayBuffer>;

  public get physicsWorld(): Rapier.World {
    return this._physicsWorld;
  }

  constructor(
    public readonly Physics2dConfig: Physics2dConfig,
    ECSDeps: ECSDeps,
    inputProvider: AbstractInputProvider,
  ) {
    super(Physics2dConfig, ECSDeps, inputProvider);

    this._substeps = Physics2dConfig.substeps;
    this._physicsWorld = new Physics2dSimulation.Rapier2d.World(Physics2dConfig.gravity);
    this._physicsWorld.timestep = Physics2dConfig.frameLength / this._substeps / 1000;
    this._physicsEventQueue = new Rapier.EventQueue(false);
    this._initialPhysicsSnapshot = this._physicsWorld.takeSnapshot().buffer;
    this._physicsSnapshotHistory = new SnapshotHistory(Physics2dConfig.snapshotHistorySize);
  }

  protected override saveSnapshot(tick: number) {
    super.saveSnapshot(tick);
    this._physicsSnapshotHistory.set(tick, this._physicsWorld.takeSnapshot().buffer);
  }

  protected override simulate(tick: number) {
    for (let i = 0; i < this._substeps; i++) {
      this._physicsWorld.step(this._physicsEventQueue);
    }

    super.simulate(tick);
  }

  protected override rollback(tick: number) {
    super.rollback(tick);

    let physicsSnapshot: ArrayBuffer;

    try {
      physicsSnapshot = this._physicsSnapshotHistory.getNearest(tick);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      physicsSnapshot = this._initialPhysicsSnapshot;
    }

    this._physicsWorld = Rapier.World.restoreSnapshot(new Uint8Array(physicsSnapshot));
  }
}
