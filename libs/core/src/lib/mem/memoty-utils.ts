import { FieldType, TypedArray, TypedArrayConstructor } from '@lagless/types';

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
