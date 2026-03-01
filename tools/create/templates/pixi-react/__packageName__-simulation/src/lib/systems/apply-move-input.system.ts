<% if (simulationType === 'physics3d') { -%>
import { ECSSystem, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { MoveInput, PlayerResource } from '../schema/code-gen/index.js';
import { PhysicsWorldManager3d } from '@lagless/physics3d';
import { PhysicsRefs } from '../schema/code-gen/index.js';
import { <%= projectName %>Arena } from '../arena.js';

const finite = (v: number): number => Number.isFinite(v) ? v : 0;

@ECSSystem()
export class ApplyMoveInputSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _PlayerResources: PlayerResources,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _WorldManager: PhysicsWorldManager3d,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, MoveInput);

    for (const rpc of rpcs) {
      const playerResource = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      const entity = playerResource.safe.entity;

      // Sanitize input
      const dirX = finite(rpc.data.directionX);
      const dirZ = finite(rpc.data.directionY); // directionY maps to Z axis in 3D

      const body = this._WorldManager.getBody(this._PhysicsRefs.unsafe.bodyHandle[entity]);
      body.setLinvel(
        { x: dirX * <%= projectName %>Arena.moveSpeed, y: body.linvel().y, z: dirZ * <%= projectName %>Arena.moveSpeed },
        true,
      );
    }
  }
}
<% } else if (simulationType === 'physics2d') { -%>
import { ECSSystem, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { MoveInput, PlayerResource } from '../schema/code-gen/index.js';
import { PhysicsWorldManager2d } from '@lagless/physics2d';
import { PhysicsRefs } from '../schema/code-gen/index.js';
import { <%= projectName %>Arena } from '../arena.js';

const finite = (v: number): number => Number.isFinite(v) ? v : 0;

@ECSSystem()
export class ApplyMoveInputSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _PlayerResources: PlayerResources,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _WorldManager: PhysicsWorldManager2d,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, MoveInput);

    for (const rpc of rpcs) {
      const playerResource = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      const entity = playerResource.safe.entity;

      // Sanitize input
      const dirX = finite(rpc.data.directionX);
      const dirY = finite(rpc.data.directionY);

      const body = this._WorldManager.getBody(this._PhysicsRefs.unsafe.bodyHandle[entity]);
      body.setLinvel({ x: dirX * <%= projectName %>Arena.moveSpeed, y: dirY * <%= projectName %>Arena.moveSpeed }, true);
    }
  }
}
<% } else { -%>
import { ECSSystem, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { MoveInput, PlayerResource, Velocity2d } from '../schema/code-gen/index.js';
import { <%= projectName %>Arena } from '../arena.js';

@ECSSystem()
export class ApplyMoveInputSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _PlayerResources: PlayerResources,
    private readonly _Velocity2d: Velocity2d,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, MoveInput);

    for (const rpc of rpcs) {
      const playerResource = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      const entity = playerResource.safe.entity;
      this._Velocity2d.unsafe.velocityX[entity] = rpc.data.directionX * <%= projectName %>Arena.moveSpeed;
      this._Velocity2d.unsafe.velocityY[entity] = rpc.data.directionY * <%= projectName %>Arena.moveSpeed;
    }
  }
}
<% } -%>
