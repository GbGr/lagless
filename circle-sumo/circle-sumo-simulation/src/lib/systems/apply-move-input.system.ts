import { ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { Move, PendingImpulse, PlayerResource } from '../schema/code-gen/index.js';
import { MathOps, Vector2, VECTOR2_BUFFER_1 } from '@lagless/math';

const POWER_SCALE = 1;

@ECSSystem()
export class ApplyMoveInputSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PendingImpulse: PendingImpulse,
    private readonly _PlayerResources: PlayerResources,
  ) {
  }

  public update(tick: number): void {
    const rpcs = this._InputProvider.getTickRPCs(tick, Move);

    for (const moveRpc of rpcs) {
      const playerResource = this._PlayerResources.get(PlayerResource, moveRpc.meta.playerSlot);
      const playerEntity = playerResource?.safe.entity;
      const power = MathOps.clamp01(moveRpc.data.speed);
      Vector2.fromAngleToRef(moveRpc.data.direction, VECTOR2_BUFFER_1, power * POWER_SCALE);
      this._EntitiesManager.addComponent(playerEntity, PendingImpulse);
      this._PendingImpulse.unsafe.impulseX[playerEntity] = VECTOR2_BUFFER_1.x;
      this._PendingImpulse.unsafe.impulseY[playerEntity] = VECTOR2_BUFFER_1.y;

      console.log(`ApplyMoveInputSystem: playerSlot=${moveRpc.meta.playerSlot}, entity=${playerEntity}, direction=${moveRpc.data.direction.toFixed(2)}, speed=${moveRpc.data.speed.toFixed(2)}, impulse=(${VECTOR2_BUFFER_1.x.toFixed(2)}, ${VECTOR2_BUFFER_1.y.toFixed(2)})`);
    }
  }
}
