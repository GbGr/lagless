import { IAbstractMemory } from '../abstract-memory.interface.js';
import { ECSConfig } from '../../ecs-config.js';
import {
  ECSDeps,
  IPlayerResourceConstructor,
  IPlayerResourceInstance,
  ISingletonConstructor,
} from '../../types/index.js';
import { MemoryTracker } from '@lagless/binary';

export class PlayerResourcesManager implements IAbstractMemory {
  private readonly _playerResourcesRegistry = new Map<IPlayerResourceConstructor, Array<IPlayerResourceInstance>>();
  public readonly PlayerResources: PlayerResources;

  constructor(private readonly _ECSConfig: ECSConfig, private readonly _ECSDeps: ECSDeps) {
    this.PlayerResources = new PlayerResources(this);
  }

  public init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void {
    for (const PlayerResourceConstructor of this._ECSDeps.playerResources) {
      const playerResourceForSlots = new Array<IPlayerResourceInstance>();
      for (let i = 0; i < this._ECSConfig.maxPlayers; i++) {
        const playerResourceInstance = new PlayerResourceConstructor(arrayBuffer, tracker);
        playerResourceForSlots.push(playerResourceInstance);
      }
      this._playerResourcesRegistry.set(PlayerResourceConstructor, playerResourceForSlots);
    }
  }

  public calculateSize(tracker: MemoryTracker): void {
    for (const PlayerResourceConstructor of this._ECSDeps.playerResources) {
      for (let i = 0; i < this._ECSConfig.maxPlayers; i++) {
        PlayerResourceConstructor.calculateSize(tracker);
      }
    }
  }

  public get<Ctor extends ISingletonConstructor>(SingletonConstructor: Ctor, playerSlot: number): InstanceType<Ctor> {
    if (playerSlot < 0 || playerSlot >= this._ECSConfig.maxPlayers) {
      throw new Error(`Player slot ${playerSlot} is out of bounds`);
    }

    const playerResourceInstances = this._playerResourcesRegistry.get(SingletonConstructor);
    if (!playerResourceInstances) {
      throw new Error(`Player resource ${SingletonConstructor.name} not found`);
    }

    const playerResourceInstance = playerResourceInstances[playerSlot];
    if (!playerResourceInstance) {
      throw new Error(`Player resource instance for slot ${playerSlot} not found`);
    }

    return playerResourceInstance as InstanceType<Ctor>;
  }

  public [Symbol.iterator]() {
    return this._playerResourcesRegistry.entries();
  }
}

export class PlayerResources {
  constructor(private readonly _playerResourcesManager: PlayerResourcesManager) {}

  public get<Ctor extends IPlayerResourceConstructor>(
    PlayerResourceConstructor: Ctor,
    playerSlot: number
  ): InstanceType<Ctor> {
    return this._playerResourcesManager.get(PlayerResourceConstructor, playerSlot);
  }
}
