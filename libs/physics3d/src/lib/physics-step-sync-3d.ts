import { PhysicsWorldManager3d } from './physics-world-manager-3d.js';

/**
 * Utility interface for components used in physics sync.
 * Game codegen will produce concrete classes matching this shape.
 */
export interface ITransform3dComponent {
  positionX: { get(entity: number): number; set(entity: number, v: number): void };
  positionY: { get(entity: number): number; set(entity: number, v: number): void };
  positionZ: { get(entity: number): number; set(entity: number, v: number): void };
  rotationX: { get(entity: number): number; set(entity: number, v: number): void };
  rotationY: { get(entity: number): number; set(entity: number, v: number): void };
  rotationZ: { get(entity: number): number; set(entity: number, v: number): void };
  rotationW: { get(entity: number): number; set(entity: number, v: number): void };
  prevPositionX: { get(entity: number): number; set(entity: number, v: number): void };
  prevPositionY: { get(entity: number): number; set(entity: number, v: number): void };
  prevPositionZ: { get(entity: number): number; set(entity: number, v: number): void };
  prevRotationX: { get(entity: number): number; set(entity: number, v: number): void };
  prevRotationY: { get(entity: number): number; set(entity: number, v: number): void };
  prevRotationZ: { get(entity: number): number; set(entity: number, v: number): void };
  prevRotationW: { get(entity: number): number; set(entity: number, v: number): void };
}

export interface IPhysicsBody3dComponent {
  bodyHandle: { get(entity: number): number; set(entity: number, v: number): void };
  bodyType: { get(entity: number): number; set(entity: number, v: number): void };
  colliderHandle: { get(entity: number): number; set(entity: number, v: number): void };
}

export interface IFilter {
  readonly length: number;
  entities(index: number): number;
}

/** Body type constants matching the auto-generated PhysicsBody3d.bodyType field. */
export const BodyType3d = {
  DYNAMIC: 0,
  FIXED: 1,
  KINEMATIC_POSITION: 2,
  KINEMATIC_VELOCITY: 3,
} as const;

export class PhysicsStepSync3d {
  /**
   * Save current transform positions into prev fields for interpolation.
   * Call BEFORE stepping the physics world.
   */
  static savePrevTransforms(filter: IFilter, transform: ITransform3dComponent): void {
    for (let i = 0; i < filter.length; i++) {
      const e = filter.entities(i);
      transform.prevPositionX.set(e, transform.positionX.get(e));
      transform.prevPositionY.set(e, transform.positionY.get(e));
      transform.prevPositionZ.set(e, transform.positionZ.get(e));
      transform.prevRotationX.set(e, transform.rotationX.get(e));
      transform.prevRotationY.set(e, transform.rotationY.get(e));
      transform.prevRotationZ.set(e, transform.rotationZ.get(e));
      transform.prevRotationW.set(e, transform.rotationW.get(e));
    }
  }

  /**
   * Write ECS positions to Rapier for kinematic bodies.
   * Call BEFORE stepping the physics world.
   */
  static syncKinematicToRapier(
    filter: IFilter,
    physicsBody: IPhysicsBody3dComponent,
    transform: ITransform3dComponent,
    worldManager: PhysicsWorldManager3d,
  ): void {
    for (let i = 0; i < filter.length; i++) {
      const e = filter.entities(i);
      const type = physicsBody.bodyType.get(e);
      if (type !== BodyType3d.KINEMATIC_POSITION && type !== BodyType3d.KINEMATIC_VELOCITY) continue;

      const body = worldManager.getBody(physicsBody.bodyHandle.get(e));
      body.setNextKinematicTranslation({
        x: transform.positionX.get(e),
        y: transform.positionY.get(e),
        z: transform.positionZ.get(e),
      });
      body.setNextKinematicRotation({
        x: transform.rotationX.get(e),
        y: transform.rotationY.get(e),
        z: transform.rotationZ.get(e),
        w: transform.rotationW.get(e),
      });
    }
  }

  /**
   * Read Rapier positions back to ECS for dynamic bodies.
   * Call AFTER stepping the physics world.
   */
  static syncDynamicFromRapier(
    filter: IFilter,
    physicsBody: IPhysicsBody3dComponent,
    transform: ITransform3dComponent,
    worldManager: PhysicsWorldManager3d,
  ): void {
    for (let i = 0; i < filter.length; i++) {
      const e = filter.entities(i);
      const type = physicsBody.bodyType.get(e);
      if (type !== BodyType3d.DYNAMIC) continue;

      const body = worldManager.getBody(physicsBody.bodyHandle.get(e));
      const pos = body.translation();
      const rot = body.rotation();

      transform.positionX.set(e, pos.x);
      transform.positionY.set(e, pos.y);
      transform.positionZ.set(e, pos.z);
      transform.rotationX.set(e, rot.x);
      transform.rotationY.set(e, rot.y);
      transform.rotationZ.set(e, rot.z);
      transform.rotationW.set(e, rot.w);
    }
  }
}
