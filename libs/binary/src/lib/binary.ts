import { TypedArray, TypedArrayConstructor } from './types.js';

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


export function getTypeSizeBytes(type: string): number {
  switch (type) {
    case 'int8':
    case 'uint8':
      return 1;
    case 'int16':
    case 'uint16':
      return 2;
    case 'int32':
    case 'uint32':
    case 'float32':
      return 4;
    case 'float64':
      return 8;
    default:
      throw new Error(`Unknown type: ${type}`);
  }
}

export const typeToArrayConstructor: Record<string, TypedArrayConstructor> = {
  int8: Int8Array,
  uint8: Uint8Array,
  int16: Int16Array,
  uint16: Uint16Array,
  int32: Int32Array,
  uint32: Uint32Array,
  float32: Float32Array,
  float64: Float64Array,
};

export const typeStringToFieldType: { [key in keyof typeof typeToArrayConstructor]: FieldType } = {
  int8: FieldType.Int8,
  uint8: FieldType.Uint8,
  int16: FieldType.Int16,
  uint16: FieldType.Uint16,
  int32: FieldType.Int32,
  uint32: FieldType.Uint32,
  float32: FieldType.Float32,
  float64: FieldType.Float64,
};

export const fieldTypeSizeBytes: Record<FieldType, number> = {
  [FieldType.Int8]: 1,
  [FieldType.Uint8]: 1,
  [FieldType.Int16]: 2,
  [FieldType.Uint16]: 2,
  [FieldType.Int32]: 4,
  [FieldType.Uint32]: 4,
  [FieldType.Float32]: 4,
  [FieldType.Float64]: 8,
};

export const typedArrayConstructors: Record<FieldType, TypedArrayConstructor> = {
  [FieldType.Int8]: Int8Array,
  [FieldType.Uint8]: Uint8Array,
  [FieldType.Int16]: Int16Array,
  [FieldType.Uint16]: Uint16Array,
  [FieldType.Int32]: Int32Array,
  [FieldType.Uint32]: Uint32Array,
  [FieldType.Float32]: Float32Array,
  [FieldType.Float64]: Float64Array,
};

export function writeTypedValue(dataView: DataView, offset: number, type: FieldType, value: number): void {
  switch (type) {
    case FieldType.Int8:
      dataView.setInt8(offset, value);
      break;
    case FieldType.Uint8:
      dataView.setUint8(offset, value);
      break;
    case FieldType.Int16:
      dataView.setInt16(offset, value, true); // true for little-endian
      break;
    case FieldType.Uint16:
      dataView.setUint16(offset, value, true); // true for little-endian
      break;
    case FieldType.Int32:
      dataView.setInt32(offset, value, true); // true for little-endian
      break;
    case FieldType.Uint32:
      dataView.setUint32(offset, value, true); // true for little-endian
      break;
    case FieldType.Float32:
      dataView.setFloat32(offset, value, true); // true for little-endian
      break;
    case FieldType.Float64:
      dataView.setFloat64(offset, value, true); // true for little-endian
      break;
    default:
      throw new Error(`Unsupported field type: ${type}`);
  }
}

export function readTypedValue(dataView: DataView, offset: number, type: FieldType): number {
  switch (type) {
    case FieldType.Int8:
      return dataView.getInt8(offset);
    case FieldType.Uint8:
      return dataView.getUint8(offset);
    case FieldType.Int16:
      return dataView.getInt16(offset, true); // true for little-endian
    case FieldType.Uint16:
      return dataView.getUint16(offset, true); // true for little-endian
    case FieldType.Int32:
      return dataView.getInt32(offset, true); // true for little-endian
    case FieldType.Uint32:
      return dataView.getUint32(offset, true); // true for little-endian
    case FieldType.Float32:
      return dataView.getFloat32(offset, true); // true for little-endian
    case FieldType.Float64:
      return dataView.getFloat64(offset, true); // true for little-endian
    default:
      throw new Error(`Unsupported field type: ${type}`);
  }
}

export function createTypedArrayView(
  buffer: ArrayBuffer,
  baseOffset: number,
  currentOffset: number,
  type: string,
  length: number,
): TypedArray {
  const constructor = typeToArrayConstructor[type];
  if (!constructor) {
    throw new Error(`Unknown type: ${type}`);
  }

  return new constructor(buffer, baseOffset + currentOffset, length);
}

export function align8(value: number): number {
  return (value + 7) & ~7;
}

export class MemoryTracker {
  private _ptr: number;

  public get ptr(): number {
    return this._ptr;
  }

  constructor(initialOffset = 0) {
    this._ptr = initialOffset;
  }

  public add(byteLength: number) {
    this._ptr += align8(byteLength);

    return this._ptr;
  }
}

const FLOAT32_BUFFER = new Float32Array(1);

export const toFloat32 = (value: number): number => {
  FLOAT32_BUFFER[0] = value;
  return FLOAT32_BUFFER[0];
};
