# `@lagless/relay-input-provider`

> Client-side matchmaking + relay utilities that connect to Colyseus backends and feed deterministic inputs into an ECS runner.

## 1. Responsibility & Context

- **Primary responsibility**: Provide `Matchmaking` helpers and the `RelayInputProvider` (an `AbstractInputProvider` implementation) that streams player inputs to/from the relay server using the Lagless wire protocol.
- **Upstream dependencies**: `colyseus.js`, `@lagless/core`, `@lagless/net-wire`, `@lagless/binary`, `@lagless/misc`.
- **Downstream consumers**: Circle Sumo frontend (and future games) wanting to connect to hosted relay/matchmaking services.
- **ECS lifecycle role**: `Network / Rollback`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | Uses ECS runner’s `SimulationClock.getElapsedTime()` for all delay calculations |
| Authority | Backend relay remains authoritative; input provider only submits commands and applies corrections |
| Persistence strategy | No storage; telemetry module maintains runtime counters |
| Network boundary | Communicates exclusively via Colyseus raw binary channel (`RELAY_BYTES_CHANNEL`) using `@lagless/net-wire` schemas |

### 2.1 Simulation / Rollback / Resimulate

- `RelayInputProvider` batches frame RPCs, prepends `TickInputStruct`, and sends to server. When receiving `CancelInput` or `TickInputFanout`, it flags `getInvalidateRollbackTick()` so the ECS runner rewinds/resimulates ticks.
- Every authoritative correction recomputes input delay (delta ticks) to keep prediction stable.
- Clock Sync (ping/pong) ensures theta offset and jitter are known before adjusting local tick alignment.

### 2.2 Networking Interaction

- `connect()` consumes a Colyseus seat reservation, waits for `ServerHello` (seeds + player slot), and resolves a configured input provider.
- Ping (250 ms interval + burst) calculates RTT/jitter using `ClockSync`; `InputDelayController` converts that to `deltaTicks`.
- `sendPlayerFinishedGame` posts verified results to server after local computation (server will still validate).
- Telemetry snapshots expose send counts, rollbacks, and tick hints for debugging overlays.

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `Matchmaking` | class | Connects to backend matchmaking room and returns seat reservation. | Stable |
| `RelayInputProvider.connect()` | static method | Async helper to wire ECS config + Colyseus client into a running provider. | Stable |
| `RelayInputProvider` | class | Implements `AbstractInputProvider` with network plumbing, clock sync, telemetry. | Stable |
| `RelayTelemetry` / `RelayTelemetrySnapshot` | classes | Tracks RTT, rollbacks, send counters. | Stable |

## 4. Preconditions

- Caller must pass a valid `ECSConfig` (fps + min/max input delay tick) and `InputRegistry` used by the simulation.
- Seat reservation from the backend must be active; `connect()` will reject if `ServerHello` is not received in the timeout window.
- Auth tokens must be set before initiating matchmaking (handled by higher-level app code).

## 5. Postconditions

- After `init()`, provider hooks Colyseus message handler, starts ping loop, and will call `simulation.update` each tick to send RPCs.
- Rollbacks are requested via `_tickToRollback` and telemetry increments counters accordingly.
- On `dispose()`, it leaves the room and clears ping intervals to avoid socket leaks.

## 6. Invariants & Constraints

- All network messages must use `@lagless/net-wire` schemas; do not send ad-hoc JSON/strings.
- Player slot is immutable for the duration of the session (`playerSlot` assigned from `ServerHello`).
- Input delay ticks stay within `[ecsConfig.minInputDelayTick, ecsConfig.maxInputDelayTick]`.

## 7. Safety Notes & Implementation Notes for AI Agents

- Always guard network callbacks against disposed state to avoid race conditions.
- Never mutate `_frameRPCBuffer` outside the provided hooks; `AbstractInputProvider` manages ordering and seq IDs.
- When adjusting ping intervals or delay controller coefficients, document the rationale and update READMEs for frontend/backend consumers.
- Avoid leaking Colyseus client references outside this module—wrap functionality with high-level helpers.

## 8. Example Usage

```ts
import { Matchmaking, RelayInputProvider } from '@lagless/relay-input-provider';
import { ECSConfig } from '@lagless/core';
import { CircleSumoInputRegistry } from '@lagless/circle-sumo-simulation';

const matchmaking = new Matchmaking();
const { client, seatReservation } = await matchmaking.connectAndFindMatch(relayUrl, ecsConfig, authToken);
const inputProvider = await RelayInputProvider.connect(
  new ECSConfig({ fps: 60 }),
  CircleSumoInputRegistry,
  client,
  seatReservation
);
```

## 9. Testing Guidance

- Manual QA with staging backend: monitor telemetry logs for RTT/jitter/delay adjustments.
- Add unit tests around `InputDelayController` and clock sync wrappers when tuning coefficients.
- Consider integration tests using mocked Colyseus server to validate handshake and rollback triggers.

## 10. Change Checklist

- [ ] Wire protocol changes mirrored in `@lagless/net-wire` docs/tests.
- [ ] Any new telemetry fields documented for UI consumers.
- [ ] README updated when auth/matchmaking flows change.
- [ ] `nx test @lagless/relay-input-provider` (when available) or manual test plan executed.

## 11. Integration Notes (Optional)

- Relay telemetry snapshots can be surfaced in frontend overlays; consider exporting helper hooks.
- Works with both local (mock) input provider and remote relay; keep README up to date with toggling instructions.

## 12. Appendix (Optional)

- `relay-telemetry.ts` describes snapshot shape; include charting guidance if future dashboards are planned.
