import { AbstractInputProvider, ECSConfig, ECSRunner, ECSDeps, IECSSystemConstructor } from '@lagless/core';
import { ISignalConstructor } from '@lagless/core';
import { CollisionLayers } from '@lagless/physics-shared';
import { CollisionEvents3d } from './collision-events-3d.js';
import { PhysicsConfig3d } from './physics-config-3d.js';
import { PhysicsSimulation3d } from './physics-simulation-3d.js';
import { PhysicsWorldManager3d } from './physics-world-manager-3d.js';
import { RapierModule3d } from './rapier-types.js';

export abstract class PhysicsRunner3d extends ECSRunner {
  public readonly PhysicsWorldManager: PhysicsWorldManager3d;
  public readonly PhysicsConfig: PhysicsConfig3d;
  public readonly CollisionEvents: CollisionEvents3d;
  public override readonly Simulation: PhysicsSimulation3d;

  protected constructor(
    Config: ECSConfig,
    InputProviderInstance: AbstractInputProvider,
    Systems: Array<IECSSystemConstructor>,
    Signals: Array<ISignalConstructor>,
    Deps: ECSDeps,
    rapier: RapierModule3d,
    physicsConfig?: PhysicsConfig3d,
    collisionLayers?: CollisionLayers,
    extraRegistrations?: Array<[unknown, unknown]>,
  ) {
    const config = physicsConfig ?? new PhysicsConfig3d();
    const worldManager = new PhysicsWorldManager3d(rapier, config, Config.frameLength);
    const simulation = new PhysicsSimulation3d(Config, Deps, InputProviderInstance, worldManager);

    const extraRegs: Array<[unknown, unknown]> = [
      [PhysicsWorldManager3d, worldManager],
      [PhysicsConfig3d, config],
      [CollisionEvents3d, worldManager.collisionEvents],
    ];
    if (collisionLayers) {
      extraRegs.push([CollisionLayers, collisionLayers]);
    }
    if (extraRegistrations) {
      extraRegs.push(...extraRegistrations);
    }

    super(Config, InputProviderInstance, Systems, Signals, Deps, simulation, extraRegs);

    this.PhysicsWorldManager = worldManager;
    this.PhysicsConfig = config;
    this.Simulation = simulation;
    this.CollisionEvents = worldManager.collisionEvents;
  }

  public override dispose(): void {
    super.dispose();
    this.PhysicsWorldManager.dispose();
  }
}
