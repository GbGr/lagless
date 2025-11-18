# `@lagless/binary`

> Deterministic byte-level serialization helpers used for input commands, rollback snapshots, and wire protocols.

## 1. Responsibility & Context

- **Primary responsibility**: Encode/decode structured data using typed arrays and schema definitions with strict little-endian ordering.
- **Upstream dependencies**: Native `TypedArray` constructors only (no external network libs).
- **Downstream consumers**: `@lagless/net-wire`, `@lagless/core` snapshot storage, relay services, and test fixtures.
- **ECS lifecycle role**: `Utility / Network`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | N/A; used during encode/decode operations |
| Authority | Respects whichever ECS world consumes/produces binary packets |
| Persistence strategy | Serializes state or inputs into `ArrayBuffer` instances using deterministic schemas |
| Network boundary | Defines how input-only payloads are structured before transport |

### 2.1 Simulation / Rollback / Resimulate

- Snapshot buffers generated in `@lagless/core` rely on these helpers for deterministic size calculations and byte layout.
- `SnapshotHistory` can replay data because binary read/write functions are pure and little-endian by default (`LE = true`).

### 2.2 Networking Interaction

- Input relays and net-wire modules build schemas on top of `BinarySchema`/`BinarySchemaUnpackPipeline`.
- Because only player input/high-level commands travel across the network, ensure schemas never expose authoritative world state directly.

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `FieldType`, `fieldTypeSizeBytes` | enums/maps | Canonical field descriptors and sizes for packed data. | Stable |
| `binaryWrite` / `binaryRead` | functions | Endian-safe write/read helpers for `DataView`. | Stable |
| `BinarySchema`, `BinarySchemaPackPipeline`, `BinarySchemaUnpackPipeline` | classes | Declarative schema builder + pack/unpack utilities. | Stable |
| `typeToArrayConstructor`, `TypedArrayConstructor` | maps/types | Helpers for mapping schema strings to typed arrays. | Stable |

## 4. Preconditions

- Schemas must be defined using supported `FieldType` entries (int8/uint8/.../float64). Custom sizes require extending both maps.
- Consumers must manage buffer allocation; helpers assume provided `ArrayBuffer` has sufficient length.

## 5. Postconditions

- Writes/read operations leave buffers in a deterministic state; repeated serialization with the same inputs produces identical byte sequences.
- Schema pack pipelines update their `offset` predictably; after packing, `_offset` equals schema width.

## 6. Invariants & Constraints

- Little-endian ordering (`LE = true`) is enforced for every multi-byte write; do not mix endianness across modules.
- Schema definitions should remain stable or versioned—changing field order/width requires bumping command versions in `@lagless/net-wire`.
- Avoid dynamic-length fields; use fixed-size components or explicit length prefixes if necessary.

## 7. Safety Notes & Implementation Notes for AI Agents

- Never serialize authoritative ECS state for transport; keep usage scoped to inputs, commands, or compressed snapshots per constitution.
- When extending schemas, document new command versions and update dependent READMEs/tests simultaneously.
- Ensure Buffer/DataView offsets match schema definitions; off-by-one errors can corrupt rollback history.
- Do not add implicit allocations inside tight loops—schema packers should operate on preallocated buffers.

## 8. Example Usage

```ts
import { BinarySchema, FieldType, binaryWrite } from '@lagless/binary';

const InputSchema = new BinarySchema({ angle: FieldType.Float32, thrust: FieldType.Uint8 });
const buffer = new ArrayBuffer(InputSchema.byteLength);
const pipeline = InputSchema.pack(buffer);

binaryWrite(pipeline.dataView, pipeline.offset, FieldType.Float32, playerAngle);
binaryWrite(pipeline.dataView, pipeline.offset + 4, FieldType.Uint8, thrustValue);
```

## 9. Testing Guidance

- Run `nx test @lagless/binary`.
- Add regression tests whenever introducing new field types or pack/unpack helpers:
  - Schema byte-length calculations.
  - Round-trip encode/decode for command payloads.
  - Snapshot compatibility with historical buffers.

## 10. Change Checklist

- [ ] Endianness documented (still little-endian) and unchanged unless versioned.
- [ ] New schemas/field types accompanied by README + test updates.
- [ ] Downstream modules (`net-wire`, relays) notified of schema changes.
- [ ] `docs/ecs-documentation-spec.md` references updated if public API surface shifts.

## 11. Integration Notes (Optional)

- Combine with `@lagless/net-wire` command codecs; ensure both sides use identical schema definitions.
- Snapshot storage in `@lagless/core` may use the same helpers for constant-size records.

## 12. Appendix (Optional)

- See `libs/binary/src/lib/types.ts` for strongly typed schema definitions, including `InputFieldDefinition`.
