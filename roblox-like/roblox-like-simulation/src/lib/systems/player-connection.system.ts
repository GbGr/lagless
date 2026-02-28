import { ECSConfig, ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources, Prefab } from '@lagless/core';
import { BodyType, CollisionLayers } from '@lagless/physics-shared';
import { PhysicsWorldManager3d } from '@lagless/physics3d';
import { CharacterControllerManager } from '@lagless/character-controller-3d';
import {
  Transform3d,
  PhysicsRefs,
  CharacterState,
  AnimationState,
  PlayerTag,
  PlayerJoined,
  PlayerResource,
} from '../schema/code-gen/index.js';
import { ROBLOX_LIKE_CONFIG, CHARACTER_CONFIG } from '../config.js';

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  private readonly _playerPrefab = Prefab.create()
    .with(Transform3d)
    .with(PhysicsRefs)
    .with(CharacterState)
    .with(AnimationState, { animationSpeed: 1 })
    .with(PlayerTag);

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _Transform3d: Transform3d,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _WorldManager: PhysicsWorldManager3d,
    private readonly _KCCManager: CharacterControllerManager,
    private readonly _CollisionLayers: CollisionLayers,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, PlayerJoined);

    for (const rpc of rpcs) {
      const slot = rpc.data.slot;
      const entity = this._EntitiesManager.createEntity(this._playerPrefab);

      // Spawn position
      const spacing = ROBLOX_LIKE_CONFIG.groundSize * 0.3 / Math.max(this._ECSConfig.maxPlayers, 1);
      const spawnX = -spacing * (this._ECSConfig.maxPlayers - 1) / 2 + slot * spacing;
      const spawnY = ROBLOX_LIKE_CONFIG.spawnY;
      const spawnZ = 0;

      // Set transform (position + prev must match)
      const t = this._Transform3d.unsafe;
      t.positionX[entity] = spawnX;
      t.positionY[entity] = spawnY;
      t.positionZ[entity] = spawnZ;
      t.prevPositionX[entity] = spawnX;
      t.prevPositionY[entity] = spawnY;
      t.prevPositionZ[entity] = spawnZ;
      // Identity quaternion
      t.rotationX[entity] = 0;
      t.rotationY[entity] = 0;
      t.rotationZ[entity] = 0;
      t.rotationW[entity] = 1;
      t.prevRotationX[entity] = 0;
      t.prevRotationY[entity] = 0;
      t.prevRotationZ[entity] = 0;
      t.prevRotationW[entity] = 1;

      // Create physics body (kinematic position-based)
      const body = this._WorldManager.createKinematicPositionBody();
      body.setTranslation({ x: spawnX, y: spawnY, z: spawnZ }, true);

      const characterGroups = this._CollisionLayers.groups('Character');
      const collider = this._WorldManager.createCapsuleCollider(
        CHARACTER_CONFIG.capsuleHalfHeight,
        CHARACTER_CONFIG.capsuleRadius,
        body,
        characterGroups,
      );

      // Store handles in PhysicsRefs
      const pr = this._PhysicsRefs.unsafe;
      pr.bodyHandle[entity] = body.handle;
      pr.colliderHandle[entity] = collider.handle;
      pr.bodyType[entity] = BodyType.KINEMATIC_POSITION;
      pr.collisionLayer[entity] = this._CollisionLayers.bit('Character');

      // Register collider in entity map
      this._WorldManager.registerCollider(collider.handle, entity);

      // Create KCC
      this._KCCManager.createForEntity(entity);

      // Set player resource
      const playerResource = this._PlayerResources.get(PlayerResource, slot);
      playerResource.safe.entity = entity;
      playerResource.safe.connected = 1;
      for (let i = 0; i < rpc.data.playerId.length; i++) {
        playerResource.unsafe.id[i] = rpc.data.playerId[i];
      }
    }
  }
}
