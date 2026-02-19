import { ECSConfig } from '../../ecs-config.js';
import { IAbstractMemory } from '../abstract-memory.interface.js';
import { ECSDeps, IFilterConstructor, IFilterInstance } from '../../types/index.js';
import { MemoryTracker } from '@lagless/binary';

export class FiltersManager implements IAbstractMemory {
  private readonly _filtersInstances = new Map<IFilterConstructor, IFilterInstance>();

  constructor(private readonly _ECSConfig: ECSConfig, private readonly _ECSDeps: ECSDeps) {}

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

  public updateEntityInAllFilters(entity: number, componentsMask: number): void {
    for (const filterInstance of this._filtersInstances.values()) {
      const includeOk = !filterInstance.includeMask
        || (componentsMask & filterInstance.includeMask) === filterInstance.includeMask;
      const excludeOk = !filterInstance.excludeMask
        || (componentsMask & filterInstance.excludeMask) === 0;

      if (includeOk && excludeOk) {
        filterInstance.addEntityToFilter(entity);
      } else {
        filterInstance.removeEntityFromFilter(entity);
      }
    }
  }
}
