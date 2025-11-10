import { ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources, Prefab, PRNG } from '@lagless/core';
import { PlayerJoined, PlayerResource, Transform2d, Velocity2d } from '../schema/code-gen/index.js';

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  private readonly _playerPrefab = Prefab.create().with(Transform2d).with(Velocity2d);

  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _Transform2d: Transform2d,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PRNG: PRNG,
    private readonly _PlayerResources: PlayerResources,
  ) {
  }

  public update(tick: number): void {
    const playerJoinedRPC = this._InputProvider.getTickRPCs(tick, PlayerJoined);

    for (const rpc of playerJoinedRPC) {
      const playerEntity = this._EntitiesManager.createEntity(this._playerPrefab);
      this._Transform2d.unsafe.positionX[playerEntity] = 1280 / 2 + this._PRNG.getFloat() * 200 - 100;
      this._Transform2d.unsafe.positionY[playerEntity] = -1280 / 2 + this._PRNG.getFloat() * 200 - 100;

      const playerResource = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      playerResource.unsafe.entity[0] = playerEntity;
      for (let i = 0; i < rpc.data.playerId.length; i++) {
        playerResource.unsafe.id[i] = rpc.data.playerId[i]
      }

      console.log(`Player joined: slot ${rpc.meta.playerSlot}, id ${rpc.data.playerId}, entity ${playerEntity}`);
    }
  }
}
