# `@lagless/core`

## What it is
`@lagless/core` is the deterministic ECS runtime for Lagless. It owns the memory model, simulation loop, rollback/resimulation flow, and DI wiring that every game simulation depends on.

## Why it exists / when to use it
Use it when you are building a simulation, input provider, or tool that must run deterministically and support rollback. It is the authoritative source of world state; rendering and networking sit on top of it.

## Public API
- `ECSConfig`: configuration for ticks, snapshot cadence, and rollback window
- `ECSSimulation`: deterministic loop with rollback/resimulation
- `ECSRunner`: DI bootstrapper for systems, signals, and input provider
- `AbstractInputProvider`, `LocalInputProvider`, `ReplayInputProvider`, `InputRegistry`
- `RPC`, `RPCHistory`: input payload and history tracking
- `Signal`, `ISignalConstructor`: predicted/verified/cancelled signal flow
- `Prefab`, `EntitiesManager`, `PlayerResources`, `PRNG`: ECS memory helpers

## Typical usage
Circle Sumo wires a generated runner with relay inputs and ticks it each frame:

```ts
import { CircleSumoRunner, CircleSumoSystems, CircleSumoSignals } from '@lagless/circle-sumo-simulation';
import { RelayInputProvider } from '@lagless/relay-input-provider';

const runner = new CircleSumoRunner(inputProvider.ecsConfig, inputProvider, CircleSumoSystems, CircleSumoSignals);
runner.start();
useTick((ticker) => runner.update(ticker.deltaMS));
```

## Key concepts & data flow
- `ECSRunner` builds a DI container, registers component managers, and instantiates systems and signals.
- `ECSSimulation` advances ticks using a fixed frame length and keeps snapshots for rollback.
- `AbstractInputProvider` supplies ordered RPC inputs and can request rollback when authoritative inputs arrive late.
- Signals emit `Predicted`, `Verified`, and `Cancelled` events tied to rollback windows.

## Configuration and environment assumptions
- `ECSConfig` values (fps, snapshotRate, snapshotHistorySize, input delays) are fixed for a session.
- Deterministic math must be initialized (`MathOps.init()` from `@lagless/math`) before ticking.
- Input providers must supply inputs sorted by tick and never mutate ECS memory directly.

## Pitfalls / common mistakes
- Introducing non-determinism (`Math.random`, Date/time APIs) inside systems.
- Keeping snapshot history smaller than the maximum rollback window.
- Mutating component arrays outside system update methods.

## Related modules
- `libs/math` and `libs/misc` for deterministic math and snapshot helpers.
- `tools/codegen` for generated ECS components and runners.
- `libs/relay-input-provider` and `libs/net-wire` for networked inputs.
