import { ECSSystem, IECSSystem } from '@lagless/core';
import { PhysicsWorldManager2d } from '@lagless/physics2d';
import { Transform2d, PhysicsRefs, PlayerFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class PhysicsStepSystem implements IECSSystem {
  constructor(
    private readonly _WorldManager: PhysicsWorldManager2d,
    private readonly _PlayerFilter: PlayerFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _PhysicsRefs: PhysicsRefs,
  ) {}

  public update(): void {
    this._WorldManager.step();

    // Sync dynamic bodies: Rapier -> ECS Transform
    const t = this._Transform2d.unsafe;
    const pr = this._PhysicsRefs.unsafe;
    for (const entity of this._PlayerFilter) {
      const body = this._WorldManager.getBody(pr.bodyHandle[entity]);
      const pos = body.translation();
      t.positionX[entity] = pos.x;
      t.positionY[entity] = pos.y;
      t.rotation[entity] = body.rotation();
    }
  }
}
