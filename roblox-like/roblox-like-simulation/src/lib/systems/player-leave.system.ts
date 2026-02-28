import { ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { PhysicsWorldManager3d } from '@lagless/physics3d';
import { CharacterControllerManager } from '@lagless/character-controller-3d';
import { PhysicsRefs, PlayerLeft, PlayerResource } from '../schema/code-gen/index.js';

@ECSSystem()
export class PlayerLeaveSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _WorldManager: PhysicsWorldManager3d,
    private readonly _KCCManager: CharacterControllerManager,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, PlayerLeft);

    for (const rpc of rpcs) {
      const player = this._PlayerResources.get(PlayerResource, rpc.data.slot);
      const entity = player.safe.entity;

      // Remove physics body/collider
      const colliderHandle = this._PhysicsRefs.unsafe.colliderHandle[entity];
      const bodyHandle = this._PhysicsRefs.unsafe.bodyHandle[entity];
      this._WorldManager.unregisterCollider(colliderHandle);
      this._WorldManager.removeCollider(colliderHandle);
      this._WorldManager.removeBody(bodyHandle);

      // Remove KCC
      this._KCCManager.removeForEntity(entity);

      // Mark disconnected and remove entity
      player.safe.connected = 0;
      this._EntitiesManager.removeEntity(entity);
    }
  }
}
