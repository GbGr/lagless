# `@lagless/circle-sumo-simulation`

## What it is
`@lagless/circle-sumo-simulation` is the deterministic ECS simulation for Circle Sumo. It provides generated components/inputs, the system pipeline, and gameplay helpers shared by backend and frontend.

## Why it exists / when to use it
Use it anywhere you need the authoritative Circle Sumo ruleset: relay servers, prediction clients, or offline tooling. It ensures both sides run the same deterministic logic.

## Public API
- Generated ECS exports from `src/lib/schema/code-gen` (components, filters, inputs, `CircleSumoInputRegistry`, `CircleSumoRunner`)
- `CircleSumoSystems` and `CircleSumoSignals`
- Gameplay helpers: `CircleSumoArena`, `calculateScore`, `getSpinCost`
- Player data helpers: `PLAYER_PRESETS`, `getRandomSkinId`, `SumoPlayerData`

## Typical usage
Circle Sumo frontend builds a runner with generated systems and signals:

```ts
import { CircleSumoRunner, CircleSumoSystems, CircleSumoSignals } from '@lagless/circle-sumo-simulation';

const runner = new CircleSumoRunner(inputProvider.ecsConfig, inputProvider, CircleSumoSystems, CircleSumoSignals);
runner.start();
```

## Key concepts & data flow
- ECS components, inputs, and runner are generated from `src/lib/schema/ecs.yaml`.
- Systems implement deterministic gameplay (movement, collisions, player lifecycle).
- Signals communicate high-level events (game over, player finished) to UI or backend.

## Configuration and environment assumptions
- Codegen output lives in `src/lib/schema/code-gen` and should not be edited by hand.
- Input providers must use `CircleSumoInputRegistry` for RPC inputs.
- `MathOps.init()` must be called before running systems that use deterministic math.

## Pitfalls / common mistakes
- Editing generated files instead of updating `ecs.yaml`.
- Reordering `CircleSumoSystems` without validating replay determinism.
- Using non-deterministic APIs inside systems.

## Related modules
- `libs/core` for the ECS runtime.
- `libs/math` and `libs/misc` for deterministic math and interpolation helpers.
- `circle-sumo/circle-sumo-game` and `circle-sumo/circle-sumo-backend` for real usage.
