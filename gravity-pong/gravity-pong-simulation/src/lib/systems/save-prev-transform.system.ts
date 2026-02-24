import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform2d, BallFilter, GravitySourceFilter, GoalFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class SavePrevTransformSystem implements IECSSystem {
  constructor(
    private readonly _BallFilter: BallFilter,
    private readonly _GravitySourceFilter: GravitySourceFilter,
    private readonly _GoalFilter: GoalFilter,
    private readonly _Transform2d: Transform2d,
  ) {}

  public update(): void {
    for (const entity of this._BallFilter) {
      this._Transform2d.unsafe.prevPositionX[entity] = this._Transform2d.unsafe.positionX[entity];
      this._Transform2d.unsafe.prevPositionY[entity] = this._Transform2d.unsafe.positionY[entity];
    }
    for (const entity of this._GravitySourceFilter) {
      this._Transform2d.unsafe.prevPositionX[entity] = this._Transform2d.unsafe.positionX[entity];
      this._Transform2d.unsafe.prevPositionY[entity] = this._Transform2d.unsafe.positionY[entity];
    }
    for (const entity of this._GoalFilter) {
      this._Transform2d.unsafe.prevPositionX[entity] = this._Transform2d.unsafe.positionX[entity];
      this._Transform2d.unsafe.prevPositionY[entity] = this._Transform2d.unsafe.positionY[entity];
    }
  }
}
