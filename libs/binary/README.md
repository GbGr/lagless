# @lagless/binary

## 1. Responsibility & Context

This library provides low-level binary serialization primitives for deterministic data encoding/decoding. It handles typed array operations, fixed-layout struct packing/unpacking with strict byte order, memory offset tracking during ArrayBuffer initialization, and variable-length input batch serialization. All ECS world state and network protocol messages rely on this library for byte-level representation.

## 2. Architecture Role

**Foundation layer** — sits at the bottom of the dependency graph. No dependencies on other `@lagless/*` packages. Upstream consumers: `@lagless/core` (for Mem ArrayBuffer layout), `@lagless/net-wire` (for protocol messages), `@lagless/math` (for Vector2Buffers), `tools/codegen` (generates schemas). This library defines the serialization contracts that enable deterministic snapshots and rollback.

## 3. Public API

### Core Types
- `FieldType` — Enum of supported binary types: `Int8`, `Uint8`, `Int16`, `Uint16`, `Int32`, `Uint32`, `Float32`, `Float64`
- `TypedArrayConstructor` — Union type of all TypedArray constructors (Uint8Array, Int32Array, etc.)
- `InferBinarySchemaValues<T>` — Extracts value types from a BinarySchema definition

### Binary Schema
- `BinarySchema<TSchema>` — Type-safe fixed-layout struct serializer. Constructor takes field definitions: `new BinarySchema({ fieldName: FieldType.Uint32, ... })`. Provides `pack(values)` → Uint8Array and `unpack(buffer)` → values.
- `BinarySchemaPackPipeline` — Accumulates multiple struct writes into a single buffer. Use `pack(schema, values)`, then `toBuffer()` to get final Uint8Array.
- `BinarySchemaUnpackPipeline` — Reads multiple structs from a single buffer. Initialize with Uint8Array, call `unpack(schema)` repeatedly, use `sliceRemaining()` for variable-length data.
- `InputBinarySchema<TSchema>` — Variable-length input batch serializer with ordinal support. Used for RPC input history serialization.

### Memory Management
- `MemoryTracker` — Tracks byte offset during ArrayBuffer initialization. Call `add(bytes)` to advance pointer. Has `ptr` property (current offset) and `reset()` method.
- `align8(byteOffset: number): number` — Round up to next 8-byte boundary. **Required before all struct allocations** to maintain alignment invariant.

### Utility Functions
- `binaryRead(dataView: DataView, offset: number, fieldType: FieldType): number` — Read single typed value from buffer at offset
- `binaryWrite(dataView: DataView, offset: number, fieldType: FieldType, value: number): void` — Write single typed value to buffer at offset
- `toFloat32(value: number): number` — Coerce to 32-bit float precision for cross-platform determinism
- `getFastHash(arrayBuffer: ArrayBuffer): number` — Hash of ArrayBuffer contents using hash-31 algorithm. Used for desync detection.
- `packBatchBuffers(buffers: Uint8Array[]): ArrayBuffer` — Concatenate multiple buffers with length prefixes into single ArrayBuffer
- `unpackBatchBuffers(buffer: ArrayBuffer): ArrayBuffer[]` — Split concatenated batch into individual ArrayBuffers

### Low-Level Utilities
- `LE` — `true` constant indicating little-endian byte order (used by all DataView read/write operations)
- `FieldTypeReverse` — Reverse mapping from FieldType enum values to string names
- `getTypeSizeBytes(type: string): number` — Byte size of each FieldType
- `fieldTypeSizeBytes: Record<FieldType, number>` — Map FieldType → byte size (lookup table)
- `typeToArrayConstructor: Record<string, TypedArrayConstructor>` — Map FieldType string → TypedArray constructor
- `typedArrayConstructors: Record<FieldType, TypedArrayConstructor>` — Map FieldType enum → TypedArray constructor
- `typeStringToFieldType: Record<string, FieldType>` — String name → FieldType enum value

## 4. Preconditions

- **No async initialization required** — all functions are synchronous
- ArrayBuffers used with BinarySchema must have sufficient capacity for the struct size
- Data passed to `unpack()` must match the schema that produced it (no runtime validation)
- For MemoryTracker: caller must allocate the ArrayBuffer before tracking begins

## 5. Postconditions

- **pack()** guarantees little-endian byte order, 8-byte-aligned struct layout if `align8()` was used correctly
- **unpack()** produces identical values to what was packed (bijection property)
- MemoryTracker.ptr always points to the next available byte (never regresses unless `reset()` is called)
- `toFloat32()` guarantees bit-identical float32 representation across platforms (no float64 precision surprises)

## 6. Invariants & Constraints

- **Little-endian byte order ALWAYS** — all reads/writes use little-endian (`LE = true` in DataView operations)
- **8-byte alignment** — all struct allocations in ArrayBuffer must be aligned via `align8()`. Violating this causes misaligned access on some architectures (undefined behavior).
- **Fixed struct size** — BinarySchema fields cannot be variable-length. Use separate serialization for strings/arrays.
- **Determinism** — Same input values → same output bytes. No timestamps, no floating-point non-determinism (use `toFloat32()` for consistency).
- **No validation** — unpacking malformed data produces garbage values, not errors. Validation is the caller's responsibility.

## 7. Safety Notes (AI Agent)

### Critical Rules
- **DO NOT** change byte order from little-endian — breaks cross-platform compatibility
- **DO NOT** skip `align8()` before struct allocations — causes memory corruption
- **DO NOT** add validation logic to pack/unpack — keep serialization fast and dumb
- **DO NOT** use `toFloat32()` on values that need float64 precision (coordinates, timestamps) — only for values that will be serialized as float32 anyway
- **DO NOT** reuse MemoryTracker instances across different ArrayBuffers without calling `reset()` — pointer will be invalid

