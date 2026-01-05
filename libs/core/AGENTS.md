# AGENTS: @lagless/core

## Purpose and boundaries
- Own the deterministic ECS runtime: memory layout, simulation loop, rollback/resimulation, and DI wiring.
- Not responsible for rendering, transport, or game-specific rules (those live in simulations and frontends).

## Imports and entry points
- `libs/core/src/index.ts` (public exports)
- `libs/core/src/lib/ecs-config.ts`
- `libs/core/src/lib/ecs-runner.ts`
- `libs/core/src/lib/ecs-simulation.ts`
- `libs/core/src/lib/input/*`
- `libs/core/src/lib/mem/*`
- `libs/core/src/lib/signals/*`

## Common tasks -> files
- Change tick/rollback behavior: `libs/core/src/lib/ecs-simulation.ts`, `libs/core/src/lib/ecs-runner.ts`.
- Add or adjust ECSConfig fields: `libs/core/src/lib/ecs-config.ts`.
- Update input provider base classes: `libs/core/src/lib/input/*`.
- Adjust memory managers or component registries: `libs/core/src/lib/mem/*`.
- Update signal lifecycle: `libs/core/src/lib/signals/*`.
- Update exports: `libs/core/src/index.ts`.

## Integration points
- Codegen consumes ECS schema types from `libs/core/src/lib/types/ecs-types.ts`.
- Relay input providers use `AbstractInputProvider`, `RPC`, and `RPCHistory`.
- Circle Sumo runner uses `ECSRunner` and `Signal` wiring (`circle-sumo/circle-sumo-game/src/app/game-view/runner-provider.tsx`).

## Invariants and rules
- Simulation must be deterministic across rollbacks and resimulation.
- Systems must be pure with respect to ECS memory; no external mutable state.
- Input providers are the only source of rollback requests.
- `ECSConfig` values are session-constant; do not mutate at runtime.

## Workflow for modifications
- Update types first, then update implementation and exports.
- If rollback or tick behavior changes, add or update tests and update README notes.
- Check Circle Sumo integration points for any needed adjustments.
- Verify with `nx lint @lagless/core`, `nx typecheck @lagless/core`, and `nx test @lagless/core`.

## Example future AI tasks
1) Add a new signal base class: edit `libs/core/src/lib/signals/*`, export it, update README and any simulation usage.
2) Introduce a new input provider: implement in `libs/core/src/lib/input`, update exports, add tests.
3) Adjust snapshot policy: update `ecs-config.ts` and `ecs-simulation.ts`, add rollback tests, update docs.
