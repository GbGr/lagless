# @lagless/binary

Binary serialization utilities for the Lagless framework. Provides typed array operations, binary schema packing/unpacking, and memory tracking.

## Installation

```bash
pnpm add @lagless/binary
```

## Overview

This module provides low-level binary data handling for:

- Efficient network serialization
- Memory-mapped component storage
- Input/RPC binary encoding

## API Reference

### Field Types

```typescript
import { FieldType } from '@lagless/binary';

enum FieldType {
  Int8,    // 1 byte, signed
  Uint8,   // 1 byte, unsigned
  Int16,   // 2 bytes, signed
  Uint16,  // 2 bytes, unsigned
  Int32,   // 4 bytes, signed
  Uint32,  // 4 bytes, unsigned
  Float32, // 4 bytes, IEEE 754 single precision
  Float64, // 8 bytes, IEEE 754 double precision
}
```

### Type Mapping

```typescript
import { typeToArrayConstructor, getTypeSizeBytes } from '@lagless/binary';

// String type to TypedArray constructor
const Constructor = typeToArrayConstructor['float32']; // Float32Array

// Get byte size of a type
const size = getTypeSizeBytes('float32'); // 4
```

### BinarySchema

Pack and unpack structured data:

```typescript
import { BinarySchema, FieldType } from '@lagless/binary';

const schema = new BinarySchema({
  x: FieldType.Float32,
  y: FieldType.Float32,
  health: FieldType.Uint16,
});

// Pack values to Uint8Array
const packed = schema.pack({ x: 100.5, y: 200.25, health: 100 });

// Unpack from Uint8Array
const values = schema.unpack(packed);
// { x: 100.5, y: 200.25, health: 100 }

// Pack into existing DataView
schema.packInto(dataView, offset, values);

// Unpack from DataView at offset
const values2 = schema.unpackFrom(dataView, offset);
```

### BinarySchemaPackPipeline / BinarySchemaUnpackPipeline

Chain multiple schemas for complex packets:

```typescript
import {
  BinarySchema,
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  FieldType
} from '@lagless/binary';

const headerSchema = new BinarySchema({
  messageType: FieldType.Uint8,
  tick: FieldType.Uint32,
});

const payloadSchema = new BinarySchema({
  x: FieldType.Float32,
  y: FieldType.Float32,
});

// Packing
const pipeline = new BinarySchemaPackPipeline();
pipeline.pack(headerSchema, { messageType: 1, tick: 100 });
pipeline.pack(payloadSchema, { x: 50.0, y: 75.0 });
const buffer = pipeline.toUint8Array();

// Unpacking
const unpackPipeline = new BinarySchemaUnpackPipeline(buffer.buffer);
const header = unpackPipeline.unpack(headerSchema);
const payload = unpackPipeline.unpack(payloadSchema);
```

### InputBinarySchema

Pack/unpack input RPCs with variable structure:

```typescript
import { InputBinarySchema } from '@lagless/binary';

// Registry provides schema info for each input type
const registry = {
  get(id: number) {
    return inputDefinitions[id];
  }
};

// Pack multiple inputs
const buffer = InputBinarySchema.packBatch(registry, [
  { inputId: 1, ordinal: 1, values: { direction: 1.57, speed: 1.0 } },
  { inputId: 2, ordinal: 2, values: { targetEntity: 5 } },
]);

// Unpack
const inputs = InputBinarySchema.unpackBatch(registry, buffer);
```

### MemoryTracker

Track memory allocation in an ArrayBuffer:

```typescript
import { MemoryTracker } from '@lagless/binary';

const tracker = new MemoryTracker(0); // Start at offset 0

// Reserve space (aligned to 8 bytes)
const offset1 = tracker.ptr;
tracker.add(100); // Reserve 100 bytes

const offset2 = tracker.ptr;
tracker.add(50);  // Reserve 50 bytes

// Total allocated
const totalSize = tracker.ptr;
```

### Binary Read/Write

Low-level read/write operations:

```typescript
import { binaryWrite, binaryRead, FieldType, LE } from '@lagless/binary';

const buffer = new ArrayBuffer(16);
const view = new DataView(buffer);

// Write
binaryWrite(view, 0, FieldType.Float32, 123.456);
binaryWrite(view, 4, FieldType.Uint32, 42);

// Read
const floatVal = binaryRead(view, 0, FieldType.Float32); // 123.456
const uintVal = binaryRead(view, 4, FieldType.Uint32);   // 42
```

### Utility Functions

```typescript
import { align8, getFastHash, toFloat32 } from '@lagless/binary';

// Align value to 8-byte boundary
const aligned = align8(13); // 16

// Get fast hash of ArrayBuffer
const hash = getFastHash(buffer);

// Convert to float32 precision (truncate float64)
const f32 = toFloat32(1.23456789012345); // Lower precision
```

## TypedArray Types

```typescript
import { TypedArray, TypedArrayConstructor } from '@lagless/binary';

type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;
```

## Usage in Lagless

This module is primarily used internally by:

- **Code Generation**: Component field storage schemas
- **Input System**: RPC serialization
- **Memory Management**: Buffer allocation tracking
- **Network Protocol**: Wire format encoding

Direct usage is typically not needed unless building custom networking or storage solutions.
