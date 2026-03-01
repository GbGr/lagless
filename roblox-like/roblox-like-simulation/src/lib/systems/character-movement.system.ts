import { ECSConfig, ECSSystem } from '@lagless/core';
import { PhysicsWorldManager3d } from '@lagless/physics3d';
import type { IFilter } from '@lagless/physics-shared';
import { AbstractCharacterControllerSystem, CharacterControllerManager } from '@lagless/character-controller-3d';
import type { ICharacterStateComponent } from '@lagless/character-controller-3d';
import type { ITransform3dComponent, IPhysicsRefsComponent } from '@lagless/physics3d';
import { Transform3d, PhysicsRefs, CharacterState, CharacterFilter } from '../schema/code-gen/index.js';
import { CHARACTER_CONFIG } from '../config.js';

const field = (arr: { [i: number]: number }) => ({
  get(entity: number): number { return arr[entity]; },
  set(entity: number, v: number): void { arr[entity] = v; },
});

@ECSSystem()
export class CharacterMovementSystem extends AbstractCharacterControllerSystem {
  constructor(
    ecsConfig: ECSConfig,
    characterFilter: CharacterFilter,
    transform3d: Transform3d,
    physicsRefs: PhysicsRefs,
    characterState: CharacterState,
    worldManager: PhysicsWorldManager3d,
    kccManager: CharacterControllerManager,
  ) {
    const cs = characterState.unsafe;
    const t = transform3d.unsafe;
    const pr = physicsRefs.unsafe;

    const csAdapter: ICharacterStateComponent = {
      verticalVelocity: field(cs.verticalVelocity), grounded: field(cs.grounded),
      currentSpeed: field(cs.currentSpeed), jumpCount: field(cs.jumpCount),
      moveInputX: field(cs.moveInputX), moveInputZ: field(cs.moveInputZ),
      isSprinting: field(cs.isSprinting), facingYaw: field(cs.facingYaw),
      locomotionAngle: field(cs.locomotionAngle),
    };

    const tAdapter: ITransform3dComponent = {
      positionX: field(t.positionX), positionY: field(t.positionY), positionZ: field(t.positionZ),
      rotationX: field(t.rotationX), rotationY: field(t.rotationY),
      rotationZ: field(t.rotationZ), rotationW: field(t.rotationW),
      prevPositionX: field(t.prevPositionX), prevPositionY: field(t.prevPositionY),
      prevPositionZ: field(t.prevPositionZ), prevRotationX: field(t.prevRotationX),
      prevRotationY: field(t.prevRotationY), prevRotationZ: field(t.prevRotationZ),
      prevRotationW: field(t.prevRotationW),
    };

    const prAdapter: IPhysicsRefsComponent = {
      bodyHandle: field(pr.bodyHandle), bodyType: field(pr.bodyType),
      colliderHandle: field(pr.colliderHandle), collisionLayer: field(pr.collisionLayer),
    };

    const filterAdapter: IFilter = {
      get length() { return characterFilter.length; },
      entities: (i: number) => (characterFilter as any)._entities[i],
    };

    super(CHARACTER_CONFIG, ecsConfig, filterAdapter, tAdapter, prAdapter, csAdapter, worldManager, kccManager);
  }
}
