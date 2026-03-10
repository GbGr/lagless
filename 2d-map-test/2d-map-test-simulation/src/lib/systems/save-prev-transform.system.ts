import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform2d, PlayerFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class SavePrevTransformSystem implements IECSSystem {
  constructor(
    private readonly _PlayerFilter: PlayerFilter,
    private readonly _Transform2d: Transform2d,
  ) {}

  public update(): void {
    const t = this._Transform2d.unsafe;
    for (const entity of this._PlayerFilter) {
      t.prevPositionX[entity] = t.positionX[entity];
      t.prevPositionY[entity] = t.positionY[entity];
      t.prevRotation[entity] = t.rotation[entity];
    }
  }
}
