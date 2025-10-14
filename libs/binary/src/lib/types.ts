import { FieldType } from './binary.js';

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export type TypedArrayConstructor =
  | typeof Int8Array
  | typeof Uint8Array
  | typeof Int16Array
  | typeof Uint16Array
  | typeof Int32Array
  | typeof Uint32Array
  | typeof Float32Array
  | typeof Float64Array;

export interface InputFieldDefinition {
  name: string;
  type: FieldType;
  isArray: boolean;
  arrayLength?: number;
  byteLength: number;
}
