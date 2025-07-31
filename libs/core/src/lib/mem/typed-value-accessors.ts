import { FieldType, TypedArrayConstructor } from '@lagless/types';

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
