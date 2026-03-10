import { ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { PlayerLeft, PlayerResource, PhysicsRefs } from '../schema/code-gen/index.js';
import { PhysicsWorldManager2d } from '@lagless/physics2d';

@ECSSystem()
export class PlayerLeaveSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _WorldManager: PhysicsWorldManager2d,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, PlayerLeft);

    for (const rpc of rpcs) {
      const player = this._PlayerResources.get(PlayerResource, rpc.data.slot);
      const entity = player.safe.entity;

      // Remove physics objects
      const colliderHandle = this._PhysicsRefs.unsafe.colliderHandle[entity];
      const bodyHandle = this._PhysicsRefs.unsafe.bodyHandle[entity];
      this._WorldManager.unregisterCollider(colliderHandle);
      this._WorldManager.removeCollider(colliderHandle);
      this._WorldManager.removeBody(bodyHandle);

      player.safe.connected = 0;
      this._EntitiesManager.removeEntity(entity);
    }
  }
}
