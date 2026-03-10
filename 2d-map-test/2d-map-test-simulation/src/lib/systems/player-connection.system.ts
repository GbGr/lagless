import { ECSConfig, ECSSystem, EntitiesManager, IECSSystem, InputProvider, PlayerResources, Prefab } from '@lagless/core';
import { PlayerBody, PlayerJoined, PlayerResource, Transform2d, PhysicsRefs } from '../schema/code-gen/index.js';
import { PhysicsWorldManager2d } from '@lagless/physics2d';
import { BodyType } from '@lagless/physics-shared';
import { MapTestArena } from '../arena.js';
import { MapData } from '../map-data.js';

@ECSSystem()
export class PlayerConnectionSystem implements IECSSystem {
  private readonly _playerPrefab = Prefab.create()
    .with(Transform2d)
    .with(PhysicsRefs)
    .with(PlayerBody, { radius: MapTestArena.playerRadius });

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _InputProvider: InputProvider,
    private readonly _Transform2d: Transform2d,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _PlayerBody: PlayerBody,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _WorldManager: PhysicsWorldManager2d,
    private readonly _MapData: MapData,
  ) {}

  public update(tick: number): void {
    const rpcs = this._InputProvider.collectTickRPCs(tick, PlayerJoined);
    const maxPlayers = this._ECSConfig.maxPlayers;
    const mapW = this._MapData.map.width;
    const mapH = this._MapData.map.height;
    const centerX = mapW / 2;
    const centerY = mapH / 2;
    const spacing = 60;

    for (const rpc of rpcs) {
      const slot = rpc.data.slot;
      const entity = this._EntitiesManager.createEntity(this._playerPrefab);

      this._PlayerBody.unsafe.playerSlot[entity] = slot;

      const spawnX = centerX + (slot - (maxPlayers - 1) / 2) * spacing;
      const spawnY = centerY;

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
      body.setLinearDamping(0.1);

      // Create ball collider
      const colliderDesc = this._WorldManager.rapier.ColliderDesc.ball(MapTestArena.playerRadius);
      colliderDesc.setFriction(0);
      colliderDesc.setRestitution(1);
      const collider = this._WorldManager.createColliderFromDesc(colliderDesc, body);
      // const collider = this._WorldManager.createBallCollider(MapTestArena.playerRadius, body);

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
