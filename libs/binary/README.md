# `@lagless/binary`

## What it is
`@lagless/binary` is the low-level, deterministic serialization layer for Lagless. It provides fixed-size field types, schema helpers, and buffer utilities used by ECS components, inputs, and wire protocols.

## Why it exists / when to use it
Use it when you need stable byte layouts for inputs or component memory. It powers codegen output, net-wire packets, and snapshot serialization. Do not use it for JSON-like or variable-length payloads.

## Public API
- `FieldType`, `fieldTypeSizeBytes`, `typeToArrayConstructor`: canonical field definitions and sizes
- `BinarySchema`, `BinarySchemaPackPipeline`, `BinarySchemaUnpackPipeline`: schema-based pack/unpack helpers
- `binaryWrite`, `binaryRead`: endian-safe DataView helpers
- `MemoryTracker`, `align8`: deterministic memory layout helpers for ECS data
- `toFloat32`, `getFastHash`: utility helpers for float coercion and buffer hashing

## Typical usage
Circle Sumo coerces inputs to float32 before sending them through RPC inputs:

```ts
import { toFloat32 } from '@lagless/binary';

const angle = toFloat32(MathOps.atan2(dy, dx));
moveInput.direction = angle;
```

## Key concepts & data flow
- All multi-byte fields are little-endian and fixed-size.
- Schemas describe a deterministic byte layout for packing and unpacking.
- `MemoryTracker` aligns component buffers to 8-byte boundaries for ECS memory blocks.
- Codegen consumes `FieldType` and `MemoryTracker` to build component classes.

## Configuration and environment assumptions
- Requires TypedArray and DataView support.
- Field sizes are fixed; changing field order or width is a breaking protocol change.

## Pitfalls / common mistakes
- Mixing endianness or field ordering between writer and reader.
- Mutating schemas without updating `@lagless/net-wire` or codegen outputs.
- Allocating buffers smaller than schema byte length.

## Related modules
- `libs/net-wire` for packet schemas that sit on top of these helpers.
- `tools/codegen` for schema-driven ECS generation.
- `circle-sumo/circle-sumo-simulation` generated components and inputs.
