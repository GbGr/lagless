# AGENTS: @lagless/circle-sumo-simulation

## Purpose and boundaries
- Implement the deterministic Circle Sumo ECS simulation (components, systems, signals, gameplay helpers).
- Not responsible for rendering or network transport.

## Imports and entry points
- `circle-sumo/circle-sumo-simulation/src/index.ts`
- `circle-sumo/circle-sumo-simulation/src/lib/systems/*`
- `circle-sumo/circle-sumo-simulation/src/lib/signals/*`
- `circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml`
- `circle-sumo/circle-sumo-simulation/src/lib/schema/code-gen/*` (generated)
- `circle-sumo/circle-sumo-simulation/src/lib/gameplay.ts`
- `circle-sumo/circle-sumo-simulation/src/lib/players.ts`
- `circle-sumo/circle-sumo-simulation/src/lib/map.ts`

## Common tasks -> files
- Add or change components/inputs/filters: edit `src/lib/schema/ecs.yaml`, then regenerate.
- Add or adjust systems: `src/lib/systems/*` and `src/lib/systems/index.ts`.
- Add or adjust signals: `src/lib/signals/*` and `src/lib/signals/index.ts`.
- Update gameplay constants: `src/lib/gameplay.ts`.

## Integration points
- Frontend: `circle-sumo/circle-sumo-game` uses `CircleSumoRunner`, `CircleSumoSystems`, signals, and component classes.
- Backend: `circle-sumo/circle-sumo-backend` uses `CircleSumoInputRegistry` and gameplay helpers.
- Networking: `@lagless/relay-input-provider` expects the same input registry.

## Invariants and rules
- System ordering in `CircleSumoSystems` must remain deterministic across client and server.
- Inputs must remain input-only; do not send ECS state over the wire.
- Avoid nondeterministic APIs inside systems (no `Math.random`, Date, or timers).

## Workflow for modifications
- Update schema or systems, then update any dependent frontend/back-end code.
- If the schema changes, regenerate code and update imports.
- Verify with `nx lint @lagless/circle-sumo-simulation` and `nx typecheck @lagless/circle-sumo-simulation`.

## Generated code
- Schemas live at `circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml`.
- Generated output is `circle-sumo/circle-sumo-simulation/src/lib/schema/code-gen`.
- Regenerate with:
  - `nx g @lagless/codegen:ecs --configPath circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml`
- Do not edit files under `code-gen` manually.
- After regenerating, ensure Circle Sumo frontend and backend still compile.

## Example future AI tasks
1) Add a new input command: update `ecs.yaml`, regenerate, update input providers and systems.
2) Add a new gameplay system: implement in `src/lib/systems`, add to `CircleSumoSystems`, update tests.
3) Add a new signal: implement in `src/lib/signals`, register in `CircleSumoSignals`, update frontend listeners.
