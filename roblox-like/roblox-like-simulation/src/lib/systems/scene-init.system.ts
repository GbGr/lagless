import { ECSSystem, EntitiesManager, IECSSystem, Prefab } from '@lagless/core';
import { BodyType, CollisionLayers } from '@lagless/physics-shared';
import { PhysicsWorldManager3d } from '@lagless/physics3d';
import { Transform3d, PhysicsRefs, StaticObstacle, GameState } from '../schema/code-gen/index.js';
import { ROBLOX_LIKE_CONFIG, OBSTACLES } from '../config.js';
import { MathOps } from '@lagless/math';

@ECSSystem()
export class SceneInitSystem implements IECSSystem {
  private readonly _obstaclePrefab = Prefab.create()
    .with(Transform3d)
    .with(PhysicsRefs)
    .with(StaticObstacle);

  constructor(
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _Transform3d: Transform3d,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _WorldManager: PhysicsWorldManager3d,
    private readonly _CollisionLayers: CollisionLayers,
    private readonly _GameState: GameState,
  ) {}

  public update(): void {
    if (this._GameState.safe.sceneInitialized) return;
    this._GameState.safe.sceneInitialized = 1;

    const groups = this._CollisionLayers.groups('Default');
    const layerBit = this._CollisionLayers.bit('Default');
    this._spawnGround(groups, layerBit);
    this._spawnObstacles(groups, layerBit);
  }

  private _spawnGround(groups: number, layerBit: number): void {
    const entity = this._EntitiesManager.createEntity(this._obstaclePrefab);
    const halfSize = ROBLOX_LIKE_CONFIG.groundSize / 2;
    const ht = ROBLOX_LIKE_CONFIG.groundThickness / 2;

    const t = this._Transform3d.unsafe;
    t.positionX[entity] = 0;
    t.positionY[entity] = -ht; // top surface at y=0
    t.positionZ[entity] = 0;
    t.prevPositionX[entity] = 0;
    t.prevPositionY[entity] = -ht;
    t.prevPositionZ[entity] = 0;
    t.rotationW[entity] = 1;
    t.prevRotationW[entity] = 1;

    const body = this._WorldManager.createFixedBody();
    body.setTranslation({ x: 0, y: -ht, z: 0 }, false);

    const collider = this._WorldManager.createCuboidCollider(halfSize, ht, halfSize, body, groups);

    const pr = this._PhysicsRefs.unsafe;
    pr.bodyHandle[entity] = body.handle;
    pr.colliderHandle[entity] = collider.handle;
    pr.bodyType[entity] = BodyType.FIXED;
    pr.collisionLayer[entity] = layerBit;
    this._WorldManager.registerCollider(collider.handle, entity);
  }

  private _spawnObstacles(groups: number, layerBit: number): void {
    for (const obs of OBSTACLES) {
      const entity = this._EntitiesManager.createEntity(this._obstaclePrefab);

      const t = this._Transform3d.unsafe;
      t.positionX[entity] = obs.x;
      t.positionY[entity] = obs.y;
      t.positionZ[entity] = obs.z;
      t.prevPositionX[entity] = obs.x;
      t.prevPositionY[entity] = obs.y;
      t.prevPositionZ[entity] = obs.z;

      // Rotation (only X axis used for ramps)
      if (obs.rotX) {
        const halfAngle = obs.rotX * 0.5;
        const sinX = MathOps.sin(halfAngle);
        const cosX = MathOps.cos(halfAngle);
        t.rotationX[entity] = sinX;
        t.rotationY[entity] = 0;
        t.rotationZ[entity] = 0;
        t.rotationW[entity] = cosX;
        t.prevRotationX[entity] = sinX;
        t.prevRotationY[entity] = 0;
        t.prevRotationZ[entity] = 0;
        t.prevRotationW[entity] = cosX;
      } else {
        t.rotationW[entity] = 1;
        t.prevRotationW[entity] = 1;
      }

      const body = this._WorldManager.createFixedBody();
      body.setTranslation({ x: obs.x, y: obs.y, z: obs.z }, false);
      if (obs.rotX) {
        const halfAngle = obs.rotX * 0.5;
        const sinX = MathOps.sin(halfAngle);
        const cosX = MathOps.cos(halfAngle);
        body.setRotation({ x: sinX, y: 0, z: 0, w: cosX }, false);
      }

      const collider = this._WorldManager.createCuboidCollider(obs.hx, obs.hy, obs.hz, body, groups);

      const pr = this._PhysicsRefs.unsafe;
      pr.bodyHandle[entity] = body.handle;
      pr.colliderHandle[entity] = collider.handle;
      pr.bodyType[entity] = BodyType.FIXED;
      pr.collisionLayer[entity] = layerBit;
      this._WorldManager.registerCollider(collider.handle, entity);
    }
  }
}