### Common Mistakes
- Forgetting to align: `tracker.add(structSize)` without `align8(tracker.ptr)` first
- Using float64 in schema when you meant float32 (causes determinism issues if clients have different precision)
- Assuming `unpack()` validates data — it doesn't, malformed buffers produce garbage

## 8. Usage Examples

### Basic Struct Serialization
```typescript
import { BinarySchema, FieldType } from '@lagless/binary';

const PlayerSchema = new BinarySchema({
  id: FieldType.Uint32,
  health: FieldType.Float32,
  score: FieldType.Uint32,
});

// Pack
const bytes = PlayerSchema.pack({ id: 42, health: 100.5, score: 1234 });

// Unpack
const player = PlayerSchema.unpack(bytes);
// { id: 42, health: 100.5, score: 1234 }
```

### ArrayBuffer Memory Layout
```typescript
import { MemoryTracker, align8, BinarySchema, FieldType } from '@lagless/binary';

const tracker = new MemoryTracker();

// Calculate required size
const HeaderSchema = new BinarySchema({ version: FieldType.Uint32 });
tracker.add(align8(tracker.ptr)); // Align before header
tracker.add(HeaderSchema.byteLength);

const arrayBuffer = new ArrayBuffer(tracker.ptr);

// Initialize
tracker.reset();
const headerOffset = align8(tracker.ptr);
tracker.add(HeaderSchema.byteLength);

// Write header at aligned offset
const view = new DataView(arrayBuffer, headerOffset);
HeaderSchema.packInto(view, 0, { version: 1 });
```

### Pipeline for Multiple Structs
```typescript
import { BinarySchemaPackPipeline, BinarySchemaUnpackPipeline } from '@lagless/binary';

// Packing multiple structs
const pipeline = new BinarySchemaPackPipeline();
pipeline.pack(HeaderSchema, { version: 1 });
pipeline.pack(PlayerSchema, { id: 1, health: 100, score: 0 });
const buffer = pipeline.toBuffer();

// Unpacking
const unpacker = new BinarySchemaUnpackPipeline(buffer);
const header = unpacker.unpack(HeaderSchema);
const player = unpacker.unpack(PlayerSchema);
```

## 9. Testing Guidance

**Test suite:** `libs/binary/src/lib/binary.spec.ts`

**Run tests:**
```bash
# From monorepo root
npm test -- binary
```

**Test framework:** Vitest (or Jest — check package.json)

**Existing patterns:**
- Round-trip tests: pack → unpack → verify equality
- Byte-level assertions: check exact buffer contents
- Alignment tests: verify `align8()` math
- Edge cases: zero values, max values, negative numbers

## 10. Change Checklist

When modifying this library:

1. **Adding new FieldType:** Update `FieldType` enum, `getTypeSizeBytes()`, `typeToArrayConstructor`, `typeStringToFieldType`, `binaryRead()`, `binaryWrite()`
2. **Changing alignment rules:** Update all consumers (core Mem layout, codegen templates) — breaking change
3. **Modifying pack/unpack logic:** Run full test suite AND verify dependent modules still work (core snapshot, net-wire protocol)
4. **Performance optimization:** Benchmark before/after — serialization is hot path
5. **Update this README:** Especially Public API and Invariants sections

## 11. Integration Notes

### With @lagless/core
- Core uses `MemoryTracker` to lay out the `Mem` ArrayBuffer with managers in order
- Components use `BinarySchema` for generated pack/unpack methods
- Alignment via `align8()` is critical — misalignment breaks Mem snapshots

### With @lagless/net-wire
- Protocol messages (TickInput, Pong, etc.) are defined as `BinarySchema` instances
- `BinarySchemaPackPipeline` is used to concatenate header + payload
- Little-endian byte order is the wire format

### With tools/codegen
- Codegen generates `BinarySchema` definitions from YAML field types
- Generated component classes include `static schema: BinarySchema<...>`

## 12. Appendix

### Memory Layout: Typical ArrayBuffer Structure

```
┌─────────────────────────────────────────────────────────┐
│ Offset │ Size │ Content                                 │
├────────┼──────┼─────────────────────────────────────────┤
│ 0      │ 8    │ <padding for alignment>                 │
│ 8      │ 24   │ TickManager data                        │
│ 32     │ 0    │ <already aligned>                       │
│ 32     │ 40   │ PRNGManager data                        │
│ 72     │ 0    │ <already aligned>                       │
│ 72     │ ...  │ ComponentsManager data                  │
│ ...    │ ...  │ <more managers>                         │
└─────────────────────────────────────────────────────────┘

Key rules:
- Each manager allocation starts at align8(current_offset)
- This ensures 8-byte alignment for all structs
- Padding is added implicitly by align8() when needed
```

### FieldType Byte Sizes

| FieldType | Bytes | TypedArray     |
|-----------|-------|----------------|
| uint8     | 1     | Uint8Array     |
| uint16    | 2     | Uint16Array    |
| uint32    | 4     | Uint32Array    |
| int8      | 1     | Int8Array      |
| int16     | 2     | Int16Array     |
| int32     | 4     | Int32Array     |
| float32   | 4     | Float32Array   |
| float64   | 8     | Float64Array   |

### BinarySchema Internal Format

When a BinarySchema packs data:
1. Allocates buffer of `struct_size` bytes
2. Creates DataView for aligned access
3. Writes each field sequentially at its byte offset
4. Field offsets are computed from cumulative field sizes
5. Returns Uint8Array view of the buffer

Example: `{ a: uint32, b: float32 }` → 8 bytes total
- Byte 0-3: `a` (4 bytes, little-endian uint32)
- Byte 4-7: `b` (4 bytes, little-endian float32)
