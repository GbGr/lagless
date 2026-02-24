import { ECSConfig } from '../../ecs-config.js';
import { IAbstractMemory } from '../abstract-memory.interface.js';
import { ECSDeps, IFilterConstructor, IFilterInstance } from '../../types/index.js';
import { MemoryTracker } from '@lagless/binary';

export class FiltersManager implements IAbstractMemory {
  private readonly _filtersInstances = new Map<IFilterConstructor, IFilterInstance>();

  constructor(
    private readonly _ECSConfig: ECSConfig,
    private readonly _ECSDeps: ECSDeps,
    _maskWords?: 1 | 2,
  ) {}

  public init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void {
    for (const FilterConstructor of this._ECSDeps.filters) {
      const filterInstance = new FilterConstructor(this._ECSConfig.maxEntities, arrayBuffer, tracker);
      this._filtersInstances.set(FilterConstructor, filterInstance);
    }
  }

  public calculateSize(tracker: MemoryTracker): void {
    for (const FilterDefinition of this._ECSDeps.filters) {
      FilterDefinition.calculateSize(this._ECSConfig.maxEntities, tracker);
    }
  }

  public get<FilterCtor extends IFilterConstructor>(FilterConstructor: FilterCtor): InstanceType<FilterCtor> {
    const filterInstance = this._filtersInstances.get(FilterConstructor);
    if (!filterInstance) {
      throw new Error(`Filter ${FilterConstructor.name} not found`);
    }
    return filterInstance as InstanceType<FilterCtor>;
  }

  public [Symbol.iterator]() {
    return this._filtersInstances.entries();
  }

  public removeEntityFromAllFilters(entity: number): void {
    for (const filterInstance of this._filtersInstances.values()) {
      filterInstance.removeEntityFromFilter(entity);
    }
  }

  public updateEntityInAllFilters(entity: number, masks: Uint32Array, maskBase: number, maskWords: number): void {
    for (const filterInstance of this._filtersInstances.values()) {
      let includeOk = true;
      let excludeOk = true;

      for (let w = 0; w < maskWords; w++) {
        const entityMaskWord = masks[maskBase + w];
        const incWord = filterInstance.includeMask[w] ?? 0;
        const excWord = filterInstance.excludeMask[w] ?? 0;

        if (incWord && ((entityMaskWord & incWord) >>> 0) !== (incWord >>> 0)) {
          includeOk = false;
          break;
        }
        if (excWord && (entityMaskWord & excWord) !== 0) {
          excludeOk = false;
          break;
        }
      }

      if (includeOk && excludeOk) {
        filterInstance.addEntityToFilter(entity);
      } else {
        filterInstance.removeEntityFromFilter(entity);
      }
    }
  }
}
