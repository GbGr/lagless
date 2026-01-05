# AGENTS: @lagless/misc

## Purpose and boundaries
- Provide deterministic utility primitives for clocks, snapshot history, UUIDs, and interpolation.
- Not responsible for ECS state changes or networking.

## Imports and entry points
- `libs/misc/src/index.ts`
- `libs/misc/src/lib/simulation-clock.ts`
- `libs/misc/src/lib/snapshot-history.ts`
- `libs/misc/src/lib/ring-buffer.ts`
- `libs/misc/src/lib/uuid.ts`
- `libs/misc/src/lib/transform2d-utils.ts`

## Common tasks -> files
- Adjust timing or nudging: `libs/misc/src/lib/simulation-clock.ts` and `libs/misc/src/lib/phase-nudger.ts`.
- Change snapshot behavior: `libs/misc/src/lib/snapshot-history.ts`.
- Add interpolation helpers: `libs/misc/src/lib/transform2d-utils.ts`.
- Update UUID behavior: `libs/misc/src/lib/uuid.ts`.

## Integration points
- `@lagless/core` relies on `SimulationClock` and `SnapshotHistory`.
- Circle Sumo uses `interpolateTransform2dCursorToRef` in the renderer (`circle-sumo/circle-sumo-game/src/app/game-view/transform2d-view.tsx`).
- Circle Sumo backend uses `UUID.generateMasked()` for bots (`circle-sumo/circle-sumo-backend/src/colyseus/relay.ts`).

## Invariants and rules
- `SimulationClock.start()` must be called before `update()` or elapsed reads.
- Snapshot history size must cover the max rollback window.
- Interpolation helpers invert Y/rotation for render space; do not use them as simulation state.

## Workflow for modifications
- Update implementation and types, then update README examples if the API changes.
- If timing or snapshot logic changes, update core docs and relevant tests.
- Verify with `nx lint @lagless/misc`, `nx typecheck @lagless/misc`, and `nx test @lagless/misc`.

## Example future AI tasks
1) Add a fixed-step helper to `SimulationClock`: update `simulation-clock.ts`, add tests, update README.
2) Add a new transform interpolation variant: implement in `transform2d-utils.ts`, update docs and usage.
3) Add a UUID parser helper: implement in `uuid.ts`, export, document.
