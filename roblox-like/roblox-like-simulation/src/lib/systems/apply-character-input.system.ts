import { ECSSystem, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { MathOps } from '@lagless/math';
import { CharacterMove, CharacterState, CharacterFilter, PlayerResource } from '../schema/code-gen/index.js';

const finite = (v: number): number => Number.isFinite(v) ? v : 0;

@ECSSystem()
export class ApplyCharacterInputSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _PlayerResources: PlayerResources,
    private readonly _CharacterState: CharacterState,
    private readonly _CharacterFilter: CharacterFilter,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, CharacterMove);
    const cs = this._CharacterState.unsafe;

    // Clear transient input each tick — if no RPC arrives, the character decelerates to stop
    for (const entity of this._CharacterFilter) {
      cs.moveInputX[entity] = 0;
      cs.moveInputZ[entity] = 0;
      cs.isSprinting[entity] = 0;
    }

    for (const rpc of rpcs) {
      const playerResource = this._PlayerResources.get(PlayerResource, rpc.meta.playerSlot);
      const entity = playerResource.safe.entity;
      if (playerResource.safe.connected === 0) continue;

      // Sanitize input: reject NaN/Infinity, clamp direction to [-1, 1]
      const dirX = MathOps.clamp(finite(rpc.data.directionX), -1, 1);
      const dirZ = MathOps.clamp(finite(rpc.data.directionZ), -1, 1);
      const cameraYaw = finite(rpc.data.cameraYaw);

      // Transform camera-relative direction to world-space
      const cosYaw = MathOps.cos(cameraYaw);
      const sinYaw = MathOps.sin(cameraYaw);
      const worldX = dirX * cosYaw + dirZ * sinYaw;
      const worldZ = -dirX * sinYaw + dirZ * cosYaw;

      cs.moveInputX[entity] = worldX;
      cs.moveInputZ[entity] = worldZ;
      cs.facingYaw[entity] = cameraYaw;
      cs.isSprinting[entity] = rpc.data.sprint;

      // Jump
      if (rpc.data.jump) {
        this._tryJump(entity);
      }
    }
  }

  private _tryJump(entity: number): void {
    const cs = this._CharacterState.unsafe;
    const grounded = cs.grounded[entity] !== 0;
    const jumpCount = cs.jumpCount[entity];

    // Allow jump if grounded or haven't exceeded max jumps
    if (!grounded && jumpCount >= 1) return;

    cs.verticalVelocity[entity] = 8; // jumpForce from CHARACTER_CONFIG
    cs.jumpCount[entity] = jumpCount + 1;
    cs.grounded[entity] = 0;
  }
}
