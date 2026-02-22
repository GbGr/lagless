import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform2d, PlayerFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class SavePrevTransformSystem implements IECSSystem {
  constructor(
    private readonly _PlayerFilter: PlayerFilter,
    private readonly _Transform2d: Transform2d,
  ) {}

  public update(): void {
    for (const entity of this._PlayerFilter) {
      this._Transform2d.unsafe.prevPositionX[entity] = this._Transform2d.unsafe.positionX[entity];
      this._Transform2d.unsafe.prevPositionY[entity] = this._Transform2d.unsafe.positionY[entity];
    }
  }
}
