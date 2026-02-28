import { describe, it, expect } from 'vitest';
import {
  packBatchBuffers,
  unpackBatchBuffers,
  BinarySchema,
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  FieldType,
  align8,
  MemoryTracker,
  toFloat32,
  getFastHash,
  truncateToFieldType,
  sanitizeInputData,
} from './binary.js';
import { InputFieldDefinition } from './types.js';

// ─────────────────────────────────────────────────────────────
// packBatchBuffers / unpackBatchBuffers
// ─────────────────────────────────────────────────────────────

describe('packBatchBuffers / unpackBatchBuffers', () => {
  it('should roundtrip empty array', () => {
    const packed = packBatchBuffers([]);
    expect(packed.byteLength).toBe(0);
    const unpacked = unpackBatchBuffers(packed);
    expect(unpacked).toEqual([]);
  });

  it('should roundtrip single small buffer', () => {
    const input = [new Uint8Array([1, 2, 3])];
    const packed = packBatchBuffers(input);
    const unpacked = unpackBatchBuffers(packed);

    expect(unpacked.length).toBe(1);
    expect(new Uint8Array(unpacked[0])).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('should roundtrip multiple buffers', () => {
    const input = [
      new Uint8Array([10, 20]),
      new Uint8Array([30, 40, 50]),
      new Uint8Array([60]),
    ];
    const packed = packBatchBuffers(input);
    const unpacked = unpackBatchBuffers(packed);

    expect(unpacked.length).toBe(3);
    expect(new Uint8Array(unpacked[0])).toEqual(new Uint8Array([10, 20]));
    expect(new Uint8Array(unpacked[1])).toEqual(new Uint8Array([30, 40, 50]));
    expect(new Uint8Array(unpacked[2])).toEqual(new Uint8Array([60]));
  });

  it('should handle buffers larger than 255 bytes', () => {
    const largeData = new Uint8Array(500);
    for (let i = 0; i < 500; i++) largeData[i] = i % 256;

    const input = [largeData];
    const packed = packBatchBuffers(input);
    const unpacked = unpackBatchBuffers(packed);

    expect(unpacked.length).toBe(1);
    expect(new Uint8Array(unpacked[0])).toEqual(largeData);
  });

  it('should handle buffers larger than 65535 bytes (exceeding Uint16 range)', () => {
    const size = 70_000;
    const largeData = new Uint8Array(size);
    for (let i = 0; i < size; i++) largeData[i] = i % 256;

    const input = [largeData];
    const packed = packBatchBuffers(input);
    const unpacked = unpackBatchBuffers(packed);

    expect(unpacked.length).toBe(1);
    expect(unpacked[0].byteLength).toBe(size);
    expect(new Uint8Array(unpacked[0])).toEqual(largeData);
  });

  it('should handle empty buffers in the batch', () => {
    const input = [
      new Uint8Array([1, 2]),
      new Uint8Array(0),
      new Uint8Array([3]),
    ];
    const packed = packBatchBuffers(input);
    const unpacked = unpackBatchBuffers(packed);

    expect(unpacked.length).toBe(3);
    expect(new Uint8Array(unpacked[0])).toEqual(new Uint8Array([1, 2]));
    expect(unpacked[1].byteLength).toBe(0);
    expect(new Uint8Array(unpacked[2])).toEqual(new Uint8Array([3]));
  });

  it('should produce correct total byte length', () => {
    // Each buffer: 4 bytes length prefix + N bytes data
    const input = [
      new Uint8Array(10),
      new Uint8Array(20),
    ];
    const packed = packBatchBuffers(input);
    // 4 + 10 + 4 + 20 = 38
    expect(packed.byteLength).toBe(38);
  });

  it('should throw on truncated buffer during unpack', () => {
    // Create a valid packed buffer then truncate it
    const input = [new Uint8Array([1, 2, 3])];
    const packed = packBatchBuffers(input);
    const truncated = packed.slice(0, 5); // cut off data

    expect(() => unpackBatchBuffers(truncated)).toThrow(/Truncated/);
  });

  it('should throw when length prefix is truncated', () => {
    // Only 2 bytes — not enough for a Uint32 length prefix
    const badBuffer = new ArrayBuffer(2);
    expect(() => unpackBatchBuffers(badBuffer)).toThrow(/Truncated/);
  });
});

// ─────────────────────────────────────────────────────────────
// BinarySchema
// ─────────────────────────────────────────────────────────────

describe('BinarySchema', () => {
  it('should pack and unpack simple schema', () => {
    const schema = new BinarySchema({
      x: FieldType.Float32,
      y: FieldType.Float32,
    });

    const packed = schema.pack({ x: 1.5, y: 2.5 });
    const unpacked = schema.unpack(packed);

    expect(unpacked.x).toBeCloseTo(1.5);
    expect(unpacked.y).toBeCloseTo(2.5);
  });

  it('should pack and unpack all field types', () => {
    const schema = new BinarySchema({
      a: FieldType.Int8,
      b: FieldType.Uint8,
      c: FieldType.Int16,
      d: FieldType.Uint16,
      e: FieldType.Int32,
      f: FieldType.Uint32,
      g: FieldType.Float32,
      h: FieldType.Float64,
    });

    const values = {
      a: -42,
      b: 200,
      c: -1000,
      d: 50000,
      e: -100000,
      f: 3000000000,
      g: 3.14,
      h: 2.718281828459045,
    };

    const packed = schema.pack(values);
    const unpacked = schema.unpack(packed);

    expect(unpacked.a).toBe(-42);
    expect(unpacked.b).toBe(200);
    expect(unpacked.c).toBe(-1000);
    expect(unpacked.d).toBe(50000);
    expect(unpacked.e).toBe(-100000);
    expect(unpacked.f).toBe(3000000000);
    expect(unpacked.g).toBeCloseTo(3.14, 5);
    expect(unpacked.h).toBeCloseTo(2.718281828459045, 14);
  });

  it('should calculate correct byteLength', () => {
    const schema = new BinarySchema({
      a: FieldType.Uint8,    // 1
      b: FieldType.Uint32,   // 4
      c: FieldType.Float64,  // 8
    });
    expect(schema.byteLength).toBe(13);
  });

  it('should throw on out-of-bounds values', () => {
    const schema = new BinarySchema({ v: FieldType.Uint8 });
    expect(() => schema.pack({ v: 256 })).toThrow(/out of bounds/);
    expect(() => schema.pack({ v: -1 })).toThrow(/out of bounds/);
  });

  it('should throw on NaN/undefined values', () => {
    const schema = new BinarySchema({ v: FieldType.Uint8 });
    expect(() => schema.pack({ v: NaN })).toThrow(/Unexpected value/);
  });
});

// ─────────────────────────────────────────────────────────────
// BinarySchemaPackPipeline / UnpackPipeline
// ─────────────────────────────────────────────────────────────

describe('BinarySchemaPackPipeline / UnpackPipeline', () => {
  it('should pack multiple schemas and unpack sequentially', () => {
    const headerSchema = new BinarySchema({
      version: FieldType.Uint8,
      type: FieldType.Uint8,
    });
    const bodySchema = new BinarySchema({
      x: FieldType.Float32,
      y: FieldType.Float32,
    });

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(headerSchema, { version: 1, type: 5 });
    pipeline.pack(bodySchema, { x: 10.5, y: 20.5 });

    const packed = pipeline.toUint8Array();

    const unpackPipeline = new BinarySchemaUnpackPipeline(packed.buffer as ArrayBuffer);
    const header = unpackPipeline.unpack(headerSchema);
    const body = unpackPipeline.unpack(bodySchema);

    expect(header.version).toBe(1);
    expect(header.type).toBe(5);
    expect(body.x).toBeCloseTo(10.5);
    expect(body.y).toBeCloseTo(20.5);
  });

  it('should support appendBuffer for raw data', () => {
    const headerSchema = new BinarySchema({ type: FieldType.Uint8 });
    const rawPayload = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(headerSchema, { type: 42 });
    pipeline.appendBuffer(rawPayload.buffer as ArrayBuffer);

    const packed = pipeline.toUint8Array();

    const unpackPipeline = new BinarySchemaUnpackPipeline(packed.buffer as ArrayBuffer);
    const header = unpackPipeline.unpack(headerSchema);
    const remaining = new Uint8Array(unpackPipeline.sliceRemaining());

    expect(header.type).toBe(42);
    expect(remaining).toEqual(rawPayload);
  });
});

// ─────────────────────────────────────────────────────────────
// MemoryTracker
// ─────────────────────────────────────────────────────────────

describe('MemoryTracker', () => {
  it('should start at 0 by default', () => {
    const tracker = new MemoryTracker();
    expect(tracker.ptr).toBe(0);
  });

  it('should start at custom offset', () => {
    const tracker = new MemoryTracker(64);
    expect(tracker.ptr).toBe(64);
  });

  it('should align to 8 bytes', () => {
    const tracker = new MemoryTracker();
    tracker.add(1);  // 1 → align to 8
    expect(tracker.ptr).toBe(8);
    tracker.add(3);  // 3 → align to 8
    expect(tracker.ptr).toBe(16);
    tracker.add(8);  // 8 → already aligned
    expect(tracker.ptr).toBe(24);
    tracker.add(9);  // 9 → align to 16
    expect(tracker.ptr).toBe(40);
  });
});

// ─────────────────────────────────────────────────────────────
// align8
// ─────────────────────────────────────────────────────────────

describe('align8', () => {
  it('should align values to 8-byte boundary', () => {
    expect(align8(0)).toBe(0);
    expect(align8(1)).toBe(8);
    expect(align8(7)).toBe(8);
    expect(align8(8)).toBe(8);
    expect(align8(9)).toBe(16);
    expect(align8(16)).toBe(16);
    expect(align8(17)).toBe(24);
  });
});

// ─────────────────────────────────────────────────────────────
// toFloat32 / getFastHash
// ─────────────────────────────────────────────────────────────

describe('toFloat32', () => {
  it('should round-trip to Float32 precision', () => {
    const val = toFloat32(3.141592653589793);
    expect(val).toBeCloseTo(3.14159, 5);
    expect(val).not.toBe(3.141592653589793); // precision loss
  });
});

// ─────────────────────────────────────────────────────────────
// truncateToFieldType
// ─────────────────────────────────────────────────────────────

describe('truncateToFieldType', () => {
  it('should truncate float32', () => {
    const v = truncateToFieldType(FieldType.Float32, 3.141592653589793);
    expect(v).toBe(Math.fround(3.141592653589793));
    expect(v).not.toBe(3.141592653589793);
  });

  it('should not change float64', () => {
    const v = truncateToFieldType(FieldType.Float64, 3.141592653589793);
    expect(v).toBe(3.141592653589793);
  });

  it('should truncate uint8', () => {
    expect(truncateToFieldType(FieldType.Uint8, 256)).toBe(0);
    expect(truncateToFieldType(FieldType.Uint8, 255)).toBe(255);
    expect(truncateToFieldType(FieldType.Uint8, 0x1FF)).toBe(0xFF);
  });

  it('should truncate uint16', () => {
    expect(truncateToFieldType(FieldType.Uint16, 65536)).toBe(0);
    expect(truncateToFieldType(FieldType.Uint16, 65535)).toBe(65535);
  });

  it('should truncate uint32', () => {
    expect(truncateToFieldType(FieldType.Uint32, 4294967296)).toBe(0);
    expect(truncateToFieldType(FieldType.Uint32, 4294967295)).toBe(4294967295);
  });

  it('should truncate int8', () => {
    expect(truncateToFieldType(FieldType.Int8, 128)).toBe(-128);
    expect(truncateToFieldType(FieldType.Int8, -129)).toBe(127);
    expect(truncateToFieldType(FieldType.Int8, 127)).toBe(127);
  });

  it('should truncate int16', () => {
    expect(truncateToFieldType(FieldType.Int16, 32768)).toBe(-32768);
    expect(truncateToFieldType(FieldType.Int16, -32769)).toBe(32767);
  });

  it('should truncate int32', () => {
    expect(truncateToFieldType(FieldType.Int32, 2147483648)).toBe(-2147483648);
    expect(truncateToFieldType(FieldType.Int32, 2.5)).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// sanitizeInputData
// ─────────────────────────────────────────────────────────────

describe('sanitizeInputData', () => {
  it('should truncate float32 fields to float32 precision', () => {
    const fields: InputFieldDefinition[] = [
      { name: 'dirX', type: FieldType.Float32, isArray: false, byteLength: 4 },
      { name: 'dirY', type: FieldType.Float32, isArray: false, byteLength: 4 },
    ];
    const data: Record<string, number> = { dirX: 0.7071067811865476, dirY: 0.7071067811865476 };
    sanitizeInputData(fields, data);
    expect(data.dirX).toBe(Math.fround(0.7071067811865476));
    expect(data.dirY).toBe(Math.fround(0.7071067811865476));
  });

  it('should truncate mixed field types correctly', () => {
    const fields: InputFieldDefinition[] = [
      { name: 'slot', type: FieldType.Uint8, isArray: false, byteLength: 1 },
      { name: 'value', type: FieldType.Float32, isArray: false, byteLength: 4 },
      { name: 'bigVal', type: FieldType.Float64, isArray: false, byteLength: 8 },
    ];
    const data: Record<string, number> = { slot: 5, value: 1.23456789, bigVal: 1.23456789 };
    sanitizeInputData(fields, data);
    expect(data.slot).toBe(5);
    expect(data.value).toBe(Math.fround(1.23456789));
    expect(data.bigVal).toBe(1.23456789);
  });

  it('should skip array fields', () => {
    const fields: InputFieldDefinition[] = [
      { name: 'id', type: FieldType.Uint8, isArray: true, arrayLength: 16, byteLength: 16 },
      { name: 'val', type: FieldType.Float32, isArray: false, byteLength: 4 },
    ];
    const arr = new Uint8Array(16);
    arr[0] = 42;
    const data: Record<string, number | Uint8Array> = { id: arr, val: 1.5 };
    sanitizeInputData(fields, data);
    expect(data.id).toBe(arr); // untouched
    expect(data.val).toBe(Math.fround(1.5));
  });
});

describe('getFastHash', () => {
  it('should produce consistent hash for same input', () => {
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(getFastHash(buf)).toBe(getFastHash(buf));
  });

  it('should produce different hashes for different input', () => {
    const buf1 = new Uint8Array([1, 2, 3, 4]).buffer;
    const buf2 = new Uint8Array([4, 3, 2, 1]).buffer;
    expect(getFastHash(buf1)).not.toBe(getFastHash(buf2));
  });

  it('should return 0 for empty buffer', () => {
    expect(getFastHash(new ArrayBuffer(0))).toBe(0);
  });
});
