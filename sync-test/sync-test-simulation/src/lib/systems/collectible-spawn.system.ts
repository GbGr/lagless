import { ECSSystem, EntitiesManager, IECSSystem, Prefab, PRNG } from '@lagless/core';
import { Collectible, CollectibleFilter, GameState, Transform2d } from '../schema/code-gen/index.js';
import { SyncTestArena } from '../arena.js';

@ECSSystem()
export class CollectibleSpawnSystem implements IECSSystem {
  private readonly _collectiblePrefab = Prefab.create()
    .with(Transform2d)
    .with(Collectible, { value: 10 });

  constructor(
    private readonly _CollectibleFilter: CollectibleFilter,
    private readonly _GameState: GameState,
    private readonly _Transform2d: Transform2d,
    private readonly _Collectible: Collectible,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PRNG: PRNG,
  ) {}

  public update(tick: number): void {
    if (tick < this._GameState.safe.nextSpawnTick) return;

    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of this._CollectibleFilter) {
      count++;
    }

    if (count >= SyncTestArena.maxCollectibles) return;

    const entity = this._EntitiesManager.createEntity(this._collectiblePrefab);
    const spawnX = this._PRNG.getFloat() * (SyncTestArena.width - 40) + 20;
    const spawnY = this._PRNG.getFloat() * (SyncTestArena.height - 40) + 20;
    this._Transform2d.unsafe.positionX[entity] = spawnX;
    this._Transform2d.unsafe.positionY[entity] = spawnY;
    this._Transform2d.unsafe.prevPositionX[entity] = spawnX;
    this._Transform2d.unsafe.prevPositionY[entity] = spawnY;
    this._Collectible.unsafe.value[entity] = 10;
    this._Collectible.unsafe.spawnTick[entity] = tick;

    this._GameState.safe.nextSpawnTick = tick + SyncTestArena.spawnInterval;
  }
}
