import { IFilterInstance } from '@lagless/types';
import { IPhysicsRefsComponent } from '../types.js';
import Rapier from '@dimforge/rapier2d-deterministic-compat';

export class PhysicsRefsRegistry {
  private readonly _colliderToEntity = new Map<number, number>();
  private readonly _rigidBodyToEntity = new Map<number, number>();
  private readonly _entityToCollider = new Map<number, number>();
  private readonly _entityToRigidBody = new Map<number, number>();

  public getColliderRef(entityRef: number): number | undefined {
    return this._entityToCollider.get(entityRef);
  }

  public getRigidBodyRef(entityRef: number): number | undefined {
    return this._entityToRigidBody.get(entityRef);
  }

  public getEntityRefFromCollider(colliderRef: number): number | undefined {
    return this._colliderToEntity.get(colliderRef);
  }

  public getEntityRefFromRigidBody(rigidBodyRef: number): number | undefined {
    return this._rigidBodyToEntity.get(rigidBodyRef);
  }

  public addCollider(entityRef: number, collider: Rapier.Collider): void {
    const colliderRef = collider.handle;
    const rigidBody = collider.parent();

    this._colliderToEntity.set(colliderRef, entityRef);
    this._entityToCollider.set(entityRef, colliderRef);

    if (rigidBody) {
      const rigidBodyRef = rigidBody.handle;
      this._rigidBodyToEntity.set(rigidBodyRef, entityRef);
      this._entityToRigidBody.set(entityRef, rigidBodyRef);
    }
  }

  public removeCollider(entityRef: number, collider: Rapier.Collider): void {
    const colliderRef = collider.handle;
    const rigidBody = collider.parent();

    this._colliderToEntity.delete(colliderRef);
    this._entityToCollider.delete(entityRef);

    if (rigidBody) {
      const rigidBodyRef = rigidBody.handle;
      this._rigidBodyToEntity.delete(rigidBodyRef);
      this._entityToRigidBody.delete(entityRef);
    }
  }

  public rebuild(physicsRefsFilter: IFilterInstance, physicsRefs: IPhysicsRefsComponent): void {
    this.cleanup();

    for (const entity of physicsRefsFilter) {
      const colliderRef = physicsRefs.unsafe.colliderRefs[entity];
      const rigidBodyRef = physicsRefs.unsafe.hasRigidBody[entity] ? physicsRefs.unsafe.rigidBodyRefs[entity] : undefined;

      this._colliderToEntity.set(colliderRef, entity);
      this._entityToCollider.set(entity, colliderRef);

      if (rigidBodyRef !== undefined) {
        this._rigidBodyToEntity.set(rigidBodyRef, entity);
        this._entityToRigidBody.set(entity, rigidBodyRef);
      }
    }
  }

  private cleanup(): void {
    this._colliderToEntity.clear();
    this._rigidBodyToEntity.clear();
    this._entityToCollider.clear();
    this._entityToRigidBody.clear();
  }
}
