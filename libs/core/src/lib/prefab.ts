import { TypedArrayConstructor } from '@lagless/binary';
import { IComponentConstructor } from './types/index.js';

type ComponentValues<TSchema extends Record<string, TypedArrayConstructor>> = {
  [K in keyof TSchema]: number;
};

export class Prefab {
  private readonly _data = new Map<IComponentConstructor, Partial<ComponentValues<IComponentConstructor['schema']>> | undefined>();

  public with<T extends IComponentConstructor>(
    Component: T,
    values?: Partial<ComponentValues<T['schema']>>,
  ): Prefab {
    this._data.set(Component, values as Partial<ComponentValues<IComponentConstructor['schema']>>);

    return this;
  }

  public static create(): Prefab {
    return new Prefab();
  }

  public [Symbol.iterator](): IterableIterator<
    [IComponentConstructor, Partial<ComponentValues<IComponentConstructor['schema']>> | undefined]
  > {
    return this._data.entries();
  }
}
