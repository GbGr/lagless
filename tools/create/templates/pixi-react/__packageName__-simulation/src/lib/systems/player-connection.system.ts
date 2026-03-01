<% if (simulationType === 'physics3d') { -%>
import { ECSConfig, ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources, Prefab } from '@lagless/core';
import { PlayerBody, PlayerJoined, PlayerResource, Transform3d, PhysicsRefs } from '../schema/code-gen/index.js';
import { PhysicsWorldManager3d } from '@lagless/physics3d';
import { BodyType } from '@lagless/physics-shared';
import { <%= projectName %>Arena } from '../arena.js';

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  private readonly _playerPrefab = Prefab.create()
    .with(Transform3d)
    .with(PhysicsRefs)
    .with(PlayerBody, { radius: <%= projectName %>Arena.playerRadius });

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _Transform3d: Transform3d,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _PlayerBody: PlayerBody,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _WorldManager: PhysicsWorldManager3d,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, PlayerJoined);
    const maxPlayers = this._ECSConfig.maxPlayers;
    const spacing = <%= projectName %>Arena.width * 0.5 / Math.max(maxPlayers, 1);

    for (const rpc of rpcs) {
      const slot = rpc.data.slot;
      const entity = this._EntitiesManager.createEntity(this._playerPrefab);

      this._PlayerBody.unsafe.playerSlot[entity] = slot;

      const spawnX = -<%= projectName %>Arena.width * 0.25 + slot * spacing;
      const spawnY = 1.0;
      const spawnZ = 0;

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

      // Create physics body
      const body = this._WorldManager.createDynamicBody();
      body.setTranslation({ x: spawnX, y: spawnY, z: spawnZ }, true);
      body.setLinearDamping(5.0);

      // Create ball collider
      const collider = this._WorldManager.createBallCollider(<%= projectName %>Arena.playerRadius, body);

      // Store handles in PhysicsRefs
      const pr = this._PhysicsRefs.unsafe;
      pr.bodyHandle[entity] = body.handle;
      pr.colliderHandle[entity] = collider.handle;
      pr.bodyType[entity] = BodyType.DYNAMIC;

      // Register in collider-entity map
      this._WorldManager.registerCollider(collider.handle, entity);

      const playerResource = this._PlayerResources.get(PlayerResource, slot);
      playerResource.safe.entity = entity;
      playerResource.safe.connected = 1;
      for (let i = 0; i < rpc.data.playerId.length; i++) {
        playerResource.unsafe.id[i] = rpc.data.playerId[i];
      }
    }
  }
}
<% } else if (simulationType === 'physics2d') { -%>
import { ECSConfig, ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources, Prefab } from '@lagless/core';
import { PlayerBody, PlayerJoined, PlayerResource, Transform2d, PhysicsRefs } from '../schema/code-gen/index.js';
import { PhysicsWorldManager2d } from '@lagless/physics2d';
import { BodyType } from '@lagless/physics-shared';
import { <%= projectName %>Arena } from '../arena.js';

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  private readonly _playerPrefab = Prefab.create()
    .with(Transform2d)
    .with(PhysicsRefs)
    .with(PlayerBody, { radius: <%= projectName %>Arena.playerRadius });

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _Transform2d: Transform2d,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _PlayerBody: PlayerBody,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _WorldManager: PhysicsWorldManager2d,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, PlayerJoined);
    const maxPlayers = this._ECSConfig.maxPlayers;
    const spacing = <%= projectName %>Arena.width * 0.5 / Math.max(maxPlayers, 1);

    for (const rpc of rpcs) {
      const slot = rpc.data.slot;
      const entity = this._EntitiesManager.createEntity(this._playerPrefab);

      this._PlayerBody.unsafe.playerSlot[entity] = slot;

      const spawnX = <%= projectName %>Arena.width * 0.25 + slot * spacing;
      const spawnY = <%= projectName %>Arena.height * 0.5;

      const t = this._Transform2d.unsafe;
      t.positionX[entity] = spawnX;
      t.positionY[entity] = spawnY;
      t.rotation[entity] = 0;
      t.prevPositionX[entity] = spawnX;
      t.prevPositionY[entity] = spawnY;
      t.prevRotation[entity] = 0;

      // Create physics body
      const body = this._WorldManager.createDynamicBody();
      body.setTranslation({ x: spawnX, y: spawnY }, true);
      body.setLinearDamping(5.0);

      // Create ball collider
      const collider = this._WorldManager.createBallCollider(<%= projectName %>Arena.playerRadius, body);

      // Store handles in PhysicsRefs
      const pr = this._PhysicsRefs.unsafe;
      pr.bodyHandle[entity] = body.handle;
      pr.colliderHandle[entity] = collider.handle;
      pr.bodyType[entity] = BodyType.DYNAMIC;

      // Register in collider-entity map
      this._WorldManager.registerCollider(collider.handle, entity);

      const playerResource = this._PlayerResources.get(PlayerResource, slot);
      playerResource.safe.entity = entity;
      playerResource.safe.connected = 1;
      for (let i = 0; i < rpc.data.playerId.length; i++) {
        playerResource.unsafe.id[i] = rpc.data.playerId[i];
      }
    }
  }
}
<% } else { -%>
import { ECSConfig, ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources, Prefab } from '@lagless/core';
import { PlayerBody, PlayerJoined, PlayerResource, Transform2d, Velocity2d } from '../schema/code-gen/index.js';
import { <%= projectName %>Arena } from '../arena.js';

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  private readonly _playerPrefab = Prefab.create()
    .with(Transform2d)
    .with(Velocity2d)
    .with(PlayerBody, { radius: <%= projectName %>Arena.playerRadius });

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _Transform2d: Transform2d,
    private readonly _PlayerBody: PlayerBody,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, PlayerJoined);
    const maxPlayers = this._ECSConfig.maxPlayers;
    const spacing = <%= projectName %>Arena.width * 0.5 / Math.max(maxPlayers, 1);

    for (const rpc of rpcs) {
      const slot = rpc.data.slot;
      const entity = this._EntitiesManager.createEntity(this._playerPrefab);

      this._PlayerBody.unsafe.playerSlot[entity] = slot;

      const spawnX = <%= projectName %>Arena.width * 0.25 + slot * spacing;
      const spawnY = <%= projectName %>Arena.height * 0.5;
      this._Transform2d.unsafe.positionX[entity] = spawnX;
      this._Transform2d.unsafe.positionY[entity] = spawnY;
      this._Transform2d.unsafe.prevPositionX[entity] = spawnX;
      this._Transform2d.unsafe.prevPositionY[entity] = spawnY;

      const playerResource = this._PlayerResources.get(PlayerResource, slot);
      playerResource.safe.entity = entity;
      playerResource.safe.connected = 1;
      for (let i = 0; i < rpc.data.playerId.length; i++) {
        playerResource.unsafe.id[i] = rpc.data.playerId[i];
      }
    }
  }
}
<% } -%>
