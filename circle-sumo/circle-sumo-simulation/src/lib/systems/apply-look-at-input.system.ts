import { ECSSystem, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { LookAt, PlayerResource, Transform2d } from '../schema/code-gen/index.js';

@ECSSystem()
export class ApplyLookAtInputSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _PlayerResources: PlayerResources,
    private readonly _Transform2d: Transform2d,
  ) {
  }

  public update(tick: number): void {
    const rpcs = this._InputProvider.getTickRPCs(tick, LookAt);

    for (const moveRpc of rpcs) {
      const playerResource = this._PlayerResources.get(PlayerResource, moveRpc.meta.playerSlot);
      const playerEntity = playerResource?.safe.entity;
      this._Transform2d.unsafe.rotation[playerEntity] = moveRpc.data.direction;

      console.log(`ApplyLookAtInputSystem: playerSlot=${moveRpc.meta.playerSlot}, entity=${playerEntity}, direction=${moveRpc.data.direction.toFixed(2)}`);
    }
  }
}
