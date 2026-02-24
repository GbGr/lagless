import { ECSSystem, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { PlayerJoined, PlayerResource } from '../schema/code-gen/index.js';

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _PlayerResources: PlayerResources,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, PlayerJoined);

    for (const rpc of rpcs) {
      const slot = rpc.data.slot;
      const playerResource = this._PlayerResources.get(PlayerResource as any, slot)!;
      (playerResource as any).safe.connected = 1;
      for (let i = 0; i < rpc.data.playerId.length; i++) {
        (playerResource as any).unsafe.id[i] = rpc.data.playerId[i];
      }
    }
  }
}
