import { ECSConfig, ECSSystem, IECSSystem } from '@lagless/core';
import { MathOps } from '@lagless/math';
import { PhysicsWorldManager3d } from '@lagless/physics3d';
import { Transform3d, PhysicsRefs, CharacterState, CharacterFilter } from '../schema/code-gen/index.js';
import { CHARACTER_CONFIG } from '../config.js';

/**
 * Simplified movement system WITHOUT KCC — direct position updates.
 * Used for isolating desync sources.
 */
@ECSSystem()
export class SimpleMovementSystem implements IECSSystem {
  private readonly _dt: number;

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _CharacterFilter: CharacterFilter,
    private readonly _Transform3d: Transform3d,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _CharacterState: CharacterState,
    private readonly _WorldManager: PhysicsWorldManager3d,
  ) {
    this._dt = this._ECSConfig.frameLength / 1000;
  }

  public update(): void {
    const dt = this._dt;
    const cs = this._CharacterState.unsafe;
    const t = this._Transform3d.unsafe;
    const pr = this._PhysicsRefs.unsafe;
    const cfg = CHARACTER_CONFIG;

    for (const entity of this._CharacterFilter) {
      const moveX = cs.moveInputX[entity];
      const moveZ = cs.moveInputZ[entity];
      const isSprinting = cs.isSprinting[entity] !== 0;
      const facingYaw = cs.facingYaw[entity];

      // Target speed
      const inputLengthSq = moveX * moveX + moveZ * moveZ;
      const hasInput = inputLengthSq > 0.001;
      const targetSpeed = hasInput ? (isSprinting ? cfg.runSpeed : cfg.walkSpeed) : 0;

      // Accelerate/decelerate
      let currentSpeed = cs.currentSpeed[entity];
      if (targetSpeed > currentSpeed) {
        currentSpeed = Math.min(currentSpeed + cfg.acceleration * dt, targetSpeed);
      } else if (targetSpeed < currentSpeed) {
        currentSpeed = Math.max(currentSpeed - cfg.deceleration * dt, targetSpeed);
      }
      cs.currentSpeed[entity] = currentSpeed;

      // Movement direction
      let dirX = 0, dirZ = 0;
      if (hasInput && currentSpeed > 0.001) {
        const invLen = 1 / MathOps.sqrt(inputLengthSq);
        dirX = moveX * invLen;
        dirZ = moveZ * invLen;
      }

      // Gravity
      let vertVel = cs.verticalVelocity[entity];
      const grounded = cs.grounded[entity] !== 0;
      if (!grounded) {
        vertVel -= cfg.gravity * dt;
        if (vertVel < -cfg.maxFallSpeed) vertVel = -cfg.maxFallSpeed;
      } else if (vertVel < 0) {
        vertVel = 0;
      }
      cs.verticalVelocity[entity] = vertVel;

      // Direct position update (no KCC)
      let posX = t.positionX[entity] + dirX * currentSpeed * dt;
      let posY = t.positionY[entity] + vertVel * dt;
      let posZ = t.positionZ[entity] + dirZ * currentSpeed * dt;

      // Simple ground check at y=0
      if (posY <= 0) {
        posY = 0;
        cs.grounded[entity] = 1;
        cs.jumpCount[entity] = 0;
        if (vertVel < 0) {
          cs.verticalVelocity[entity] = 0;
        }
      } else {
        cs.grounded[entity] = posY <= 0.01 ? 1 : 0;
      }

      t.positionX[entity] = posX;
      t.positionY[entity] = posY;
      t.positionZ[entity] = posZ;

      // Sync to Rapier body
      const body = this._WorldManager.getBody(pr.bodyHandle[entity]);
      if (body) {
        body.setNextKinematicTranslation({ x: posX, y: posY, z: posZ });
      }

      // Character rotation
      const halfYaw = facingYaw * 0.5;
      const sinY = MathOps.sin(halfYaw);
      const cosY = MathOps.cos(halfYaw);
      t.rotationX[entity] = 0;
      t.rotationY[entity] = sinY;
      t.rotationZ[entity] = 0;
      t.rotationW[entity] = cosY;
      if (body) {
        body.setNextKinematicRotation({ x: 0, y: sinY, z: 0, w: cosY });
      }

      // Locomotion angle
      if (hasInput && currentSpeed > 0.001) {
        const moveAngle = MathOps.atan2(dirX, dirZ);
        let locoAngle = moveAngle - facingYaw;
        while (locoAngle > MathOps.PI) locoAngle -= MathOps.PI_2;
        while (locoAngle < -MathOps.PI) locoAngle += MathOps.PI_2;
        cs.locomotionAngle[entity] = locoAngle;
      } else {
        cs.locomotionAngle[entity] = 0;
      }
    }
  }
}
