import { InputFieldDefinition, MemoryTracker, TypedArray, TypedArrayConstructor } from '@lagless/binary';
import { AbstractFilter } from './abstract-filter.js';

export interface FieldDefinition {
  type: string;
  isArray: boolean;
  arrayLength?: number;
}

export interface ComponentDefinition {
  name: string;
  id: number;
  fields: Record<string, FieldDefinition>;
}

export interface IComponentConstructor {
  name: string;
  ID: number;
  schema: Record<string, TypedArrayConstructor>;

  calculateSize(maxEntities: number, memTracker: MemoryTracker): void;

  new (maxEntities: number, buffer: ArrayBuffer, memTracker: MemoryTracker): IComponentInstance;
}

export interface IComponentInstance {
  unsafe: Record<string, TypedArray>;
}

export interface SingletonDefinition {
  name: string;
  fields: Record<string, FieldDefinition>;
}

export interface ISingletonConstructor {
  name: string;
  schema: Record<string, TypedArrayConstructor>;

  calculateSize(memTracker: MemoryTracker): void;

  new (buffer: ArrayBuffer, memTracker: MemoryTracker): ISingletonInstance;
}

export interface ISingletonInstance {
  unsafe: Record<string, TypedArray>;
}

export interface PlayerResourceDefinition {
  name: string;
  fields: Record<string, FieldDefinition>;
}

export interface IPlayerResourceConstructor {
  name: string;
  schema: Record<string, TypedArrayConstructor>;

  calculateSize(memTracker: MemoryTracker): void;

  new (buffer: ArrayBuffer, memTracker: MemoryTracker): ISingletonInstance;
}

export interface IPlayerResourceInstance {
  unsafe: Record<string, TypedArray>;
}

export interface FilterDefinition {
  name: string;
  include: ComponentDefinition[];
  exclude: ComponentDefinition[];
}

export interface IFilterConstructor {
  name: string;
  include: IComponentConstructor[];
  exclude: IComponentConstructor[];

  calculateSize(maxEntities: number, memTracker: MemoryTracker): void;

  new (maxEntities: number, buffer: ArrayBuffer, memTracker: MemoryTracker): IFilterInstance;
}

export interface IFilterInstance extends AbstractFilter {
  includeMask: number;
  excludeMask: number;

  [Symbol.iterator](): IterableIterator<number>;
}

export interface IInputDefinition {
  name: string;
  id: number;
  fields: Array<InputFieldDefinition>;
}

export interface IAbstractInputConstructor {
  readonly id: number;

  new (): IAbstractInput;
}

export interface IAbstractInput {
  readonly id: number;
  readonly byteLength: number;
  readonly fields: ReadonlyArray<InputFieldDefinition>;
  readonly schema: Record<string, TypedArray | number>;
}

export type InputMeta = {
  tick: number;
  ordinal: number;
  playerSlot: number;
};

export type InputData<TInput extends IAbstractInput> = TInput['schema'];

export interface IECSSystem {
  update(tick: number): void;
}

export interface IECSSystemConstructor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): IECSSystem;
}

export interface ECSSchema {
  components: ComponentDefinition[];
  singletons: SingletonDefinition[];
  playerResources: PlayerResourceDefinition[];
  filters: FilterDefinition[];
  inputs: IInputDefinition[];
}

export interface ECSDeps {
  components: IComponentConstructor[];
  singletons: ISingletonConstructor[];
  playerResources: IPlayerResourceConstructor[];
  filters: IFilterConstructor[];
  inputs: IAbstractInputConstructor[];
}
