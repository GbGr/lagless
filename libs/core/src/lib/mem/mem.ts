import { ECSDeps } from '../types/index.js';
import { ECSConfig } from '../ecs-config.js';
import { IAbstractMemory } from './abstract-memory.interface.js';
import { ComponentsManager } from './managers/components-manager.js';
import { EntitiesManager } from './managers/entities-manager.js';
import { SingletonsManager } from './managers/singletons-manager.js';
import { FiltersManager } from './managers/filters-manager.js';
import { PlayerResourcesManager } from './managers/player-resources-manager.js';
import { TickManager } from './managers/tick-manager.js';
import { PRNGManager } from './managers/prng-manager.js';
import { MemoryTracker } from '@lagless/binary';

export class Mem {
  public readonly tickManager: TickManager;
  public readonly prngManager: PRNGManager;
  public readonly componentsManager: ComponentsManager;
  public readonly singletonsManager: SingletonsManager;
  public readonly filtersManager: FiltersManager;
  public readonly entitiesManager: EntitiesManager;
  public readonly playerResourcesManager: PlayerResourcesManager;

  private readonly _arrayBuffer: ArrayBuffer;
  private readonly _memoryManagers: Array<IAbstractMemory>;

  constructor(private readonly _ECSConfig: ECSConfig, private readonly _ECSDeps: ECSDeps) {
    this.tickManager = new TickManager();
    this.prngManager = new PRNGManager(this._ECSConfig);
    this.componentsManager = new ComponentsManager(this._ECSConfig, this._ECSDeps);
    this.singletonsManager = new SingletonsManager(this._ECSDeps);
    this.filtersManager = new FiltersManager(this._ECSConfig, this._ECSDeps);
    this.entitiesManager = new EntitiesManager(this._ECSConfig, this.componentsManager, this.filtersManager);
    this.playerResourcesManager = new PlayerResourcesManager(this._ECSConfig, this._ECSDeps);

    this._memoryManagers = [
      this.tickManager,
      this.prngManager,
      this.componentsManager,
      this.singletonsManager,
      this.filtersManager,
      this.entitiesManager,
      this.playerResourcesManager,
    ];

    const arrayBufferSize = this.calculateSize();

    this._arrayBuffer = new ArrayBuffer(arrayBufferSize);

    const tracker = new MemoryTracker();

    for (const memoryManager of this._memoryManagers) {
      memoryManager.init(this._arrayBuffer, tracker);
    }
  }

  public exportSnapshot(): ArrayBuffer {
    return this._arrayBuffer.slice(0);
  }

  public applySnapshot(arrayBuffer: ArrayBuffer): void {
    if (arrayBuffer.byteLength !== this._arrayBuffer.byteLength) {
      throw new Error('Snapshot size mismatch');
    }

    new Uint8Array(this._arrayBuffer).set(new Uint8Array(arrayBuffer));
  }

  private calculateSize(): number {
    const tracker = new MemoryTracker();

    for (const memoryManager of this._memoryManagers) {
      memoryManager.calculateSize(tracker);
    }

    return tracker.ptr;
  }
}
