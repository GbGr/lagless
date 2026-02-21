import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform2d, PlayerBody, PlayerFilter } from '../schema/code-gen/index.js';
import { SyncTestArena } from '../arena.js';

@ECSSystem()
export class BoundarySystem implements IECSSystem {
  constructor(
    private readonly _PlayerFilter: PlayerFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _PlayerBody: PlayerBody,
  ) {}

  public update(): void {
    for (const entity of this._PlayerFilter) {
      const radius = this._PlayerBody.unsafe.radius[entity];
      const minX = radius;
      const maxX = SyncTestArena.width - radius;
      const minY = radius;
      const maxY = SyncTestArena.height - radius;

      let x = this._Transform2d.unsafe.positionX[entity];
      let y = this._Transform2d.unsafe.positionY[entity];

      if (x < minX) x = minX;
      else if (x > maxX) x = maxX;

      if (y < minY) y = minY;
      else if (y > maxY) y = maxY;

      this._Transform2d.unsafe.positionX[entity] = x;
      this._Transform2d.unsafe.positionY[entity] = y;
    }
  }
}
