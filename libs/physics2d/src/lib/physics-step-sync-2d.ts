import { BodyType } from '@lagless/physics-shared';
import { PhysicsWorldManager2d } from './physics-world-manager-2d.js';

export type { IPhysicsRefsComponent, IFilter } from '@lagless/physics-shared';
export { BodyType as BodyType2d } from '@lagless/physics-shared';

/** @deprecated Use IPhysicsRefsComponent instead */
export type { IPhysicsRefsComponent as IPhysicsBody2dComponent } from '@lagless/physics-shared';

export interface ITransform2dComponent {
  positionX: { get(entity: number): number; set(entity: number, v: number): void };
  positionY: { get(entity: number): number; set(entity: number, v: number): void };
  rotation: { get(entity: number): number; set(entity: number, v: number): void };
  prevPositionX: { get(entity: number): number; set(entity: number, v: number): void };
  prevPositionY: { get(entity: number): number; set(entity: number, v: number): void };
  prevRotation: { get(entity: number): number; set(entity: number, v: number): void };
}

export class PhysicsStepSync2d {
  static savePrevTransforms(filter: import('@lagless/physics-shared').IFilter, transform: ITransform2dComponent): void {
    for (let i = 0; i < filter.length; i++) {
      const e = filter.entities(i);
      transform.prevPositionX.set(e, transform.positionX.get(e));
      transform.prevPositionY.set(e, transform.positionY.get(e));
      transform.prevRotation.set(e, transform.rotation.get(e));
    }
  }

  static syncKinematicToRapier(
    filter: import('@lagless/physics-shared').IFilter,
    physicsRefs: import('@lagless/physics-shared').IPhysicsRefsComponent,
    transform: ITransform2dComponent,
    worldManager: PhysicsWorldManager2d,
  ): void {
    for (let i = 0; i < filter.length; i++) {
      const e = filter.entities(i);
      const type = physicsRefs.bodyType.get(e);
      if (type !== BodyType.KINEMATIC_POSITION && type !== BodyType.KINEMATIC_VELOCITY) continue;

      const body = worldManager.getBody(physicsRefs.bodyHandle.get(e));
      body.setNextKinematicTranslation({
        x: transform.positionX.get(e),
        y: transform.positionY.get(e),
      });
      body.setNextKinematicRotation(transform.rotation.get(e));
    }
  }

  static syncDynamicFromRapier(
    filter: import('@lagless/physics-shared').IFilter,
    physicsRefs: import('@lagless/physics-shared').IPhysicsRefsComponent,
    transform: ITransform2dComponent,
    worldManager: PhysicsWorldManager2d,
  ): void {
    for (let i = 0; i < filter.length; i++) {
      const e = filter.entities(i);
      const type = physicsRefs.bodyType.get(e);
      if (type !== BodyType.DYNAMIC) continue;

      const body = worldManager.getBody(physicsRefs.bodyHandle.get(e));
      const pos = body.translation();
      const rot = body.rotation();

      transform.positionX.set(e, pos.x);
      transform.positionY.set(e, pos.y);
      transform.rotation.set(e, rot);
    }
  }
}
