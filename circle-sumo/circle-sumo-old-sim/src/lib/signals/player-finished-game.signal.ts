import { ECSConfig, ECSSignal, PlayerResources, VerifiedSignal } from '@lagless/core';
import { PlayerResource } from '../schema/code-gen/index.js';

@ECSSignal()
export class PlayerFinishedGameSignal extends VerifiedSignal<{
  tick: number;
  playerSlot: number;
  score: number;
  mmrChange: number;
}> {
  private readonly _playerResources: PlayerResource[];

  constructor(private readonly _ECSConfig: ECSConfig, private readonly _PlayerResources: PlayerResources) {
    super();
    this._playerResources = new Array<PlayerResource>();
    for (let i = 0; i < this._ECSConfig.maxPlayers; i++) {
      this._playerResources.push(this._PlayerResources.get(PlayerResource, i));
    }
  }

  public override update(tick: number) {
    if (tick <= 0) return undefined;
    for (let playerSlot = 0; playerSlot < this._playerResources.length; playerSlot++) {
      const playerResource = this._playerResources[playerSlot];
      if (playerResource.safe.finishedAtTick === tick) {
        return {
          tick,
          playerSlot,
          score: playerResource.safe.score,
          mmrChange: playerResource.safe.mmrChange,
        };
      }
    }

    return undefined;
  }
}
