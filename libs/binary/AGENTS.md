# AGENTS: @lagless/binary

## Purpose and boundaries
- Provide deterministic, fixed-size binary helpers for ECS inputs, snapshots, and wire protocols.
- Not responsible for transport, networking, or higher-level schemas.

## Imports and entry points
- `libs/binary/src/index.ts` (public exports)
- `libs/binary/src/lib/binary.ts` (FieldType, schema classes, helpers)
- `libs/binary/src/lib/types.ts` (TypedArray and schema types)

## Common tasks -> files
- Add a new field type: update `FieldType`, `fieldTypeSizeBytes`, `typedArrayConstructors`, and read/write paths in `libs/binary/src/lib/binary.ts`.
- Add a helper for pack/unpack: `libs/binary/src/lib/binary.ts`.
- Update docs/examples: `libs/binary/README.md`.

## Integration points
- `libs/net-wire` builds packet schemas on top of `BinarySchema`.
- `tools/codegen` reads `FieldType` and `MemoryTracker` for generated ECS classes.
- Circle Sumo uses `toFloat32` in input preparation (`circle-sumo/circle-sumo-game/src/app/game-view/components/direction-arrow-view.tsx`).

## Invariants and rules
- Little-endian ordering must remain consistent across all helpers.
- Schema byte lengths must be deterministic and stable.
- Do not introduce variable-length fields without explicit length metadata.

## Workflow for modifications
- Update code, then update any downstream schema usage (net-wire, codegen templates).
- Add or adjust tests if field sizes or pack/unpack behavior changes.
- Verify with `nx lint @lagless/binary`, `nx typecheck @lagless/binary`, and `nx test @lagless/binary`.

## Example future AI tasks
1) Add an Int64 field type: implement read/write paths and size maps, then update net-wire schemas and docs.
2) Add a schema validation helper: implement in `binary.ts`, export, document in README.
3) Optimize `getFastHash`: update implementation and add a regression test for consistent hashes.
