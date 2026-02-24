import { createLogger } from '@lagless/misc';
import { PhysicsConfig3d } from './physics-config-3d.js';
import {
  RapierCollider3d,
  RapierColliderDesc,
  RapierModule3d,
  RapierRigidBody3d,
  RapierRigidBodyDesc,
  RapierWorld3d,
} from './rapier-types.js';

const log = createLogger('PhysicsWorldManager3d');

export class PhysicsWorldManager3d {
  private _world: RapierWorld3d;
  private readonly _substeps: number;

  public get world(): RapierWorld3d {
    return this._world;
  }

  public get substeps(): number {
    return this._substeps;
  }

  private readonly _substepDt: number;

  constructor(
    private readonly _rapier: RapierModule3d,
    private readonly _config: PhysicsConfig3d,
    frameLengthMs: number,
  ) {
    this._world = new _rapier.World({
      x: _config.gravityX,
      y: _config.gravityY,
      z: _config.gravityZ,
    });

    this._substeps = _config.substeps;
    this._substepDt = (frameLengthMs / 1000) / this._substeps;
    this._world.timestep = this._substepDt;
  }

  /**
   * Step the physics world for one ECS frame.
   * Executes `substeps` Rapier steps, each with a fixed dt derived from frameLength / substeps.
   */
  public step(): void {
    for (let i = 0; i < this._substeps; i++) {
      this._world.step();
    }
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
        z: this._config.gravityZ,
      });
      return;
    }
    this._world = restored;
  }

  // Body factories
  public createDynamicBody(): RapierRigidBody3d {
    const desc = this._rapier.RigidBodyDesc.dynamic();
    return this._world.createRigidBody(desc);
  }

  public createFixedBody(): RapierRigidBody3d {
    const desc = this._rapier.RigidBodyDesc.fixed();
    return this._world.createRigidBody(desc);
  }

  public createKinematicPositionBody(): RapierRigidBody3d {
    const desc = this._rapier.RigidBodyDesc.kinematicPositionBased();
    return this._world.createRigidBody(desc);
  }

  public createKinematicVelocityBody(): RapierRigidBody3d {
    const desc = this._rapier.RigidBodyDesc.kinematicVelocityBased();
    return this._world.createRigidBody(desc);
  }

  public createBodyFromDesc(desc: RapierRigidBodyDesc): RapierRigidBody3d {
    return this._world.createRigidBody(desc);
  }

  // Collider factories
  public createBallCollider(radius: number, parent?: RapierRigidBody3d): RapierCollider3d {
    const desc = this._rapier.ColliderDesc.ball(radius);
    return this._world.createCollider(desc, parent);
  }

  public createCuboidCollider(hx: number, hy: number, hz: number, parent?: RapierRigidBody3d): RapierCollider3d {
    const desc = this._rapier.ColliderDesc.cuboid(hx, hy, hz);
    return this._world.createCollider(desc, parent);
  }

  public createCapsuleCollider(halfHeight: number, radius: number, parent?: RapierRigidBody3d): RapierCollider3d {
    const desc = this._rapier.ColliderDesc.capsule(halfHeight, radius);
    return this._world.createCollider(desc, parent);
  }

  public createTrimeshCollider(
    vertices: Float32Array,
    indices: Uint32Array,
    parent?: RapierRigidBody3d,
  ): RapierCollider3d {
    const desc = this._rapier.ColliderDesc.trimesh(vertices, indices);
    return this._world.createCollider(desc, parent);
  }

  public createColliderFromDesc(desc: RapierColliderDesc, parent?: RapierRigidBody3d): RapierCollider3d {
    return this._world.createCollider(desc, parent);
  }

  // Accessors
  public getBody(handle: number): RapierRigidBody3d {
    return this._world.getRigidBody(handle);
  }

  public getCollider(handle: number): RapierCollider3d {
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

  // Rapier module access (for creating descs in game code)
  public get rapier(): RapierModule3d {
    return this._rapier;
  }

  public dispose(): void {
    this._world.free();
  }
}
