import { ECSSystem, EntitiesManager, IECSSystem } from '@lagless/core';
import { CircleBody, PendingImpulse, PendingImpulseFilter, Velocity2d } from '../schema/code-gen/index.js';

@ECSSystem()
export class ApplyImpulseSystem implements IECSSystem {
  constructor(
    private readonly _PendingImpulseFilter: PendingImpulseFilter,
    private readonly _Velocity2d: Velocity2d,
    private readonly _PendingImpulse: PendingImpulse,
    private readonly _CircleBody: CircleBody,
    private readonly _EntitiesManager: EntitiesManager,
  ) {
  }

  public update(): void {
    for (const entity of this._PendingImpulseFilter) {
      const velocity = this._Velocity2d.getCursor(entity);
      const circleBody = this._CircleBody.getCursor(entity);
      const pendingImpulse = this._PendingImpulse.getCursor(entity);

      const invMass = circleBody.mass > 0 ? 1 / circleBody.mass : 0;
      velocity.velocityX += pendingImpulse.impulseX * invMass;
      velocity.velocityY += pendingImpulse.impulseY * invMass;

      this._EntitiesManager.removeComponent(entity, PendingImpulse);
    }
  }
}
