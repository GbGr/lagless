# `@lagless/core`

> Entity Component System (ECS) runtime, memory model, and simulation/rollback orchestration for every deterministic Lagless experience.

## 1. Responsibility & Context

- **Primary responsibility**: Provide the authoritative ECS runtime (memory layout, DI container, simulation loop, rollback hooks) that all games build on.
- **Upstream dependencies**: `@lagless/math`, `@lagless/misc`, `@lagless/binary` (deterministic math, clocks, snapshot history, byte helpers).
- **Downstream consumers**: Game simulations, backend services, input relays, animation libs that rely on deterministic world state (`@lagless/circle-sumo-*`, `@lagless/relay-input-provider`, etc.).
- **ECS lifecycle role**: `Simulate / Rollback / Resimulate / Utility`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | `SimulationClock` (fixed frame length + bounded `PhaseNudger` corrections) |
| Authority | Server or local authoritative world; the ECS world is always authoritative relative to prediction layers |
| Persistence strategy | `SnapshotHistory` retains configurable snapshots for rollback windows; initial snapshot captured on boot |
| Network boundary | Consumes ordered commands via `AbstractInputProvider`; core never emits state over the network |

### 2.1 Simulation / Rollback / Resimulate

- `ECSSimulation` advances ticks using `SimulationClock`, running deterministic system `update()` calls in registration order.
- Rollback triggers when `AbstractInputProvider.getInvalidateRollbackTick()` returns an earlier tick; the simulation hydrates the nearest stored snapshot or falls back to the initial snapshot.
- Snapshot cadence is `snapshotRate` from `ECSConfig`; `snapshotHistorySize` must cover the maximum rollback window promised to clients.
- Resimulation occurs automatically after rollback by re-running systems for all invalidated ticks, ensuring deterministic convergence.

### 2.2 Networking Interaction

- Input providers (server or relay implementations) feed the ECS world strictly ordered commands; only player inputs/high-level events are accepted.
- Core treats the ECS world as authoritative—network layers may subscribe via tick handlers but never mutate `mem` outside the main update loop.
- Any networking module must respect the `ECSRunner` dependency injection boundaries (register input providers via DI token `InputProvider`).

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `ECSConfig` | class | Declarative configuration for frame length, snapshot windows, entity/component sizing. | Stable |
| `ECSSimulation` | class | Deterministic simulation loop with rollback + interpolation helpers. | Stable |
| `ECSRunner` | abstract class | Bootstraps DI container, systems, signals, and input provider to run a world. | Stable |
| `Prefab` | class | Helper for composing deterministic component prefabs when spawning entities. | Stable |
| `AbstractInputProvider` | class | Contract for feeding ordered inputs + requesting rollbacks. | Stable |
| `SignalsRegistry/ISignalConstructor` | class/interface | Deterministic signal dispatch infrastructure per tick. | Experimental |
| `Mem`, `EntitiesManager`, `PRNGManager`, etc. | classes | Memory layout, deterministic PRNG, component/singleton registries. | Stable |

## 4. Preconditions

- Input provider must be initialized with deterministic, pre-validated commands ordered by frame index.
- Systems must be registered exactly once before calling `Simulation.start()` (see `ECSSimulation.registerSystems` guard).
- `MathOps.init()` (from `@lagless/math`) and any deterministic dependencies must be resolved before ticking.

## 5. Postconditions

- After each tick, `mem.tickManager.tick` advances monotonically and component stores remain sorted by entity ID.
- Snapshots stored at configured cadence represent canonical history; rollback restores both memory and tick counters.
- Registered tick handlers observe strictly increasing tick numbers and must not mutate ECS memory outside system APIs.

## 6. Invariants & Constraints

- Fixed `frameLength` and `maxNudgePerFrame` enforce deterministic wall-clock coupling; do not mutate these at runtime.
- `SnapshotHistory` size must exceed the greatest rollback request from networking layers; under-sizing leads to full resets.
- Systems must be pure relative to ECS memory (no external mutable state) so rollback/resimulate produces identical results.
- DI container should only resolve instances built through ECSRunner; manual instantiation risks bypassing deterministic wiring.

## 7. Safety Notes & Implementation Notes for AI Agents

- Never mutate `Mem` internals (component arrays, singleton instances) outside system `update()`—use provided managers.
- Do not introduce `Math.random`, Date/Time APIs, or non-deterministic side effects inside systems or runner hooks.
- Only the input provider may request rollbacks; avoid ad-hoc rewinds.
- Avoid storing external references to DI-resolved components without considering rollback life-cycle.
- When adding new signals or systems, ensure deterministic ordering and include rollback expectations in their docs/tests.

## 8. Example Usage

```ts
import { ECSConfig, ECSRunner, AbstractInputProvider, Prefab } from '@lagless/core';
import { CircleSumoSystems } from '../systems';

class HeadlessInputProvider extends AbstractInputProvider {
  // implement enqueue + rollback invalidation
}

class CircleSumoRunner extends ECSRunner {}

const config = new ECSConfig({
  frameLength: 16, // ms
  snapshotRate: 2,
  snapshotHistorySize: 128,
});

const runner = new CircleSumoRunner(
  config,
  new HeadlessInputProvider(),
  CircleSumoSystems,
  [],
  { prefabs: [Prefab.create()] },
);

runner.start();
runner.update(16); // pass delta time from loop / server tick
```

## 9. Testing Guidance

- Run `nx test @lagless/core` for deterministic unit/integration suites.
- When modifying simulation logic or rollback behavior, add tests that:
  - Replay identical ordered input sequences across rollbacks to assert matching final state.
  - Cover `SnapshotHistory` edges (missing snapshots vs. fallback to initial snapshot).
  - Verify DI container wiring for new systems/signals.

## 10. Change Checklist

- [ ] Deterministic tick duration and snapshot cadence documented and enforced.
- [ ] Rollback + resimulation implications reviewed; new snapshots/tests added if logic changed.
- [ ] Input provider contracts unchanged or READMEs/network docs updated accordingly.
- [ ] `docs/ecs-readme-template.md` sections updated if new invariants/public APIs were introduced.

## 11. Integration Notes (Optional)

- Pair with `@lagless/net-wire` schemas for decoding player input before feeding `AbstractInputProvider`.
- Use `Simulation.addTickHandler` to notify rendering layers without mutating the authoritative world.

## 12. Appendix (Optional)

- `Mem` managers expose iterators for components/singletons; see `libs/core/src/lib/mem/**/*.ts` for advanced integrations.
