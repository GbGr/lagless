import { ECSConfig, AbstractInputProvider, ECSDeps } from '@lagless/core';
import { PhysicsSimulationBase } from '@lagless/physics-shared';
import { PhysicsWorldManager3d } from './physics-world-manager-3d.js';

export class PhysicsSimulation3d extends PhysicsSimulationBase {
  constructor(
    config: ECSConfig,
    deps: ECSDeps,
    inputProvider: AbstractInputProvider,
    physicsWorldManager: PhysicsWorldManager3d,
  ) {
    super(config, deps, inputProvider, physicsWorldManager);
  }
}
