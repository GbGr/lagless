import { ECSConfig, ECSSystem, IECSSystem, PlayerResources } from '@lagless/core';
import { GameState, PlayerResource } from '../schema/code-gen/index.js';
import { GameOverSignal, PlayerFinishedGameSignal } from '../signals/index.js';
import { calculateScore } from '../gameplay.js';

@ECSSystem()
export class GameEventsSystem implements IECSSystem {
  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _GameState: GameState,
    private readonly _PlayerResources: PlayerResources,
    private readonly _GameOverSignal: GameOverSignal,
    private readonly _PlayerFinishedGameSignal: PlayerFinishedGameSignal,
  ) {}

  public update(tick: number): void {
    // Game Over
    if (this._GameState.safe.finishedAtTick === tick) {
      this._GameOverSignal.emit(tick, {
        data: 0
      });
    }

    // Player Finished
    for (let slot = 0; slot < this._ECSConfig.maxPlayers; slot++) {
      const player = this._PlayerResources.get(PlayerResource, slot);
      if (player.safe.finishedAtTick === tick) {
        this._PlayerFinishedGameSignal.emit(tick, {
          tick,
          verifiedTick: tick + this._ECSConfig.maxInputDelayTick,
          playerSlot: slot,
          kills: player.safe.kills,
          score: calculateScore(
            player.safe.kills,
            player.safe.assists,
            player.safe.positionInTop,
          ),
          mmrChange: player.safe.mmrChange,
        });
      }
    }
  }
}
