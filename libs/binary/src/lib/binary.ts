import { InputFieldDefinition, TypedArray, TypedArrayConstructor } from './types.js';

export const LE = true as const; // little-endian

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
};

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
  [FieldType.Int8]: Int8Array.BYTES_PER_ELEMENT,
  [FieldType.Uint8]: Uint8Array.BYTES_PER_ELEMENT,
  [FieldType.Int16]: Int16Array.BYTES_PER_ELEMENT,
  [FieldType.Uint16]: Uint16Array.BYTES_PER_ELEMENT,
  [FieldType.Int32]: Int32Array.BYTES_PER_ELEMENT,
  [FieldType.Uint32]: Uint32Array.BYTES_PER_ELEMENT,
  [FieldType.Float32]: Float32Array.BYTES_PER_ELEMENT,
  [FieldType.Float64]: Float64Array.BYTES_PER_ELEMENT,
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

export const binaryWrite = (dataView: DataView, offset: number, fieldType: FieldType, value: number): void => {
  switch (fieldType) {
    case FieldType.Int8:
      dataView.setInt8(offset, value);
      break;
    case FieldType.Int16:
      dataView.setInt16(offset, value, LE);
      break;
    case FieldType.Int32:
      dataView.setInt32(offset, value, LE);
      break;
    case FieldType.Uint8:
      dataView.setUint8(offset, value);
      break;
    case FieldType.Uint16:
      dataView.setUint16(offset, value, LE);
      break;
    case FieldType.Uint32:
      dataView.setUint32(offset, value, LE);
      break;
    case FieldType.Float32:
      dataView.setFloat32(offset, value, LE);
      break;
    case FieldType.Float64:
      dataView.setFloat64(offset, value, LE);
      break;
    default:
      throw new Error(`Unsupported field type ${fieldType}`);
  }
};

export const binaryRead = (dataView: DataView, offset: number, fieldType: FieldType): number => {
  switch (fieldType) {
    case FieldType.Int8:
      return dataView.getInt8(offset);
    case FieldType.Int16:
      return dataView.getInt16(offset, LE);
    case FieldType.Int32:
      return dataView.getInt32(offset, LE);
    case FieldType.Uint8:
      return dataView.getUint8(offset);
    case FieldType.Uint16:
      return dataView.getUint16(offset, LE);
    case FieldType.Uint32:
      return dataView.getUint32(offset, LE);
    case FieldType.Float32:
      return dataView.getFloat32(offset, LE);
    case FieldType.Float64:
      return dataView.getFloat64(offset, LE);
    default:
      throw new Error(`Unsupported field type ${fieldType}`);
  }
};

type RawSchema = {
  [key: string]: FieldType;
};

type SchemaValues<TSchema extends RawSchema> = {
  [K in keyof TSchema]: number;
};

export type InferBinarySchemaValues<T> = T extends BinarySchema<infer U> ? SchemaValues<U> : never;

export class BinarySchemaUnpackPipeline {
  private _offset = 0;
  private readonly _dataView: DataView;

  constructor(public readonly arrayBuffer: ArrayBuffer) {
    this._offset = 0;
    this._dataView = new DataView(arrayBuffer);
  }

  public unpack<TSchema extends RawSchema>(schema: BinarySchema<TSchema>): SchemaValues<TSchema> {
    const result = schema.unpackFrom(this._dataView, this._offset);
    this._offset += schema.byteLength;
    return result;
  }

  public sliceRemaining(): ArrayBuffer {
    return this.arrayBuffer.slice(this._offset);
  }
}

export class BinarySchemaPackPipeline {
  private _offset = 0;
  private readonly _chunks: ArrayBuffer[] = [];

  public pack<TSchema extends RawSchema>(schema: BinarySchema<TSchema>, values: SchemaValues<TSchema>): void {
    const buffer = new ArrayBuffer(schema.byteLength);
    const dataView = new DataView(buffer);
    schema.packInto(dataView, 0, values);
    this._chunks.push(buffer);
    this._offset += schema.byteLength;
  }

