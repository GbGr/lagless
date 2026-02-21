import { ECSConfig, ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources, Prefab } from '@lagless/core';
import { PlayerBody, PlayerJoined, PlayerResource, Transform2d, Velocity2d } from '../schema/code-gen/index.js';
import { SyncTestArena } from '../arena.js';

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  private readonly _playerPrefab = Prefab.create()
    .with(Transform2d)
    .with(Velocity2d)
    .with(PlayerBody, { radius: SyncTestArena.playerRadius });

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _Transform2d: Transform2d,
    private readonly _PlayerBody: PlayerBody,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.getTickRPCs(tick, PlayerJoined);
    const maxPlayers = this._ECSConfig.maxPlayers;
    const spacing = SyncTestArena.width * 0.5 / Math.max(maxPlayers, 1);

    for (const rpc of rpcs) {
      const slot = rpc.data.slot;
      const entity = this._EntitiesManager.createEntity(this._playerPrefab);

      this._PlayerBody.unsafe.playerSlot[entity] = slot;

      const spawnX = SyncTestArena.width * 0.25 + slot * spacing;
      const spawnY = SyncTestArena.height * 0.5;
      this._Transform2d.unsafe.positionX[entity] = spawnX;
      this._Transform2d.unsafe.positionY[entity] = spawnY;
      this._Transform2d.unsafe.prevPositionX[entity] = spawnX;
      this._Transform2d.unsafe.prevPositionY[entity] = spawnY;

      const playerResource = this._PlayerResources.get(PlayerResource, slot);
      playerResource.safe.entity = entity;
      playerResource.safe.connected = 1;
      for (let i = 0; i < rpc.data.playerId.length; i++) {
        playerResource.unsafe.id[i] = rpc.data.playerId[i];
      }
    }
  }
}
