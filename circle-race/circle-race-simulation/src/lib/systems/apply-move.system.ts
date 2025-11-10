import {
  ECSConfig,
  ECSSimulation,
  ECSSystem,
  EntitiesManager,
  IECSSystem,
  InputProvider,
  PlayerResources,
} from '@lagless/core';
import { Move, PlayerResource, Velocity2d } from '../schema/code-gen/index.js';
import { MathOps, Vector2, VECTOR2_BUFFER_1 } from '@lagless/math';

@ECSSystem()
export class ApplyMoveSystem implements IECSSystem {
  private readonly _frameLength: number;

  constructor(
    private readonly _config: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _Velocity2d: Velocity2d,
    private readonly _ECSSimulation: ECSSimulation,
  ) {
    this._frameLength = this._config.frameLength;
  }

  public update(tick: number): void {
    const moveRPCs = this._InputProvider.getTickRPCs(tick, Move);

    for (const rpc of moveRPCs) {
      const player = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      const playerEntity = player.unsafe.entity[0];

      if (!this._EntitiesManager.hasComponent(playerEntity, Velocity2d)) throw new Error('Missing Velocity2d component');

      Vector2.fromAngleToRef(rpc.data.direction, VECTOR2_BUFFER_1, MathOps.clamp01(rpc.data.speed) * this._frameLength);

      this._Velocity2d.unsafe.velocityX[playerEntity] = VECTOR2_BUFFER_1.x;
      this._Velocity2d.unsafe.velocityY[playerEntity] = VECTOR2_BUFFER_1.y;

      console.log(`MOVE RPC at ${tick} seq{${rpc.meta.seq} [${this._ECSSimulation.mem.getHash()}]`);
    }
  }
}