  public appendBuffer(buffer: ArrayBuffer): void {
    this._chunks.push(buffer);
    this._offset += buffer.byteLength;
  }

  public toUint8Array(): Uint8Array {
    const totalLength = this._offset;
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this._chunks) {
      result.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}

export class BinarySchema<TSchema extends RawSchema> {
  private readonly _schemaEntries: ReadonlyArray<[string, FieldType]>;
  private readonly _byteLength: number;

  public get byteLength(): number {
    return this._byteLength;
  }

  constructor(private readonly _schema: TSchema) {
    this._schemaEntries = Object.entries(this._schema);
    this._byteLength = this._schemaEntries.reduce((acc, [, fieldType]) => {
      return fieldTypeSizeBytes[fieldType] + acc;
    }, 0);
  }

  public pack(values: SchemaValues<TSchema>): Uint8Array {
    const buffer = new ArrayBuffer(this._byteLength);
    const dataView = new DataView(buffer);

    this.packInto(dataView, 0, values);

    return new Uint8Array(buffer);
  }

  public packInto(dataView: DataView, offset: number, values: SchemaValues<TSchema>): void {
    ensureCapacity(dataView, offset, this._byteLength, 'BinarySchema.packInto');

    for (const [fieldKey, fieldType] of this._schemaEntries) {
      const rawValue = values[fieldKey as keyof SchemaValues<TSchema>];
      if (rawValue === undefined || rawValue === null || !Number.isFinite(rawValue) || isNaN(rawValue))
        throw new Error(`Unexpected value "${rawValue}" field ${fieldKey}`);
      const value = throwIfOutOfBounds(fieldKey, fieldType, rawValue);
      binaryWrite(dataView, offset, fieldType, value);
      offset += fieldTypeSizeBytes[fieldType];
    }
  }

  public unpack(uint8: Uint8Array, byteOffset = 0): SchemaValues<TSchema> {
    const view = new DataView(uint8.buffer);
    return this.unpackFrom(view, byteOffset); // has ensureCapacity
  }

