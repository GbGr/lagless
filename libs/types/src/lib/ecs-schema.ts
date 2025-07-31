import { MemoryTracker } from '@lagless/misc';
import { TypedArray, TypedArrayConstructor } from './ecs-types.js';
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

export enum FieldType {
  Int8,
  Uint8,
  Int16,
  Uint16,
  Int32,
  Uint32,
  Float32,
  Float64,
}

export const FieldTypeReverse = {
  [FieldType.Int8]: 'Int8',
  [FieldType.Uint8]: 'Uint8',
  [FieldType.Int16]: 'Int16',
  [FieldType.Uint16]: 'Uint16',
  [FieldType.Int32]: 'Int32',
  [FieldType.Uint32]: 'Uint32',
  [FieldType.Float32]: 'Float32',
  [FieldType.Float64]: 'Float64',
}

export interface InputFieldDefinition {
  name: string;
  type: FieldType;
  isArray: boolean;
  arrayLength?: number;
  byteLength: number;
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
  readonly fields: Array<InputFieldDefinition>;
  readonly schema: Record<string, TypedArray | number>;
}

export type InputMeta = {
  tick: number;
  ts: number;
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
