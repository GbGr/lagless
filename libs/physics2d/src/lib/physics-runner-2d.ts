import { AbstractInputProvider, ECSConfig, ECSRunner, ECSDeps, IECSSystemConstructor } from '@lagless/core';
import { ISignalConstructor } from '@lagless/core';
import { CollisionLayers, PhysicsSimulationBase, wireColliderEntityMapRebuild } from '@lagless/physics-shared';
import { CollisionEvents2d } from './collision-events-2d.js';
import { PhysicsConfig2d } from './physics-config-2d.js';
import { PhysicsWorldManager2d } from './physics-world-manager-2d.js';
import { RapierModule2d } from './rapier-types-2d.js';

export abstract class PhysicsRunner2d extends ECSRunner {
  public readonly PhysicsWorldManager: PhysicsWorldManager2d;
  public readonly PhysicsConfig: PhysicsConfig2d;
  public readonly CollisionEvents: CollisionEvents2d;
  public override readonly Simulation: PhysicsSimulationBase;

  protected constructor(
    Config: ECSConfig,
    InputProviderInstance: AbstractInputProvider,
    Systems: Array<IECSSystemConstructor>,
    Signals: Array<ISignalConstructor>,
    Deps: ECSDeps,
    rapier: RapierModule2d,
    physicsConfig?: PhysicsConfig2d,
    collisionLayers?: CollisionLayers,
    extraRegistrations?: Array<[unknown, unknown]>,
  ) {
    const config = physicsConfig ?? new PhysicsConfig2d();
    const worldManager = new PhysicsWorldManager2d(rapier, config, Config.frameLength);
    const simulation = new PhysicsSimulationBase(Config, Deps, InputProviderInstance, worldManager);

    const extraRegs: Array<[unknown, unknown]> = [
      [PhysicsWorldManager2d, worldManager],
      [PhysicsConfig2d, config],
      [CollisionEvents2d, worldManager.collisionEvents],
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

    wireColliderEntityMapRebuild(Deps, simulation, worldManager.colliderEntityMap);
  }

  public override dispose(): void {
    super.dispose();
    this.PhysicsWorldManager.dispose();
  }
}