  public unpackFrom(dataView: DataView, byteOffset = 0): SchemaValues<TSchema> {
    ensureCapacity(dataView, byteOffset, this._byteLength, 'BinarySchema.unpackFrom');

    let offset = byteOffset;
    const result = Object.create(null) as SchemaValues<TSchema>;

    for (const [fieldKey, fieldType] of this._schemaEntries) {
      (result as Record<string, number>)[fieldKey] = binaryRead(dataView, offset, fieldType);
      offset += fieldTypeSizeBytes[fieldType];
    }
    return result;
  }
}

export class InputBinarySchema {
  public static packBatch(
    registry: { get(id: number): { id: number; fields: ReadonlyArray<InputFieldDefinition>; byteLength: number } },
    data: ReadonlyArray<{ inputId: number; ordinal: number; values: { [key: string]: number | ArrayLike<number> } }>
  ): ArrayBuffer {
    const totalByteLength = data.reduce((acc, { inputId }) => {
      const struct = registry.get(inputId);
      return (
        acc +
        fieldTypeSizeBytes[FieldType.Uint8] + // input id
        fieldTypeSizeBytes[FieldType.Uint32] + // ordinal
        struct.byteLength // size of payload for this struct
      );
    }, 0);

    const buffer = new ArrayBuffer(totalByteLength);
    const dataView = new DataView(buffer);
    let offset = 0;

    for (const { inputId, ordinal, values } of data) {
      const struct = registry.get(inputId);

      // write input id
      binaryWrite(dataView, offset, FieldType.Uint8, struct.id);
      offset += fieldTypeSizeBytes[FieldType.Uint8];

      // write ordinal
      binaryWrite(dataView, offset, FieldType.Uint32, ordinal);
      offset += fieldTypeSizeBytes[FieldType.Uint32];

      // write struct fields
      for (const field of struct.fields) {
        if (field.isArray) {
          const rawValue = values[field.name] as ArrayLike<number>;
          if (!rawValue || rawValue.length === undefined) throw new Error(`Expected array for field ${field.name}`);

          const arrayLength = rawValue.length;
          const expectedLength = field.arrayLength;

          if (expectedLength === undefined) {
            throw new Error(`Cannot pack variable-length array without declared arrayLength for field ${field.name}`);
          }
          if (arrayLength > expectedLength) {
            throw new Error(
              `Array length for field ${field.name} exceeds expected length (${arrayLength} > ${expectedLength})`
            );
          }

          // Ensure we have room for the *declared* payload (writer may underfill; zero-init covers the rest)
          ensureCapacity(dataView, offset, field.byteLength, `InputBinarySchema.packBatch field ${field.name}`);

          // Write provided elements
          for (let j = 0; j < arrayLength; j++) {
            const rawElement = rawValue[j];
            if (rawElement === undefined || rawElement === null || !Number.isFinite(rawElement) || isNaN(rawElement))
              throw new Error(`Unexpected value "${rawElement}" at index ${j} for field ${field.name}`);
            const element = throwIfOutOfBounds(`${field.name}[${j}]`, field.type, rawElement);
            binaryWrite(dataView, offset, field.type, element);
            offset += fieldTypeSizeBytes[field.type];
          }

          // Skip remaining bytes for padding (buffer is zero-initialized)
          const elementSize = fieldTypeSizeBytes[field.type];
          const padCount = expectedLength - arrayLength;
          offset += padCount * elementSize;
        } else {
          const rawValue = values[field.name];
          if (typeof rawValue !== 'number') throw new Error(`Expected number for field ${field.name}`);
          if (!Number.isFinite(rawValue) || isNaN(rawValue))
            throw new Error(`Unexpected value "${rawValue}" for field ${field.name}`);
          const element = throwIfOutOfBounds(field.name, field.type, rawValue);
          ensureCapacity(
            dataView,
            offset,
            fieldTypeSizeBytes[field.type],
            `InputBinarySchema.packBatch field ${field.name}`
          );
          binaryWrite(dataView, offset, field.type, element);
          offset += fieldTypeSizeBytes[field.type];
        }
      }
    }

    return buffer;
  }

  public static unpackBatch(
    registry: { get(id: number): { id: number; fields: ReadonlyArray<InputFieldDefinition>; byteLength: number } },
    buffer: ArrayBuffer,
  ): Array<{ inputId: number; values: { [key: string]: number | TypedArray } }> {
    const dataView = new DataView(buffer);
    const results: Array<{ inputId: number; ordinal: number; values: { [key: string]: number | TypedArray } }> = [];

    let offset = 0;
    const idSize = fieldTypeSizeBytes[FieldType.Uint8];

    while (offset < buffer.byteLength) {
      // --- Read input id
      // Safety: ensure we have at least one byte for id.
      if (offset + idSize > buffer.byteLength) {
        throw new Error(`Truncated buffer while reading inputId at offset ${offset}`);
      }
      const inputId = binaryRead(dataView, offset, FieldType.Uint8) as number;
      offset += idSize;

      // --- Read ordinal (uint32)
      const ordinalSize = fieldTypeSizeBytes[FieldType.Uint32];
      if (offset + ordinalSize > buffer.byteLength) {
        throw new Error(`Truncated buffer while reading ordinal at offset ${offset}`);
      }
      const ordinal = binaryRead(dataView, offset, FieldType.Uint32) as number;
      offset += ordinalSize;

      const struct = registry.get(inputId);
      if (!struct) {
        throw new Error(`Unknown inputId ${inputId} at offset ${offset - idSize}`);
      }

      const values: { [key: string]: number | TypedArray } = {};

      // --- Read fields in declared order
      for (const field of struct.fields) {
        const elementSize = fieldTypeSizeBytes[field.type];

        if (field.isArray) {
          // Without a fixed arrayLength, the reader cannot determine how many elements to consume.
          if (field.arrayLength === undefined) {
            throw new Error(`Cannot unpack variable-length array without declared arrayLength for field ${field.name}`);
          }

          const count = field.arrayLength;
          const totalBytes = count * elementSize;

          // Safety: check that payload fits inside buffer
          if (offset + totalBytes > buffer.byteLength) {
            throw new Error(
              `Truncated buffer while reading array field ${field.name} (need ${totalBytes} bytes) at offset ${offset}`
            );
          }

          // Read fixed-length array
          const arr = new typeToArrayConstructor[field.type](count);
          for (let j = 0; j < count; j++) {
            arr[j] = binaryRead(dataView, offset, field.type) as number;
            offset += elementSize;
          }
          values[field.name] = arr;
        } else {
          // Safety: check that scalar fits
          if (offset + elementSize > buffer.byteLength) {
            throw new Error(
              `Truncated buffer while reading field ${field.name} (need ${elementSize} bytes) at offset ${offset}`
            );
          }
          const v = binaryRead(dataView, offset, field.type) as number;
          values[field.name] = v;
          offset += elementSize;
        }
      }

      results.push({ inputId: struct.id, ordinal, values });
    }

    return results;
  }
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

export const packBatchBuffers = (buffers: Uint8Array[]): ArrayBuffer => {
  const metaLength = fieldTypeSizeBytes[FieldType.Uint32] * buffers.length;
  const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, metaLength);
  const result = new Uint8Array(totalLength);

