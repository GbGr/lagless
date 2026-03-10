import { ECSSystem, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { MoveInput, PlayerResource, PhysicsRefs } from '../schema/code-gen/index.js';
import { PhysicsWorldManager2d } from '@lagless/physics2d';
import { MapTestArena } from '../arena.js';

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

      const dirX = finite(rpc.data.directionX);
      const dirY = finite(rpc.data.directionY);

      const body = this._WorldManager.getBody(this._PhysicsRefs.unsafe.bodyHandle[entity]);
      body.setLinvel({ x: dirX * MapTestArena.moveSpeed, y: dirY * MapTestArena.moveSpeed }, true);
    }
  }
}
