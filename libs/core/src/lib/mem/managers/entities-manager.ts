import { FiltersManager } from './filters-manager.js';
import { ComponentsManager } from './components-manager.js';
import { IAbstractMemory } from '../abstract-memory.interface.js';
import { ECSConfig } from '../../ecs-config.js';
import { Prefab } from '../../prefab.js';
import { IComponentConstructor } from '../../types/index.js';
import { MemoryTracker } from '@lagless/binary';

/** Sentinel value indicating an entity slot is unused / removed. All mask words are set to 0xFFFFFFFF. */
export const ENTITY_REMOVED_MASK = 0xFFFFFFFF;

export class EntitiesManager implements IAbstractMemory {
  private _nextEntityId!: Uint32Array;
  private _removedEntitiesLength!: Uint32Array;
  private _removedEntities!: Uint32Array;
  private _entitiesComponentsMasks!: Uint32Array;

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _ComponentsMemory: ComponentsManager,
    private readonly _FiltersMemory: FiltersManager,
    private readonly _maskWords: 1 | 2 = 1,
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

    // Clear all mask words for the entity
    const base = entity * this._maskWords;
    for (let w = 0; w < this._maskWords; w++) {
      this._entitiesComponentsMasks[base + w] = 0;
    }

    if (prefab) {
      for (const [ ComponentConstructor, Values ] of prefab) {
        const bitIndex = ComponentConstructor.ID;
        const wordOffset = bitIndex >>> 5;
        const bit = 1 << (bitIndex & 31);
        this._entitiesComponentsMasks[base + wordOffset] |= bit;
        if (!Values) continue;
        const componentInstance = this._ComponentsMemory.get(ComponentConstructor);
        for (const [ fieldName, value ] of Object.entries(Values)) {
          if (value === undefined) continue;
          componentInstance.unsafe[fieldName as keyof typeof componentInstance.unsafe][entity] = value;
        }
      }
    }

    this.updateFilters(entity);

    return entity;
  }

  public removeEntity(entity: number): void {
    if (entity < 0 || entity >= this._ECSConfig.maxEntities) {
      throw new Error(`Entity ID ${entity} is out of bounds`);
    }

    const base = entity * this._maskWords;

    // Guard against double removal (all mask words must be sentinel)
    let isRemoved = true;
    for (let w = 0; w < this._maskWords; w++) {
      if (this._entitiesComponentsMasks[base + w] !== ENTITY_REMOVED_MASK) {
        isRemoved = false;
        break;
      }
    }
    if (isRemoved) return;

    // Set all mask words to sentinel
    for (let w = 0; w < this._maskWords; w++) {
      this._entitiesComponentsMasks[base + w] = ENTITY_REMOVED_MASK;
    }

    // Add the entity to the removed entities stack
    this._removedEntities[this._removedEntitiesLength[0]] = entity;
    this._removedEntitiesLength[0]++;

    this._FiltersMemory.removeEntityFromAllFilters(entity);
  }

  public isEntityAlive(entity: number): boolean {
    if (entity < 0 || entity >= this._ECSConfig.maxEntities) return false;
    const base = entity * this._maskWords;
    for (let w = 0; w < this._maskWords; w++) {
      if (this._entitiesComponentsMasks[base + w] !== ENTITY_REMOVED_MASK) return true;
    }
    return false;
  }

  public addComponent(entity: number, ComponentConstructor: IComponentConstructor): void {
    const bitIndex = ComponentConstructor.ID;
    const base = entity * this._maskWords;
    const wordOffset = bitIndex >>> 5;
    this._entitiesComponentsMasks[base + wordOffset] |= 1 << (bitIndex & 31);
    this.updateFilters(entity);
  }

  public removeComponent(entity: number, ComponentConstructor: IComponentConstructor): void {
    const bitIndex = ComponentConstructor.ID;
    const base = entity * this._maskWords;
    const wordOffset = bitIndex >>> 5;
    this._entitiesComponentsMasks[base + wordOffset] &= ~(1 << (bitIndex & 31));
    this.updateFilters(entity);
  }

  public hasComponent(entity: number, ComponentConstructor: IComponentConstructor): boolean {
    if (entity < 0 || entity >= this._ECSConfig.maxEntities) {
      throw new Error(`Entity ID ${entity} is out of bounds`);
    }
    const bitIndex = ComponentConstructor.ID;
    const base = entity * this._maskWords;
    const wordOffset = bitIndex >>> 5;
    return (this._entitiesComponentsMasks[base + wordOffset] & (1 << (bitIndex & 31))) !== 0;
  }

  public hasPrefab(entity: number, prefab: Prefab): boolean {
    const base = entity * this._maskWords;
    for (const [ ComponentConstructor ] of prefab) {
      const bitIndex = ComponentConstructor.ID;
      const wordOffset = bitIndex >>> 5;
      if ((this._entitiesComponentsMasks[base + wordOffset] & (1 << (bitIndex & 31))) === 0) {
        return false;
      }
    }

    return true;
  }

  private updateFilters(entity: number): void {
    const base = entity * this._maskWords;

    // Check if entity has any components set (all words zero means empty)
    let isEmpty = true;
    for (let w = 0; w < this._maskWords; w++) {
      if (this._entitiesComponentsMasks[base + w] !== 0) {
        isEmpty = false;
        break;
      }
    }

    if (isEmpty) {
      this._FiltersMemory.removeEntityFromAllFilters(entity);
    } else {
      this._FiltersMemory.updateEntityInAllFilters(entity, this._entitiesComponentsMasks, base, this._maskWords);
    }
  }

  private popRemovedEntities(): number | undefined {
    if (this._removedEntitiesLength[0] === 0) {
      return undefined;
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

    this._entitiesComponentsMasks = new Uint32Array(arrayBuffer, tracker.ptr, this._ECSConfig.maxEntities * this._maskWords);
    this._entitiesComponentsMasks.fill(ENTITY_REMOVED_MASK);
    tracker.add(this._entitiesComponentsMasks.byteLength);
  }

  public calculateSize(tracker: MemoryTracker): void {
    tracker.add(Uint32Array.BYTES_PER_ELEMENT); // nextEntityId
    tracker.add(Uint32Array.BYTES_PER_ELEMENT); // removedEntitiesLength
    tracker.add(this._ECSConfig.maxEntities * Uint32Array.BYTES_PER_ELEMENT); // removedEntities
    tracker.add(this._ECSConfig.maxEntities * this._maskWords * Uint32Array.BYTES_PER_ELEMENT); // entitiesComponentsMasks
  }
}
