import {
  ECSConfig,
  ECSSystem,
  EntitiesManager,
  IECSSystem,
  InputProvider,
  PlayerResources,
  Prefab,
  PRNG,
} from '@lagless/core';
import {
  Bot, CircleBody, GameState, PlayerJoined, PlayerResource, Skin, Transform2d, Velocity2d
} from '../schema/code-gen/index.js';
import { MathOps } from '@lagless/math';
import { CircleSumoArena } from '../map.js';
import { UUID } from '@lagless/misc';

export const START_GAME_DELAY_TICKS = 200;

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  private readonly _playerPrefab = Prefab.create()
    .with(Transform2d)
    .with(Velocity2d)
    .with(Skin)
    .with(CircleBody, { angularDamping: 0.001, linearDamping: 0.0005, mass: 1, radius: CircleSumoArena.playerRadius });

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _Transform2d: Transform2d,
    private readonly _CircleBody: CircleBody,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _PRNG: PRNG,
    private readonly _Bot: Bot,
    private readonly _GameState: GameState,
    private readonly _Skin: Skin,
  ) {}

  public update(tick: number): void {
    const playerJoinedRPC = this._InputProvider.getTickRPCs(tick, PlayerJoined);
    const maxPlayers = this._ECSConfig.maxPlayers;
    // place players in a circle around the origin
    const angleStep = MathOps.PI_2 / maxPlayers;
    let hasNewPlayer = false;

    for (const rpc of playerJoinedRPC) {
      hasNewPlayer = true;
      const lookOriginAngle = angleStep * rpc.meta.playerSlot + MathOps.PI;
      const playerEntity = this._EntitiesManager.createEntity(this._playerPrefab);

      const isMasked = UUID.isMaskedUint8(rpc.data.playerId);

      if (isMasked) {
        // Bot player
        this._EntitiesManager.addComponent(playerEntity, Bot);
        this._Bot.unsafe.nextDecisionTick[playerEntity] = tick + this._PRNG.getRandomIntInclusive(START_GAME_DELAY_TICKS, START_GAME_DELAY_TICKS + 30);
        this._Bot.unsafe.aggressiveness[playerEntity] = this._PRNG.getFloat53();
      }

      this._CircleBody.unsafe.playerSlot[playerEntity] = rpc.meta.playerSlot;
      this._Skin.unsafe.skinId[playerEntity] = rpc.data.skinId;

      this._Transform2d.unsafe.positionX[playerEntity] = MathOps.cos(angleStep * rpc.meta.playerSlot) * 350;
      this._Transform2d.unsafe.positionY[playerEntity] = MathOps.sin(angleStep * rpc.meta.playerSlot) * 350;
      this._Transform2d.unsafe.rotation[playerEntity] = lookOriginAngle;


      const playerResource = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      playerResource.safe.entity = playerEntity;
      playerResource.safe.connected = 1;
      playerResource.safe.initialRotation = lookOriginAngle + MathOps.PI;
      for (let i = 0; i < rpc.data.playerId.length; i++) {
        playerResource.unsafe.id[i] = rpc.data.playerId[i];
      }
    }

    if (hasNewPlayer) {
      this._GameState.safe.startedAtTick = tick + START_GAME_DELAY_TICKS;
    }
  }
}
