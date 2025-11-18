# `@lagless/net-wire`

> Shared wire protocol definitions, schema helpers, and timing utilities that power Lagless input-only networking.

## 1. Responsibility & Context

- **Primary responsibility**: Define message formats, schema binary layouts, clock-sync routines, and input delay logic for clients/servers.
- **Upstream dependencies**: `@lagless/binary` (schema packing), `@lagless/misc` (timing helpers).
- **Downstream consumers**: Relay servers, relay input providers, matchmaking clients, and any tooling inspecting network traffic.
- **ECS lifecycle role**: `Network`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | Not directly; provides conversions and delay calculations to align with ECS ticks. |
| Authority | Works with whichever side is authoritative (server) to propagate input-only replication. |
| Persistence strategy | Schemas describe packets, not storage; state is transient. |
| Network boundary | Entirely focused on bytes-level contract between clients, relay, and authoritative ECS world. |

### 2.1 Simulation / Rollback / Resimulate

- `TickInputStruct` packets carry per-tick commands; server can cancel/replay via `CancelInputStruct` triggering rollback.
- `TickInputFanoutStruct` informs clients when authoritative inputs arrive so they can resimulate.
- `PlayerFinishedGameStruct` delivers verified results after server reconciliation.

### 2.2 Networking Interaction

- `RELAY_BYTES_CHANNEL` defines the Colyseus binary channel reserved for these packets.
- `ServerHelloStruct` seeds deterministic PRNG values + player slots; clients must wait for it before sending inputs.
- `PingStruct`/`PongStruct` feed `ClockSync` which adjusts theta (offset) and jitter used by `InputDelayController`.

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `WireVersion`, `MsgType` | enums | Versioned protocol constants. | Stable |
| `HeaderStruct`, `TickInputStruct`, ... | `BinarySchema` | Schemas for every packet type. | Stable |
| `ClockSync` | class | Calculates EWMA RTT/jitter and clock offset from Pong data. | Stable |
| `InputDelayController` | class | Converts RTT/jitter to target input lead (delta ticks). | Stable |
| `relay-room-options` | types | Connection helper interfaces for relay clients. | Stable |

## 4. Preconditions

- When sending packets, always prepend `HeaderStruct` with supported `WireVersion` and `MsgType`.
- `ClockSync.updateFromPong` expects timestamps in milliseconds with the same epoch on both client/server.
- Clients must respect min/max delta ticks enforced by `InputDelayController` when feeding ECS inputs.

## 5. Postconditions

- After processing Pong messages, `ClockSync` exposes `thetaMs`, `rttEwmaMs`, `jitterEwmaMs` for UI/relay tuning.
- Recomputed delta ticks remain within configured `[min, max]` bounds, ensuring stable prediction windows.
- All schemas encode/decode deterministically thanks to `@lagless/binary`.

## 6. Invariants & Constraints

- WireVersion increments require backward compatibility strategy; bump only when schema/semantics change.
- Message payloads must stay input-only and high-level per project constitution.
- Keep `TickInputKind` semantics (`Client` vs `Server`) consistent across readers/writers.

## 7. Safety Notes & Implementation Notes for AI Agents

- When adding schemas, update `MsgType` enums, handling code, and README plus downstream modules simultaneously.
- Do not log sensitive payloads (JWTs, seeds) by default; ensure debugging statements are gated.
- Keep EWMA coefficients configurable if future tuning is required; document defaults in README.

## 8. Example Usage

```ts
import { HeaderStruct, MsgType, TickInputStruct, WireVersion } from '@lagless/net-wire';
import { BinarySchema } from '@lagless/binary';

const buffer = new ArrayBuffer(HeaderStruct.byteLength + TickInputStruct.byteLength);
const header = HeaderStruct.pack(buffer);
header.struct.version = WireVersion.V1;
header.struct.type = MsgType.TickInput;

const payload = TickInputStruct.pack(buffer, HeaderStruct.byteLength);
payload.struct.tick = tick;
payload.struct.playerSlot = slot;
payload.struct.kind = 0; // client
payload.struct.seq = nextSeq++;
```

## 9. Testing Guidance

- Add tests around schema pack/unpack (length, field ordering).
- Simulate network jitter to validate `ClockSync` and `InputDelayController` outputs.
- Integration tests: use relay client/server harness to send sample packets and ensure both ends decode correctly.

## 10. Change Checklist

- [ ] Schema or enum updates documented, versioned, and reflected in downstream repos.
- [ ] `ClockSync` / delay logic changes accompanied by rationale and tests.
- [ ] README & other docs updated for new packet types/settings.
- [ ] Compatibility considerations noted (e.g., fallback behavior for mixed versions).

## 11. Integration Notes (Optional)

- Works with Colyseus raw-binary channel 99; ensure server and client keep the same channel id.
- Pair with `@lagless/relay-input-provider` on the client side and relay rooms on the server side.

## 12. Appendix (Optional)

- Additional helper types in `relay-room-options.ts` describe environment-specific connection parameters.
