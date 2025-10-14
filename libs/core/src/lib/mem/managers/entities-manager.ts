import { FiltersManager } from './filters-manager.js';
import { ComponentsManager } from './components-manager.js';
import { IAbstractMemory } from '../abstract-memory.interface.js';
import { ECSConfig } from '../../ecs-config.js';
import { Prefab } from '../../prefab.js';
import { IComponentConstructor } from '../../types/index.js';
import { MemoryTracker } from '@lagless/binary';

export class EntitiesManager implements IAbstractMemory {
  private _nextEntityId!: Uint32Array;
  private _removedEntitiesLength!: Uint32Array;
  private _removedEntities!: Uint32Array;
  private _entitiesComponentsMasks!: Int32Array;

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _ComponentsMemory: ComponentsManager,
    private readonly _FiltersMemory: FiltersManager,
  ) {}

  public createEntity(prefab?: Prefab): number {
    let entity = this.popRemovedEntities();
    if (entity === undefined) {
      entity = this._nextEntityId[0];
      this._nextEntityId[0]++;
    }
    if (entity >= this._ECSConfig.maxEntities) {
      throw new Error(`Maximum number of entities (${this._ECSConfig.maxEntities}) exceeded`);
    }

    this._entitiesComponentsMasks[entity] = 0; // Initialize the entity's component mask to 0

    if (prefab) {
      for (const [ ComponentConstructor, Values ] of prefab) {
        const componentInstance = this._ComponentsMemory.get(ComponentConstructor);
        this._entitiesComponentsMasks[entity] |= ComponentConstructor.ID;
        if (!Values) continue;
        for (const [ fieldName, value ] of Object.entries(Values)) {
          if (value === undefined) continue;
          componentInstance.unsafe[fieldName as keyof typeof componentInstance.unsafe][entity] = value;
        }
      }
    }

    this.updateFilters(entity, this._entitiesComponentsMasks[entity]);

    return entity;
  }

  public removeEntity(entity: number): void {
    if (entity < 0 || entity >= this._ECSConfig.maxEntities) {
      throw new Error(`Entity ID ${entity} is out of bounds`);
    }

    // Clear the entity's component mask
    this._entitiesComponentsMasks[entity] = -1;

    // Add the entity to the removed entities stack
    this._removedEntities[this._removedEntitiesLength[0]] = entity;
    this._removedEntitiesLength[0]++;

    this.updateFilters(entity, this._entitiesComponentsMasks[entity]);
  }

  public addComponent(entity: number, ComponentConstructor: IComponentConstructor): void {
    this._entitiesComponentsMasks[entity] |= ComponentConstructor.ID;
    this.updateFilters(entity, this._entitiesComponentsMasks[entity]);
  }

  public removeComponent(entity: number, ComponentConstructor: IComponentConstructor): void {
    this._entitiesComponentsMasks[entity] &= ~ComponentConstructor.ID;
    this.updateFilters(entity, this._entitiesComponentsMasks[entity]);
  }

  public hasComponent(entity: number, ComponentConstructor: IComponentConstructor): boolean {
    if (entity < 0 || entity >= this._ECSConfig.maxEntities) {
      throw new Error(`Entity ID ${entity} is out of bounds`);
    }
    return (this._entitiesComponentsMasks[entity] & ComponentConstructor.ID) !== 0;
  }

  public hasPrefab(entity: number, prefab: Prefab): boolean {
    for (const [ ComponentConstructor ] of prefab) {
      if ((this._entitiesComponentsMasks[entity] & ComponentConstructor.ID) === 0) {
        return false; // If any component in the prefab is not present, return false
      }
    }

    return true;
  }

  private updateFilters(entity: number, componentMask: number): void {
    if (componentMask < 1) {
      this._FiltersMemory.removeEntityFromAllFilters(entity);
    } else {
      this._FiltersMemory.updateEntityInAllFilters(entity, componentMask);
    }
  }

  private popRemovedEntities(): number | undefined {
    if (this._removedEntitiesLength[0] === 0) {
      return undefined; // No removed entities to pop
    }

    const entity = this._removedEntities[this._removedEntitiesLength[0] - 1];
    this._removedEntitiesLength[0]--;

    return entity;
  }

  public init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void {
    this._nextEntityId = new Uint32Array(arrayBuffer, tracker.ptr, 1);
    tracker.add(this._nextEntityId.byteLength);

    this._removedEntitiesLength = new Uint32Array(arrayBuffer, tracker.ptr, 1);
    tracker.add(this._removedEntitiesLength.byteLength);

    this._removedEntities = new Uint32Array(arrayBuffer, tracker.ptr, this._ECSConfig.maxEntities);
    tracker.add(this._removedEntities.byteLength);

    this._entitiesComponentsMasks = new Int32Array(arrayBuffer, tracker.ptr, this._ECSConfig.maxEntities);
    this._entitiesComponentsMasks.fill(-1);
    tracker.add(this._entitiesComponentsMasks.byteLength);
  }

  public calculateSize(tracker: MemoryTracker): void {
    tracker.add(Uint32Array.BYTES_PER_ELEMENT); // for nextEntityId
    tracker.add(Uint32Array.BYTES_PER_ELEMENT); // for removedEntitiesLength
    tracker.add(this._ECSConfig.maxEntities * Uint32Array.BYTES_PER_ELEMENT); // for removedEntities
    tracker.add(this._ECSConfig.maxEntities * Uint32Array.BYTES_PER_ELEMENT); // for entitiesComponentsMasks
  }
}