  let offset = 0;

  for (let i = 0; i < buffers.length; i++) {
    const buffer = buffers[i];
    result[offset] = buffer.byteLength;
    offset += fieldTypeSizeBytes[FieldType.Uint32];
    result.set(buffer, offset);
    offset += buffer.byteLength;
  }

  return result.buffer;
}

export const unpackBatchBuffers = (buffer: ArrayBuffer): ArrayBuffer[] => {
  const buffers: ArrayBuffer[] = [];
  let offset = 0;

  const dataView = new DataView(buffer);

  while (offset < buffer.byteLength) {
    const length = dataView.getUint8(offset);
    offset += fieldTypeSizeBytes[FieldType.Uint32];
    const buf = buffer.slice(offset, offset + length);
    buffers.push(buf);
    offset += length;
  }

  return buffers;
}

const FLOAT32_BUFFER = new Float32Array(1);

export const toFloat32 = (value: number): number => {
  FLOAT32_BUFFER[0] = value;
  return FLOAT32_BUFFER[0];
};

function throwIfOutOfBounds(fieldKey: string, fieldType: FieldType, value: number): number {
  switch (fieldType) {
    case FieldType.Uint8:
      if (value < 0 || value > 0xff) throw new Error(`Value ${value} at ${fieldKey} out of bounds for Uint8`);
      return value;
    case FieldType.Uint16:
      if (value < 0 || value > 0xffff) throw new Error(`Value ${value} at ${fieldKey} out of bounds for Uint16`);
      return value;
    case FieldType.Uint32:
      if (value < 0 || value > 0xffffffff) throw new Error(`Value ${value} at ${fieldKey} out of bounds for Uint32`);
      return value >>> 0;
    case FieldType.Int8:
      if (value < -128 || value > 127) throw new Error(`Value ${value} at ${fieldKey} out of bounds for Int8`);
      return value | 0;
    case FieldType.Int16:
      if (value < -32768 || value > 32767) throw new Error(`Value ${value} at ${fieldKey} out of bounds for Int16`);
      return value | 0;
    case FieldType.Int32:
      return value | 0; // always in bounds
    case FieldType.Float32:
      return value; // always in bounds
    case FieldType.Float64:
      return value; // always in bounds
    default:
      throw new Error(`Unsupported field type ${fieldType} at ${fieldKey}`);
  }
}

function ensureCapacity(view: DataView, at: number, need: number, where: string): void {
  const remaining = view.byteLength - at;
  if (remaining < need) {
    throw new Error(`${where}: buffer too small (have ${remaining}, need ${need})`);
  }
}
