import { ECSConfig, AbstractInputProvider, ECSDeps } from '@lagless/core';
import { PhysicsSimulationBase } from '@lagless/physics-shared';
import { PhysicsWorldManager2d } from './physics-world-manager-2d.js';

export class PhysicsSimulation2d extends PhysicsSimulationBase {
  constructor(
    config: ECSConfig,
    deps: ECSDeps,
    inputProvider: AbstractInputProvider,
    physicsWorldManager: PhysicsWorldManager2d,
  ) {
    super(config, deps, inputProvider, physicsWorldManager);
  }
}
