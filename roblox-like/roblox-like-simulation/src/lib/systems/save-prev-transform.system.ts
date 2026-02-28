import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform3d, CharacterFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class SavePrevTransformSystem implements IECSSystem {
  constructor(
    private readonly _CharacterFilter: CharacterFilter,
    private readonly _Transform3d: Transform3d,
  ) {}

  public update(): void {
    const t = this._Transform3d.unsafe;
    for (const e of this._CharacterFilter) {
      t.prevPositionX[e] = t.positionX[e];
      t.prevPositionY[e] = t.positionY[e];
      t.prevPositionZ[e] = t.positionZ[e];
      t.prevRotationX[e] = t.rotationX[e];
      t.prevRotationY[e] = t.rotationY[e];
      t.prevRotationZ[e] = t.rotationZ[e];
      t.prevRotationW[e] = t.rotationW[e];
    }
  }
}
