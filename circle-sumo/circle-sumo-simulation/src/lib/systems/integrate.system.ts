import { ECSConfig, ECSSystem, IECSSystem } from '@lagless/core';
import { Transform2d, Velocity2d, Velocity2dFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class IntegrateSystem implements IECSSystem {
  private readonly _frameLength: number;

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _Velocity2dFilter: Velocity2dFilter,
    private readonly _Velocity2d: Velocity2d,
    private readonly _Transform2d: Transform2d,
  ) {
    this._frameLength = this._ECSConfig.frameLength;
  }

  public update(): void {
    for (const entity of this._Velocity2dFilter) {
      const velocity = this._Velocity2d.getCursor(entity);
      const transform = this._Transform2d.getCursor(entity);

      transform.positionX += velocity.velocityX * this._frameLength;
      transform.positionY += velocity.velocityY * this._frameLength;
      transform.rotation += velocity.angularVelocity * this._frameLength;
    }
  }
}
