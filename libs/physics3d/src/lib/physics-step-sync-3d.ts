import { BodyType } from '@lagless/physics-shared';
import { PhysicsWorldManager3d } from './physics-world-manager-3d.js';

export type { IPhysicsRefsComponent, IFilter } from '@lagless/physics-shared';
export { BodyType as BodyType3d } from '@lagless/physics-shared';

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

const _vec3 = { x: 0, y: 0, z: 0 };
const _quat = { x: 0, y: 0, z: 0, w: 1 };

export class PhysicsStepSync3d {
  static savePrevTransforms(filter: import('@lagless/physics-shared').IFilter, transform: ITransform3dComponent): void {
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

  static syncKinematicToRapier(
    filter: import('@lagless/physics-shared').IFilter,
    physicsRefs: import('@lagless/physics-shared').IPhysicsRefsComponent,
    transform: ITransform3dComponent,
    worldManager: PhysicsWorldManager3d,
  ): void {
    for (let i = 0; i < filter.length; i++) {
      const e = filter.entities(i);
      const type = physicsRefs.bodyType.get(e);
      if (type !== BodyType.KINEMATIC_POSITION && type !== BodyType.KINEMATIC_VELOCITY) continue;

      const body = worldManager.getBody(physicsRefs.bodyHandle.get(e));
      _vec3.x = transform.positionX.get(e);
      _vec3.y = transform.positionY.get(e);
      _vec3.z = transform.positionZ.get(e);
      body.setNextKinematicTranslation(_vec3);
      _quat.x = transform.rotationX.get(e);
      _quat.y = transform.rotationY.get(e);
      _quat.z = transform.rotationZ.get(e);
      _quat.w = transform.rotationW.get(e);
      body.setNextKinematicRotation(_quat);
    }
  }

  static syncDynamicFromRapier(
    filter: import('@lagless/physics-shared').IFilter,
    physicsRefs: import('@lagless/physics-shared').IPhysicsRefsComponent,
    transform: ITransform3dComponent,
    worldManager: PhysicsWorldManager3d,
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
      transform.positionZ.set(e, pos.z);
      transform.rotationX.set(e, rot.x);
      transform.rotationY.set(e, rot.y);
      transform.rotationZ.set(e, rot.z);
      transform.rotationW.set(e, rot.w);
    }
  }
}
