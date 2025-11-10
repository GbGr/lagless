import { ECSSystem, IECSSystem } from '@lagless/core';
import { MovableFilter, Transform2d, Velocity2d } from '../schema/code-gen/index.js';

@ECSSystem()
export class VelocitySystem implements IECSSystem {
  constructor(
    private readonly _MovableFilter: MovableFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _Velocity2d: Velocity2d,
  ) {
  }

  public update(tick: number): void {
    for (const entity of this._MovableFilter) {
      this._Transform2d.unsafe.positionX[entity] += this._Velocity2d.unsafe.velocityX[entity];
      this._Transform2d.unsafe.positionY[entity] += this._Velocity2d.unsafe.velocityY[entity];
    }
  }
}
