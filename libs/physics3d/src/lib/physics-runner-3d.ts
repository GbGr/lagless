import { AbstractInputProvider, ECSConfig, ECSRunner, ECSDeps, IECSSystemConstructor } from '@lagless/core';
import { ISignalConstructor } from '@lagless/core';
import { PhysicsConfig3d } from './physics-config-3d.js';
import { PhysicsSimulation3d } from './physics-simulation-3d.js';
import { PhysicsWorldManager3d } from './physics-world-manager-3d.js';
import { RapierModule3d } from './rapier-types.js';

export abstract class PhysicsRunner3d extends ECSRunner {
  public readonly PhysicsWorldManager: PhysicsWorldManager3d;
  public readonly PhysicsConfig: PhysicsConfig3d;
  public override readonly Simulation: PhysicsSimulation3d;

  protected constructor(
    Config: ECSConfig,
    InputProviderInstance: AbstractInputProvider,
    Systems: Array<IECSSystemConstructor>,
    Signals: Array<ISignalConstructor>,
    Deps: ECSDeps,
    rapier: RapierModule3d,
    physicsConfig?: PhysicsConfig3d,
  ) {
    const config = physicsConfig ?? new PhysicsConfig3d();
    const worldManager = new PhysicsWorldManager3d(rapier, config, Config.frameLength);
    const simulation = new PhysicsSimulation3d(Config, Deps, InputProviderInstance, worldManager);

    super(Config, InputProviderInstance, Systems, Signals, Deps, simulation);

    this.PhysicsWorldManager = worldManager;
    this.PhysicsConfig = config;
    this.Simulation = simulation;

    // Register physics types in DI container so game systems can inject them
    this.DIContainer.register(PhysicsWorldManager3d, worldManager);
    this.DIContainer.register(PhysicsConfig3d, config);
  }

  public override dispose(): void {
    super.dispose();
    this.PhysicsWorldManager.dispose();
  }
}
