import { ECSSystem, IECSSystem } from '@lagless/core';
import { PhysicsWorldManager3d } from '@lagless/physics3d';

@ECSSystem()
export class PhysicsStepSystem implements IECSSystem {
  constructor(
    private readonly _WorldManager: PhysicsWorldManager3d,
  ) {}

  public update(): void {
    this._WorldManager.step();
  }
}
