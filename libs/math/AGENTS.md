# AGENTS: @lagless/math

## Purpose and boundaries
- Provide deterministic math and vector utilities for simulations and rendering layers.
- Not responsible for simulation state, networking, or ECS memory layout.

## Imports and entry points
- `libs/math/src/index.ts`
- `libs/math/src/lib/math-ops.ts`
- `libs/math/src/lib/vector2.ts`
- `libs/math/src/lib/vector2-buffers.ts`

## Common tasks -> files
- Add a new math helper: `libs/math/src/lib/math-ops.ts`.
- Extend `Vector2`: `libs/math/src/lib/vector2.ts`.
- Add or adjust buffers: `libs/math/src/lib/vector2-buffers.ts`.
- Update exports: `libs/math/src/index.ts`.

## Integration points
- Circle Sumo uses `MathOps` and `Vector2` for input and camera math (`circle-sumo/circle-sumo-game/src/app/game-view/components/direction-arrow-view.tsx`).
- Simulation systems rely on deterministic math in `circle-sumo/circle-sumo-simulation/src/lib/systems/*`.

## Invariants and rules
- `MathOps` must remain deterministic and consistent across platforms.
- Always route trig and sqrt operations through `MathOps` once initialized.
- Static vector constants should be treated as read-only.

## Workflow for modifications
- Update implementation, then update README examples if the API changed.
- If deterministic behavior changes, update tests and review simulation callers.
- Verify with `nx lint @lagless/math`, `nx typecheck @lagless/math`, and `nx test @lagless/math`.

## Example future AI tasks
1) Add a deterministic `tan` helper: update `math-ops.ts`, export it, update docs.
2) Add a `Vector2.rotateInPlace`: implement in `vector2.ts`, add tests, update README.
3) Add extra reusable buffers: update `vector2-buffers.ts`, document usage guidance.
