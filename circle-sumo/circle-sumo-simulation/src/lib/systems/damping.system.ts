import { ECSConfig, ECSSystem, IECSSystem } from '@lagless/core';
import { CircleBody, DampingFilter, Velocity2d } from '../schema/code-gen/index.js';

@ECSSystem()
export class DampingSystem implements IECSSystem {
  private readonly _frameLength: number;

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _DampingFilter: DampingFilter,
    private readonly _Velocity2d: Velocity2d,
    private readonly _CircleBody: CircleBody,
  ) {
    this._frameLength = this._ECSConfig.frameLength;
  }

  public update(): void {
    for (const entity of this._DampingFilter) {
      const velocity = this._Velocity2d.getCursor(entity);
      const circleBody = this._CircleBody.getCursor(entity);

      const linearDamping = circleBody.linearDamping;
      const angularDamping = circleBody.angularDamping;

      if (linearDamping > 0) {
        const k = 1 / (1 + linearDamping * this._frameLength);
        velocity.velocityX *= k;
        velocity.velocityY *= k;
      }

      if (angularDamping > 0) {
        const k = 1 / (1 + angularDamping * this._frameLength);
        velocity.angularVelocity *= k;
      }
    }
  }
}
