import {
  ECSSystem,
  EntitiesManager,
  IECSSystem,
  InputProvider,
  PlayerResources,
} from '@lagless/core';
import { PlayerLeft, PlayerResource } from '../schema/code-gen/index.js';

@ECSSystem()
export class PlayerLeaveSystem implements IECSSystem {

  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
  ) {
  }

  public update(tick: number): void {
    const leaveRPCs = this._InputProvider.getTickRPCs(tick, PlayerLeft);

    for (const rpc of leaveRPCs) {
      const player = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      this._EntitiesManager.removeEntity(player.safe.entity);
    }
  }
}
