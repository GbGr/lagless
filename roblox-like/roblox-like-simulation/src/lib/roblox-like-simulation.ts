import { PhysicsSimulation3d } from '@lagless/physics3d';
import { CharacterControllerManager } from '@lagless/character-controller-3d';
import type { ECSConfig, ECSDeps, AbstractInputProvider } from '@lagless/core';
import type { PhysicsWorldManager3d } from '@lagless/physics3d';

export class RobloxLikeSimulation extends PhysicsSimulation3d {
  constructor(
    config: ECSConfig,
    deps: ECSDeps,
    inputProvider: AbstractInputProvider,
    physicsWorldManager: PhysicsWorldManager3d,
    private readonly _kccManager: CharacterControllerManager,
  ) {
    super(config, deps, inputProvider, physicsWorldManager);
  }

  public override rollback(targetTick: number): void {
    super.rollback(targetTick);
    this._kccManager.recreateAll();
  }
}
