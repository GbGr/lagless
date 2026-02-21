import { ECSSystem, EntitiesManager, IECSSystem, PlayerResources } from '@lagless/core';
import {
  Collectible, CollectibleFilter, GameState, PlayerBody, PlayerFilter, PlayerResource, Transform2d,
} from '../schema/code-gen/index.js';
import { SyncTestArena } from '../arena.js';
import { CollectSignal } from '../signals/index.js';

@ECSSystem()
export class CollectionSystem implements IECSSystem {
  constructor(
    private readonly _PlayerFilter: PlayerFilter,
    private readonly _CollectibleFilter: CollectibleFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _PlayerBody: PlayerBody,
    private readonly _Collectible: Collectible,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PlayerResources: PlayerResources,
    private readonly _GameState: GameState,
    private readonly _CollectSignal: CollectSignal,
  ) {}

  public update(tick: number): void {
    const toRemove: number[] = [];

    for (const playerEntity of this._PlayerFilter) {
      const px = this._Transform2d.unsafe.positionX[playerEntity];
      const py = this._Transform2d.unsafe.positionY[playerEntity];
      const playerRadius = this._PlayerBody.unsafe.radius[playerEntity];
      const playerSlot = this._PlayerBody.unsafe.playerSlot[playerEntity];
      const collectRadius = playerRadius + SyncTestArena.coinRadius;

      for (const coinEntity of this._CollectibleFilter) {
        const cx = this._Transform2d.unsafe.positionX[coinEntity];
        const cy = this._Transform2d.unsafe.positionY[coinEntity];

        const dx = px - cx;
        const dy = py - cy;
        const distSq = dx * dx + dy * dy;

        if (distSq < collectRadius * collectRadius) {
          const value = this._Collectible.unsafe.value[coinEntity];
          const playerResource = this._PlayerResources.get(PlayerResource, playerSlot);
          playerResource.safe.score += value;
          playerResource.safe.collectCount++;
          this._GameState.safe.totalCollected++;

          this._CollectSignal.emit(tick, { playerSlot, x: cx, y: cy, value });
          toRemove.push(coinEntity);
        }
      }
    }

    for (const entity of toRemove) {
      this._EntitiesManager.removeEntity(entity);
    }
  }
}
