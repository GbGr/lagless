import { ECSConfig, ECSSystem, IECSSystem, PlayerResources } from '@lagless/core';
import { GameState, PlayerResource } from '../schema/code-gen/index.js';

@ECSSystem()
export class FinishGameSystem implements IECSSystem {
  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _PlayerResources: PlayerResources,
    private readonly _GameState: GameState,
  ) {
  }

  public update(tick: number): void {
    if (tick < 500) return;
    if (this._GameState.safe.finishedAtTick !== 0) return;

    let allFinished = true;
    for (let playerSlot = 0; playerSlot < this._ECSConfig.maxPlayers; playerSlot++) {
      const playerResource = this._PlayerResources.get(PlayerResource, playerSlot);
      if (playerResource.safe.connected === 1 && playerResource.safe.finishedAtTick === 0) {
        allFinished = false;
        break;
      }
    }

    if (allFinished) {
      this._GameState.safe.finishedAtTick = tick;
      console.log(`Game finished at tick ${tick}`);
    }
  }
}
