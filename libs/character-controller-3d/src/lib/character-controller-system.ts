import { MathOps } from '@lagless/math';
import type { IFilter, IPhysicsRefsComponent, ITransform3dComponent, PhysicsWorldManager3d } from '@lagless/physics3d';
import type { ECSConfig, IECSSystem } from '@lagless/core';
import { CharacterControllerConfig } from './character-controller-config.js';
import { CharacterControllerManager } from './character-controller-manager.js';
import { ICharacterStateComponent } from './character-controller-interfaces.js';

/**
 * Abstract character controller system. Game extends this with codegen types.
 *
 * Handles: acceleration/deceleration, gravity, jump, Rapier KCC collision,
 * Transform3d update, grounded detection, facing yaw, locomotion angle.
 */
export abstract class AbstractCharacterControllerSystem implements IECSSystem {
  protected readonly _frameLengthSec: number;

  constructor(
    protected readonly _config: CharacterControllerConfig,
    protected readonly _ecsConfig: ECSConfig,
    protected readonly _filter: IFilter,
    protected readonly _transform: ITransform3dComponent,
    protected readonly _physicsRefs: IPhysicsRefsComponent,
    protected readonly _characterState: ICharacterStateComponent,
    protected readonly _worldManager: PhysicsWorldManager3d,
    protected readonly _kccManager: CharacterControllerManager,
  ) {
    this._frameLengthSec = this._ecsConfig.frameLength / 1000;
  }

  public update(_tick: number): void {
    const dt = this._frameLengthSec;
    for (let i = 0; i < this._filter.length; i++) {
      const entity = this._filter.entities(i);
      this.updateEntity(entity, dt);
    }
  }

  protected updateEntity(entity: number, dt: number): void {
    const cs = this._characterState;
    const moveX = cs.moveInputX.get(entity);
    const moveZ = cs.moveInputZ.get(entity);
    const isSprinting = cs.isSprinting.get(entity) !== 0;
    const facingYaw = cs.facingYaw.get(entity);

    // --- Target speed ---
    const inputLengthSq = moveX * moveX + moveZ * moveZ;
    const hasInput = inputLengthSq > 0.001;
    const targetSpeed = hasInput ? (isSprinting ? this._config.runSpeed : this._config.walkSpeed) : 0;

    // --- Accelerate/decelerate ---
    let currentSpeed = cs.currentSpeed.get(entity);
    if (targetSpeed > currentSpeed) {
      currentSpeed = Math.min(currentSpeed + this._config.acceleration * dt, targetSpeed);
    } else if (targetSpeed < currentSpeed) {
      currentSpeed = Math.max(currentSpeed - this._config.deceleration * dt, targetSpeed);
    }
    cs.currentSpeed.set(entity, currentSpeed);

    // --- Compute movement direction (world space, already in moveInputX/Z) ---
    let dirX = 0, dirZ = 0;
    if (hasInput && currentSpeed > 0.001) {
      const invLen = 1 / MathOps.sqrt(inputLengthSq);
      dirX = moveX * invLen;
      dirZ = moveZ * invLen;
    }

    // --- Gravity ---
    let vertVel = cs.verticalVelocity.get(entity);
    const grounded = cs.grounded.get(entity) !== 0;
    if (!grounded) {
      vertVel -= this._config.gravity * dt;
      if (vertVel < -this._config.maxFallSpeed) vertVel = -this._config.maxFallSpeed;
    } else if (vertVel < 0) {
      vertVel = 0;
    }
    cs.verticalVelocity.set(entity, vertVel);

    // --- Desired displacement ---
    const desiredX = dirX * currentSpeed * dt;
    const desiredY = vertVel * dt;
    const desiredZ = dirZ * currentSpeed * dt;

    // --- KCC movement ---
    const kcc = this._kccManager.getForEntity(entity);
    if (!kcc) return;

    const colliderHandle = this._physicsRefs.colliderHandle.get(entity);
    const collider = this._worldManager.getCollider(colliderHandle);
    if (!collider) return;

    kcc.computeColliderMovement(collider, { x: desiredX, y: desiredY, z: desiredZ });
    const computed = kcc.computedMovement();
    const newGrounded = kcc.computedGrounded();

    // --- Apply to Transform3d ---
    const posX = this._transform.positionX.get(entity) + computed.x;
    const posY = this._transform.positionY.get(entity) + computed.y;
    const posZ = this._transform.positionZ.get(entity) + computed.z;
    this._transform.positionX.set(entity, posX);
    this._transform.positionY.set(entity, posY);
    this._transform.positionZ.set(entity, posZ);

    // --- Sync to Rapier body ---
    const bodyHandle = this._physicsRefs.bodyHandle.get(entity);
    const body = this._worldManager.getBody(bodyHandle);
    if (body) {
      body.setNextKinematicTranslation({ x: posX, y: posY, z: posZ });
    }

    // --- Update grounded ---
    cs.grounded.set(entity, newGrounded ? 1 : 0);
    if (newGrounded) {
      cs.jumpCount.set(entity, 0);
      if (vertVel < 0) {
        cs.verticalVelocity.set(entity, 0);
      }
    }

    // --- Character rotation = camera yaw ---
    const halfYaw = facingYaw * 0.5;
    const sinY = MathOps.sin(halfYaw);
    const cosY = MathOps.cos(halfYaw);
    this._transform.rotationX.set(entity, 0);
    this._transform.rotationY.set(entity, sinY);
    this._transform.rotationZ.set(entity, 0);
    this._transform.rotationW.set(entity, cosY);
    if (body) {
      body.setNextKinematicRotation({ x: 0, y: sinY, z: 0, w: cosY });
    }

    // --- Locomotion angle (movement direction relative to facing, for animation) ---
    if (hasInput && currentSpeed > 0.001) {
      const moveAngle = MathOps.atan2(dirX, dirZ);
      let locoAngle = moveAngle - facingYaw;
      // Normalize to -PI..PI
      while (locoAngle > MathOps.PI) locoAngle -= MathOps.PI_2;
      while (locoAngle < -MathOps.PI) locoAngle += MathOps.PI_2;
      cs.locomotionAngle.set(entity, locoAngle);
    } else {
      cs.locomotionAngle.set(entity, 0);
    }
  }

  /**
   * Called from game systems (e.g. ApplyCharacterInputSystem) when jump is requested.
   * Checks grounded + jumpCount, applies vertical velocity.
   */
  public tryJump(entity: number): boolean {
    const cs = this._characterState;
    const grounded = cs.grounded.get(entity) !== 0;
    const jumpCount = cs.jumpCount.get(entity);

    if (!grounded && jumpCount >= this._config.maxJumps) return false;

    cs.verticalVelocity.set(entity, this._config.jumpForce);
    cs.jumpCount.set(entity, jumpCount + 1);
    cs.grounded.set(entity, 0);
    return true;
  }
}
