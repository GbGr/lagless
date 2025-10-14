import { MemoryTracker } from '@lagless/binary';
import { IAbstractMemory } from '../abstract-memory.interface.js';
import { ECSDeps, ISingletonConstructor, ISingletonInstance } from '../../types/index.js';

export class SingletonsManager implements IAbstractMemory {
  private readonly _singletonsInstances = new Map<ISingletonConstructor, ISingletonInstance>();

  constructor(private readonly _ECSDeps: ECSDeps) {}

  public init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void {
    for (const SingletonConstructor of this._ECSDeps.singletons) {
      const singletonInstance = new SingletonConstructor(arrayBuffer, tracker);
      this._singletonsInstances.set(SingletonConstructor, singletonInstance);
    }
  }

  public calculateSize(tracker: MemoryTracker): void {
    for (const SingletonDefinition of this._ECSDeps.singletons) {
      SingletonDefinition.calculateSize(tracker);
    }
  }

  public get<Ctor extends ISingletonConstructor>(SingletonConstructor: Ctor): InstanceType<Ctor> {
    const singletonInstance = this._singletonsInstances.get(SingletonConstructor);
    if (!singletonInstance) {
      throw new Error(`Singleton ${SingletonConstructor.name} not found`);
    }
    return singletonInstance as InstanceType<Ctor>;
  }

  public [Symbol.iterator]() {
    return this._singletonsInstances.entries();
  }
}
