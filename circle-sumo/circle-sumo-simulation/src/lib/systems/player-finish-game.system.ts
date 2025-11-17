import { ECSConfig, ECSSystem, IECSSystem, PlayerResources } from '@lagless/core';
import { GameState, PlayerResource } from '../schema/code-gen/index.js';

@ECSSystem()
export class PlayerFinishGameSystem implements IECSSystem {
  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _PlayerResources: PlayerResources,
    private readonly _GameState: GameState
  ) {}

  public update(tick: number): void {
    if (this._GameState.safe.finishedAtTick !== 0) return;

    for (let playerSlot = 0; playerSlot < this._ECSConfig.maxPlayers; playerSlot++) {
      const playerResource = this._PlayerResources.get(PlayerResource, playerSlot);
      if (playerResource.safe.connected === 0 || playerResource.safe.finishedAtTick !== 0) {
        continue;
      }

      //   FAKE LOGIC
      const playerFinishTick = 1000 + playerSlot * 100;

      if (tick >= playerFinishTick) {
        playerResource.safe.finishedAtTick = tick;
        playerResource.safe.mmrChange = 1;
        playerResource.safe.score = 1;
        console.log(`Player ${playerSlot} finished at tick ${tick}`, playerResource);
      }
    }
  }
}
