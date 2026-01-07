# AGENTS.md - @lagless/binary

AI coding guide for the binary serialization module.

## Module Purpose

Low-level binary data handling for:
- Memory-efficient component storage (typed arrays)
- Network packet serialization/deserialization
- Input/RPC binary encoding
- Memory allocation tracking

## Key Exports

```typescript
// Field type enumeration
export enum FieldType {
  Int8, Uint8, Int16, Uint16, Int32, Uint32, Float32, Float64
}

// Type mapping utilities
export const typeToArrayConstructor: Record<string, TypedArrayConstructor>;
export const typedArrayConstructors: Record<FieldType, TypedArrayConstructor>;
export const typeStringToFieldType: Record<string, FieldType>;
export function getTypeSizeBytes(type: string): number;

// Binary read/write
export function binaryWrite(dataView: DataView, offset: number, fieldType: FieldType, value: number): void;
export function binaryRead(dataView: DataView, offset: number, fieldType: FieldType): number;

// Schema classes
export class BinarySchema<T>;
export class BinarySchemaPackPipeline;
export class BinarySchemaUnpackPipeline;
export class InputBinarySchema;

// Memory management
export class MemoryTracker;

// Utilities
export function align8(value: number): number;
export function getFastHash(buffer: ArrayBuffer): number;
export function toFloat32(value: number): number;
```

## Type System

### Supported Types

| YAML Type | FieldType Enum | TypedArray | Bytes | Range |
|-----------|---------------|------------|-------|-------|
| `int8` | `FieldType.Int8` | `Int8Array` | 1 | -128 to 127 |
| `uint8` | `FieldType.Uint8` | `Uint8Array` | 1 | 0 to 255 |
| `int16` | `FieldType.Int16` | `Int16Array` | 2 | -32768 to 32767 |
| `uint16` | `FieldType.Uint16` | `Uint16Array` | 2 | 0 to 65535 |
| `int32` | `FieldType.Int32` | `Int32Array` | 4 | -2^31 to 2^31-1 |
| `uint32` | `FieldType.Uint32` | `Uint32Array` | 4 | 0 to 2^32-1 |
| `float32` | `FieldType.Float32` | `Float32Array` | 4 | IEEE 754 |
| `float64` | `FieldType.Float64` | `Float64Array` | 8 | IEEE 754 |

### Array Types

Arrays are defined with fixed length in schema: `uint8[16]`

Parsed structure:
```typescript
interface FieldDefinition {
  type: string;        // "uint8"
  isArray: boolean;    // true
  arrayLength?: number; // 16
}
```

## BinarySchema Usage

### Creating a Schema

```typescript
import { BinarySchema, FieldType } from '@lagless/binary';

const playerSchema = new BinarySchema({
  posX: FieldType.Float32,
  posY: FieldType.Float32,
  health: FieldType.Uint16,
  flags: FieldType.Uint8,
});

// Schema byte length (aligned)
console.log(playerSchema.byteLength); // 11 bytes
```

### Pack/Unpack

```typescript
// Pack to Uint8Array
const packed = playerSchema.pack({
  posX: 100.5,
  posY: 200.25,
  health: 100,
  flags: 3,
});

// Unpack from Uint8Array
const data = playerSchema.unpack(packed);
// { posX: 100.5, posY: 200.25, health: 100, flags: 3 }
```

### Pack/Unpack with DataView

```typescript
// For direct buffer manipulation
const buffer = new ArrayBuffer(1024);
const view = new DataView(buffer);

// Pack at offset
playerSchema.packInto(view, 0, { posX: 10, posY: 20, health: 50, flags: 1 });

// Unpack from offset
const data = playerSchema.unpackFrom(view, 0);
```

### Fast Hash

```typescript
// Get hash for comparison (determinism check)
const hash = playerSchema.getFastHashFrom(view, offset);
```

## InputBinarySchema

For serializing variable-structure input RPCs:

### Pack Batch

```typescript
import { InputBinarySchema, FieldType } from '@lagless/binary';

// Registry must provide schema for each input ID
const registry = {
  get(id: number) {
    switch(id) {
      case 1: return {
        id: 1,
        fields: [
          { name: 'direction', type: FieldType.Float32, isArray: false, byteLength: 4 },
          { name: 'speed', type: FieldType.Float32, isArray: false, byteLength: 4 },
        ],
        byteLength: 8,
      };
      // ... other inputs
    }
  }
};

const buffer = InputBinarySchema.packBatch(registry, [
  { inputId: 1, ordinal: 1, values: { direction: 1.57, speed: 0.8 } },
  { inputId: 1, ordinal: 2, values: { direction: 0, speed: 0 } },
]);
```

