<% if (simulationType === 'raw') { -%>
import { ECSSystem, IECSSystem } from '@lagless/core';
import { Velocity2d, MovingFilter } from '../schema/code-gen/index.js';
import { <%= projectName %>Arena } from '../arena.js';

@ECSSystem()
export class DampingSystem implements IECSSystem {
  constructor(
    private readonly _MovingFilter: MovingFilter,
    private readonly _Velocity2d: Velocity2d,
  ) {}

  public update(): void {
    for (const entity of this._MovingFilter) {
      this._Velocity2d.unsafe.velocityX[entity] *= <%= projectName %>Arena.damping;
      this._Velocity2d.unsafe.velocityY[entity] *= <%= projectName %>Arena.damping;
    }
  }
}
<% } -%>
