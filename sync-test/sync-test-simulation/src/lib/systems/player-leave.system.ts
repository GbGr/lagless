import { ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { PlayerLeft, PlayerResource } from '../schema/code-gen/index.js';

@ECSSystem()
export class PlayerLeaveSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, PlayerLeft);

    for (const rpc of rpcs) {
      const player = this._PlayerResources.get(PlayerResource, rpc.data.slot);
      player.safe.connected = 0;
      this._EntitiesManager.removeEntity(player.safe.entity);
    }
  }
}
