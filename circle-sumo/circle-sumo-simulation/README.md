# `@lagless/circle-sumo-simulation`

> Deterministic ECS library implementing Circle Sumo gameplay (arena physics, player lifecycle, finish conditions, relay signals).

## 1. Responsibility & Context

- **Primary responsibility**: Define the Circle Sumo ECS world (systems, components, RPC input registry, arena config) consumed by backend relay servers and prediction clients.
- **Upstream dependencies**: `@lagless/core`, `@lagless/math`, `@lagless/misc`, `@lagless/binary`, `@lagless/net-wire`.
- **Downstream consumers**: `@lagless/circle-sumo-backend` (authoritative relay), `@lagless/circle-sumo-frontend` (prediction/rendering), input relays.
- **ECS lifecycle role**: `Simulate / Rollback / Resimulate / Signals`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | `ECSConfig` (60 FPS default) controlled by runner/back-end |
| Authority | Server-side ECS world is authoritative; clients run prediction/rollback |
| Persistence strategy | Relies on `@lagless/core` snapshots (configured via runner) |
| Network boundary | Consumes input-only RPCs defined in `CircleSumoInputRegistry`; emits deterministic signals (`GameOver`, `PlayerFinishedGame`) |

### 2.1 Simulation / Rollback / Resimulate

- Systems (`transform2d`, `player-connection`, `player-leave`, `player-finish-game`, `finish-game`) run in deterministic order each tick.
- Rollback is triggered externally (input provider) and supported because components/systems are pure relative to ECS memory.
- Map metadata (`CircleSumoArena`) remains constant for all replayed ticks ensuring identical physics boundaries.
- Signals are idempotent: when resimulated they fire on the same tick with the same payload, guaranteeing backend/frontend listeners stay in sync.

### 2.2 Networking Interaction

- RPC inputs originate from net-wire/relay (e.g., `PlayerJoined`, `PlayerLeft`, movement commands) and are added via `CircleSumoInputRegistry`.
- No ECS state is broadcast; only user input or derived high-level commands (signals) leave the simulation.
- Input providers (backend relay or local frontend) must respect tick ordering and set `playerSlot` correctly.

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `CircleSumoSystems` | `IECSSystemConstructor[]` | Ordered list of systems to register with `ECSRunner`. | Stable |
| `CircleSumoSignals` | `ISignalConstructor[]` | Verified signals fired during game-over/player-finished events. | Stable |
| `CircleSumoInputRegistry` | registry | RPC schema describing accepted inputs (player join/leave, gameplay commands). | Stable |
| `CircleSumoArena` | constant | Arena metrics (radius, danger stroke width). | Stable |
| `schema/code-gen` exports | generated types | Component schemas shared with backend/client. | Stable |

## 4. Preconditions

- Runners must initialize deterministic dependencies (`MathOps.init()`) before registering systems.
- Input providers must enqueue commands via `CircleSumoInputRegistry`; ad-hoc RPCs are rejected.
- `ECSConfig` should set `maxPlayers` and rollback window before instantiating the runner.

## 5. Postconditions

- Each tick the ECS world maintains canonical entity transforms and player resource states.
- Game finish signals fire exactly once per unique outcome; rollback/resimulate replays the same signals at the same tick.
- Player slots remain bound to a single entity during a match; leave events free the slot deterministically.

## 6. Invariants & Constraints

- Systems must be registered once; order in `CircleSumoSystems` must not change unless migration plan documented.
- Arena radius/danger stroke are constant—physics/math assume those values.
- RPC payloads must remain input-only per constitution; do not emit ECS state to network.

## 7. Safety Notes & Implementation Notes for AI Agents

- Do not mutate global caches or random state inside systems; rely on ECS providers/injected services.
- Adding a new component/system requires updating schema generators and ensuring snapshots serialize correctly.
- When changing signals, update backend/frontend listeners plus tests to keep deterministic behavior obvious.
- Avoid referencing browser/node globals inside systems to keep shared code universal.

## 8. Example Usage

```ts
import { CircleSumoRunner, CircleSumoSystems, CircleSumoSignals, CircleSumoInputRegistry } from '@lagless/circle-sumo-simulation';
import { ECSConfig, LocalInputProvider } from '@lagless/core';

const config = new ECSConfig({ fps: 60, snapshotRate: 2, snapshotHistorySize: 128 });
const inputProvider = new LocalInputProvider(config, CircleSumoInputRegistry);
const runner = new CircleSumoRunner(config, inputProvider, CircleSumoSystems, CircleSumoSignals);

runner.start();

function frame(dt: number) {
  runner.update(dt);
}
```

## 9. Testing Guidance

- `nx test @lagless/circle-sumo-simulation`.
- Add deterministic regression tests whenever:
  - Modifying system ordering or logic (should produce same final state for identical input sequences).
  - Changing signal payloads (assert exact tick + payload values).
  - Adjusting schema-generated components.

## 10. Change Checklist

- [ ] New systems/components documented with responsibilities + invariants.
- [ ] Input registry/schema updates mirrored in `@lagless/net-wire` docs/tests.
- [ ] Rollback/snapshot implications reviewed.
- [ ] Signals + consumer modules updated to reflect payload/semantics changes.

## 11. Integration Notes (Optional)

- Backend relay uses `CircleSumoInputRegistry` to broadcast RPCs; ensure version compatibility is tracked.
- Frontend prediction can swap `LocalInputProvider` for `RelayInputProvider` without touching simulation code.

## 12. Appendix (Optional)

- See `src/lib/schema` for generated component definitions; re-run codegen when schema changes are made.
