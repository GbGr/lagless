import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform2d, Velocity2d, MovingFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class IntegrateSystem implements IECSSystem {
  constructor(
    private readonly _MovingFilter: MovingFilter,
    private readonly _Velocity2d: Velocity2d,
    private readonly _Transform2d: Transform2d,
  ) {}

  public update(): void {
    for (const entity of this._MovingFilter) {
      this._Transform2d.unsafe.positionX[entity] += this._Velocity2d.unsafe.velocityX[entity];
      this._Transform2d.unsafe.positionY[entity] += this._Velocity2d.unsafe.velocityY[entity];
    }
  }
}
