import { createLogger } from '@lagless/misc';
import { ColliderEntityMap } from '@lagless/physics-shared';
import { CollisionEvents2d } from './collision-events-2d.js';
import { PhysicsConfig2d } from './physics-config-2d.js';
import type {
  DebugRenderBuffers,
  RapierCollider2d,
  RapierColliderDesc2d,
  RapierEventQueue,
  RapierModule2d,
  RapierRigidBody2d,
  RapierRigidBodyDesc2d,
  RapierWorld2d,
} from './rapier-types-2d.js';

const log = createLogger('PhysicsWorldManager2d');

export class PhysicsWorldManager2d {
  private _world: RapierWorld2d;
  private readonly _substeps: number;
  private readonly _substepDt: number;
  private readonly _collisionEvents: CollisionEvents2d;
  private readonly _colliderEntityMap = new ColliderEntityMap();

  public get world(): RapierWorld2d {
    return this._world;
  }

  public get substeps(): number {
    return this._substeps;
  }

  public get substepDt(): number {
    return this._substepDt;
  }

  public get colliderEntityMap(): ColliderEntityMap {
    return this._colliderEntityMap;
  }

  public get collisionEvents(): CollisionEvents2d {
    return this._collisionEvents;
  }

  constructor(
    private readonly _rapier: RapierModule2d,
    private readonly _config: PhysicsConfig2d,
    frameLengthMs: number,
  ) {
    this._world = new _rapier.World({
      x: _config.gravityX,
      y: _config.gravityY,
    });

    this._substeps = _config.substeps;
    this._substepDt = (frameLengthMs / 1000) / this._substeps;
    this._world.timestep = this._substepDt;
    this._world.integrationParameters.warmstartCoefficient = _config.warmstartCoefficient;
    this._collisionEvents = new CollisionEvents2d(_rapier);
  }

  /**
   * Step the physics world for one ECS frame.
   * Executes `substeps` Rapier steps, each with a fixed dt derived from frameLength / substeps.
   * When collision events are enabled, drains the event queue after all substeps.
   */
  public step(): void {
    const eq = this._collisionEvents.eventQueue as RapierEventQueue;
    for (let i = 0; i < this._substeps; i++) {
      this._world.step(eq);
    }
    this._collisionEvents.drain(this._colliderEntityMap, this._world);
  }

  public takeSnapshot(): Uint8Array {
    return this._world.takeSnapshot();
  }

  public restoreSnapshot(data: Uint8Array): void {
    this._world.free();
    const restored = this._rapier.World.restoreSnapshot(data);
    if (!restored) {
      log.warn('Failed to restore Rapier snapshot, recreating world');
      this._world = new this._rapier.World({
        x: this._config.gravityX,
        y: this._config.gravityY,
      });
      this._world.integrationParameters.warmstartCoefficient = this._config.warmstartCoefficient;
      return;
    }
    this._world = restored;
    this._world.integrationParameters.warmstartCoefficient = this._config.warmstartCoefficient;
  }

  // Entity-collider mapping
  public registerCollider(colliderHandle: number, entity: number): void {
    this._colliderEntityMap.set(colliderHandle, entity);
  }

  public unregisterCollider(colliderHandle: number): void {
    this._colliderEntityMap.delete(colliderHandle);
  }

  // Body factories
  public createDynamicBody(): RapierRigidBody2d {
    const desc = this._rapier.RigidBodyDesc.dynamic();
    return this._world.createRigidBody(desc);
  }

  public createFixedBody(): RapierRigidBody2d {
    const desc = this._rapier.RigidBodyDesc.fixed();
    return this._world.createRigidBody(desc);
  }

  public createKinematicPositionBody(): RapierRigidBody2d {
    const desc = this._rapier.RigidBodyDesc.kinematicPositionBased();
    return this._world.createRigidBody(desc);
  }

  public createKinematicVelocityBody(): RapierRigidBody2d {
    const desc = this._rapier.RigidBodyDesc.kinematicVelocityBased();
    return this._world.createRigidBody(desc);
  }

  public createBodyFromDesc(desc: RapierRigidBodyDesc2d): RapierRigidBody2d {
    return this._world.createRigidBody(desc);
  }

  // Collider factories (with optional collision groups and active events)
  public createBallCollider(
    radius: number,
    parent?: RapierRigidBody2d,
    groups?: number,
    activeEvents?: number,
  ): RapierCollider2d {
    const desc = this._rapier.ColliderDesc.ball(radius);
    if (groups !== undefined) desc.setCollisionGroups(groups);
    if (activeEvents !== undefined) desc.setActiveEvents(activeEvents);
    return this._world.createCollider(desc, parent);
  }

  public createCuboidCollider(
    hx: number, hy: number,
    parent?: RapierRigidBody2d,
    groups?: number,
    activeEvents?: number,
  ): RapierCollider2d {
    const desc = this._rapier.ColliderDesc.cuboid(hx, hy);
    if (groups !== undefined) desc.setCollisionGroups(groups);
    if (activeEvents !== undefined) desc.setActiveEvents(activeEvents);
    return this._world.createCollider(desc, parent);
  }

  public createCapsuleCollider(
    halfHeight: number, radius: number,
    parent?: RapierRigidBody2d,
    groups?: number,
    activeEvents?: number,
  ): RapierCollider2d {
    const desc = this._rapier.ColliderDesc.capsule(halfHeight, radius);
    if (groups !== undefined) desc.setCollisionGroups(groups);
    if (activeEvents !== undefined) desc.setActiveEvents(activeEvents);
    return this._world.createCollider(desc, parent);
  }

  public createConvexHullCollider(
    points: Float32Array,
    parent?: RapierRigidBody2d,
    groups?: number,
    activeEvents?: number,
  ): RapierCollider2d | null {
    const desc = this._rapier.ColliderDesc.convexHull(points);
    if (!desc) return null;
    if (groups !== undefined) desc.setCollisionGroups(groups);
    if (activeEvents !== undefined) desc.setActiveEvents(activeEvents);
    return this._world.createCollider(desc, parent);
  }

  public createTrimeshCollider(
    vertices: Float32Array,
    indices: Uint32Array,
    parent?: RapierRigidBody2d,
    groups?: number,
    activeEvents?: number,
  ): RapierCollider2d {
    const desc = this._rapier.ColliderDesc.trimesh(vertices, indices);
    if (groups !== undefined) desc.setCollisionGroups(groups);
    if (activeEvents !== undefined) desc.setActiveEvents(activeEvents);
    return this._world.createCollider(desc, parent);
  }

  public createColliderFromDesc(desc: RapierColliderDesc2d, parent?: RapierRigidBody2d): RapierCollider2d {
    return this._world.createCollider(desc, parent);
  }

  // Accessors
  public getBody(handle: number): RapierRigidBody2d {
    return this._world.getRigidBody(handle);
  }

  public getCollider(handle: number): RapierCollider2d {
    return this._world.getCollider(handle);
  }

  // Removal
  public removeBody(handle: number): void {
    const body = this._world.getRigidBody(handle);
    this._world.removeRigidBody(body);
  }

  public removeCollider(handle: number, wakeUp = true): void {
    const collider = this._world.getCollider(handle);
    this._world.removeCollider(collider, wakeUp);
  }

  public debugRender(): DebugRenderBuffers {
    return this._world.debugRender();
  }

  // Rapier module access (for creating descs in game code)
  public get rapier(): RapierModule2d {
    return this._rapier;
  }

  public dispose(): void {
    this._collisionEvents.dispose();
    this._world.free();
  }
}
