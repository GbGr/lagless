import { IAbstractMemory } from '../abstract-memory.interface.js';
import { ECSConfig } from '../../ecs-config.js';
import { ECSDeps, IComponentConstructor, IComponentInstance } from '../../types/index.js';
import { MemoryTracker } from '@lagless/binary';

export class ComponentsManager implements IAbstractMemory {
  private readonly _componentsInstances = new Map<IComponentConstructor, IComponentInstance>();

  constructor(private readonly _ECSConfig: ECSConfig, private readonly _ECSDeps: ECSDeps) {}

  public init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void {
    for (const ComponentConstructor of this._ECSDeps.components) {
      const componentInstance = new ComponentConstructor(this._ECSConfig.maxEntities, arrayBuffer, tracker);
      this._componentsInstances.set(ComponentConstructor, componentInstance);
    }
  }

  public calculateSize(tracker: MemoryTracker): void {
    for (const ComponentDefinition of this._ECSDeps.components) {
      ComponentDefinition.calculateSize(this._ECSConfig.maxEntities, tracker);
    }
  }

  public get<Ctor extends IComponentConstructor>(ComponentConstructor: Ctor): InstanceType<Ctor> {
    const componentInstance = this._componentsInstances.get(ComponentConstructor);
    if (!componentInstance) {
      throw new Error(`Component ${ComponentConstructor.name} not found`);
    }
    return componentInstance as InstanceType<Ctor>;
  }

  public [Symbol.iterator]() {
    return this._componentsInstances.entries();
  }
}
