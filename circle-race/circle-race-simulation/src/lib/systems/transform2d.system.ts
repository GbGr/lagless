import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform2d, Transform2dFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class Transform2dSystem implements IECSSystem {
  constructor(
    private readonly _Transform2dFilter: Transform2dFilter,
    private readonly _Transform2d: Transform2d,
  ) {
  }

  public update(): void {
    for (const entity of this._Transform2dFilter) {
      this._Transform2d.unsafe.prevPositionX[entity] = this._Transform2d.unsafe.positionX[entity];
      this._Transform2d.unsafe.prevPositionY[entity] = this._Transform2d.unsafe.positionY[entity];
      this._Transform2d.unsafe.prevRotation[entity] = this._Transform2d.unsafe.rotation[entity];
    }
  }
}
