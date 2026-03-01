<% if (simulationType === 'physics3d') { -%>
import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform3d, PlayerFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class SavePrevTransformSystem implements IECSSystem {
  constructor(
    private readonly _PlayerFilter: PlayerFilter,
    private readonly _Transform3d: Transform3d,
  ) {}

  public update(): void {
    const t = this._Transform3d.unsafe;
    for (const entity of this._PlayerFilter) {
      t.prevPositionX[entity] = t.positionX[entity];
      t.prevPositionY[entity] = t.positionY[entity];
      t.prevPositionZ[entity] = t.positionZ[entity];
      t.prevRotationX[entity] = t.rotationX[entity];
      t.prevRotationY[entity] = t.rotationY[entity];
      t.prevRotationZ[entity] = t.rotationZ[entity];
      t.prevRotationW[entity] = t.rotationW[entity];
    }
  }
}
<% } else if (simulationType === 'physics2d') { -%>
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
<% } else { -%>
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
<% } -%>