### Unpack Batch

```typescript
const inputs = InputBinarySchema.unpackBatch(registry, buffer);
// Returns: Array<{ inputId, ordinal, values }>
```

### Wire Format

```
For each input in batch:
┌──────────┬──────────┬─────────────────┐
│ inputId  │ ordinal  │ fields...       │
│ (uint8)  │ (uint32) │ (variable)      │
└──────────┴──────────┴─────────────────┘
```

## MemoryTracker

Tracks allocation positions in a shared ArrayBuffer:

```typescript
import { MemoryTracker } from '@lagless/binary';

const tracker = new MemoryTracker(0);

// Components reserve space
const transform2dOffset = tracker.ptr;
tracker.add(maxEntities * 4 * 6); // 6 float32 fields

const velocityOffset = tracker.ptr;
tracker.add(maxEntities * 4 * 3); // 3 float32 fields

// Total buffer size needed
const totalSize = tracker.ptr;

// Create shared buffer
const buffer = new ArrayBuffer(totalSize);

// Create typed arrays at tracked offsets
const posX = new Float32Array(buffer, transform2dOffset, maxEntities);
```

### Alignment

All allocations are automatically aligned to 8 bytes:

```typescript
import { align8 } from '@lagless/binary';

align8(1);  // 8
align8(9);  // 16
align8(16); // 16
```

## Low-Level Read/Write

### Direct DataView Operations

```typescript
import { binaryWrite, binaryRead, FieldType, LE } from '@lagless/binary';

const buffer = new ArrayBuffer(64);
const view = new DataView(buffer);

// Write values
let offset = 0;
binaryWrite(view, offset, FieldType.Uint32, 12345);
offset += 4;
binaryWrite(view, offset, FieldType.Float32, 3.14159);
offset += 4;

// Read values
const id = binaryRead(view, 0, FieldType.Uint32);     // 12345
const value = binaryRead(view, 4, FieldType.Float32); // 3.14159
```

### Endianness

All operations use **little-endian** byte order (defined as `LE = true`).

## Utility Functions

### toFloat32

Truncate float64 to float32 precision (matches typed array behavior):

```typescript
import { toFloat32 } from '@lagless/binary';

const precise = 1.23456789012345;
const truncated = toFloat32(precise); // ~1.2345679
```

### getFastHash

Fast hash for ArrayBuffer contents (for determinism verification):

```typescript
import { getFastHash } from '@lagless/binary';

const hash = getFastHash(buffer);
// 32-bit unsigned integer hash
```

## Common Patterns

### Validate Bounds

BinarySchema automatically validates values:

```typescript
// These throw errors:
schema.pack({ health: -1 });    // Uint16 can't be negative
schema.pack({ flags: 256 });    // Uint8 max is 255
schema.pack({ x: NaN });        // NaN not allowed
```

### Buffer Capacity Checks

Operations check buffer bounds:

```typescript
// Throws if buffer too small
schema.packInto(smallView, 0, values);
// Error: "BinarySchema.packInto: buffer too small (have 4, need 11)"
```

## Integration Points

### Used By

- **@lagless/core**: Memory management, component storage
- **tools/codegen**: Generated component/input classes use these types
- **@lagless/net-wire**: Network packet serialization

### Generated Code Example

```typescript
// Generated by codegen - uses binary module
import { MemoryTracker } from '@lagless/binary';

export class Transform2d {
  public static readonly schema = {
    positionX: Float32Array,
    positionY: Float32Array,
    rotation: Float32Array,
  };

  constructor(maxEntities: number, buffer: ArrayBuffer, memTracker: MemoryTracker) {
    for (const [fieldName, TypedArrayConstructor] of Object.entries(Transform2d.schema)) {
      const typedArray = new TypedArrayConstructor(buffer, memTracker.ptr, maxEntities);
      this.unsafe[fieldName] = typedArray;
      memTracker.add(typedArray.byteLength);
    }
  }
}
```

## File Structure

```
libs/binary/
├── src/
│   ├── index.ts          # Public exports
│   └── lib/
│       ├── binary.ts     # Main implementation
│       └── types.ts      # TypedArray type definitions
├── package.json
└── README.md
```

## DO's and DON'Ts

### DO

- Use `FieldType` enum for type-safe schema definitions
- Check `byteLength` before allocation
- Use `align8()` for manual memory layout
- Validate input ranges match field types

### DON'T

- Assume big-endian byte order (always little-endian)
- Pack NaN, Infinity, or undefined values
- Exceed typed array bounds
- Modify shared buffers without proper synchronization
