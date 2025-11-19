import {
  ECSConfig,
  ECSSystem,
  EntitiesManager,
  IECSSystem,
  InputProvider,
  PlayerResources,
  Prefab,
} from '@lagless/core';
import { CircleBody, PlayerJoined, PlayerResource, Transform2d, Velocity2d } from '../schema/code-gen/index.js';
import { MathOps } from '@lagless/math';
import { CircleSumoArena } from '../map.js';

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  private readonly _playerPrefab = Prefab.create()
    .with(Transform2d)
    .with(Velocity2d)
    .with(CircleBody, { angularDamping: 0.001, linearDamping: 0.0005, mass: 1, radius: CircleSumoArena.playerRadius });

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _Transform2d: Transform2d,
    private readonly _CircleBody: CircleBody,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources
  ) {}

  public update(tick: number): void {
    const playerJoinedRPC = this._InputProvider.getTickRPCs(tick, PlayerJoined);
    const maxPlayers = this._ECSConfig.maxPlayers;
    // place players in a circle around the origin
    const angleStep = MathOps.PI_2 / maxPlayers;

    for (const rpc of playerJoinedRPC) {
      const lookOriginAngle = angleStep * rpc.meta.playerSlot + MathOps.PI;
      const playerEntity = this._EntitiesManager.createEntity(this._playerPrefab);

      this._CircleBody.unsafe.playerSlot[playerEntity] = rpc.meta.playerSlot;

      this._Transform2d.unsafe.positionX[playerEntity] = MathOps.cos(angleStep * rpc.meta.playerSlot) * 250;
      this._Transform2d.unsafe.positionY[playerEntity] = MathOps.sin(angleStep * rpc.meta.playerSlot) * 250;
      this._Transform2d.unsafe.rotation[playerEntity] = lookOriginAngle;

      const playerResource = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      playerResource.safe.entity = playerEntity;
      playerResource.safe.connected = 1;
      for (let i = 0; i < rpc.data.playerId.length; i++) {
        playerResource.unsafe.id[i] = rpc.data.playerId[i];
      }
    }
  }
}
