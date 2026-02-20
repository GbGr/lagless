import { ECSConfig, ECSSystem, IECSSystem, PlayerResources } from '@lagless/core';
import { GameState, PlayerResource, Velocity2d, Velocity2dFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class FinishGameSystem implements IECSSystem {
  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _PlayerResources: PlayerResources,
    private readonly _GameState: GameState,
    private readonly _Velocity2d: Velocity2d,
    private readonly _Velocity2dFilter: Velocity2dFilter,
  ) {}

  public update(tick: number): void {
    return;
    if (tick < 500) return;
    if (this._GameState.safe.finishedAtTick !== 0) return;

    let activePlayers = 0;
    let lastActivePlayerSlot = -1;
    for (let playerSlot = 0; playerSlot < this._ECSConfig.maxPlayers; playerSlot++) {
      const playerResource = this._PlayerResources.get(PlayerResource, playerSlot);
      if (playerResource.safe.connected === 1 && playerResource.safe.finishedAtTick === 0) {
        activePlayers++;
        lastActivePlayerSlot = playerSlot;
      }
    }

    if (activePlayers === 1) {
      this._GameState.safe.finishedAtTick = tick;
      this._GameState.safe.playerFinishedCount++;
      const winnerPlayerResource = this._PlayerResources.get(PlayerResource, lastActivePlayerSlot);
      winnerPlayerResource.safe.positionInTop = 1;
      winnerPlayerResource.safe.finishedAtTick = tick;
      for (const velocityEntity of this._Velocity2dFilter) {
        this._Velocity2d.unsafe.velocityX[velocityEntity] = 0;
        this._Velocity2d.unsafe.velocityY[velocityEntity] = 0;
      }
      console.log(`Game finished at tick ${tick}`);
    }
  }
}
