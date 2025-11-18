# `@lagless/circle-sumo-backend`

> Colyseus + NestJS service that matches players, hosts the authoritative Circle Sumo ECS world, and talks to persistence services.

## 1. Responsibility & Context

- **Primary responsibility**: Provide matchmaking, relay rooms, and API endpoints required to run Circle Sumo matches in production.
- **Upstream dependencies**: `@lagless/colyseus-rooms`, `@lagless/game`, `@lagless/player`, NestJS, Colyseus.
- **Downstream consumers**: Circle Sumo clients (web/mobile) that connect to matchmaking/relay rooms; internal services reading monitoring endpoints.
- **ECS lifecycle role**: `Network / Simulate / Utility`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | Relay rooms configure 60 FPS (`1e3/60` frame length) for `CircleSumoRunner`. |
| Authority | Server is authoritative for simulation + matchmaking outcomes. |
| Persistence strategy | Calls `GameService` / `PlayerService` to start/end sessions; Colyseus handles transient state. |
| Network boundary | Accepts JWT-authenticated WebSocket connections, relays input-only RPCs, emits signals/finish data. |

### 2.1 Simulation / Rollback / Resimulate

- Relay rooms instantiate `CircleSumoRunner` with a networked input provider (via `RelayColyseusRoom` base). They request rollbacks when inputs arrive late and replay ticks to keep server state canonical.
- Matchmaking config defines minimal/maximum ticks per frame to keep fairness; all corrections happen server-side before fan-out.

### 2.2 Networking Interaction

- `CircleSumoMatchmakingRoom` authenticates players, creates games, and forwards seat reservations to relay rooms. It sets MMR/ping windows and uses JWT secrets from config.
- `CircleSumoRelayColyseusRoom`:
  - Sends `PlayerJoined`/`PlayerLeft` RPCs through `CircleSumoInputRegistry`.
  - Persists session lifecycle (start, finish, leave).
  - Fan-outs inputs only; never shares ECS state.
- Express/Nest mounts under `/api` for REST needs; `/monitor` and `/playground` exposed for tools.

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `CircleSumoMatchmakingRoom` | Colyseus room class | Handles JWT auth, MMR windows, matchmaking flow. | Stable |
| `CircleSumoRelayColyseusRoom` | Colyseus room class | Hosts authoritative ECS runner + input relay. | Stable |
| `bootstrap()` (implicit via `main.ts`) | function | Spins up NestJS app + Colyseus config. | Stable |

## 4. Preconditions

- Environment variables: `PORT`, `JWT_SECRET`, and configuration consumed by `GameService`/`PlayerService` must be set.
- `GameService` and `PlayerService` dependencies (Nest providers) must be accessible for DI.
- TLS/offloading handled upstream if required (Colyseus config expects plain WS by default).

## 5. Postconditions

- Successful matchmaking sessions create entries in `GameService` and allocate a relay room.
- Relay room ensures `internalStartGameSession`, `internalPlayerFinishedGameSession`, `internalGameOver`, etc., are called with deterministic timestamps.
- Client leave/finish flows always send the final RPC to the ECS world before disposing.

## 6. Invariants & Constraints

- Max clients per relay room currently 6 (4 humans + 2 spectators/bots). Altering this requires reviewing ECS config.
- Matchmaking config (MMR/ping windows, virtual capacity) should remain in sync with product requirements; changes must be documented.
- Relay rooms must stay input-only; never broadcast component state.

## 7. Safety Notes & Implementation Notes for AI Agents

- Avoid adding blocking I/O inside Colyseus room lifecycle callbacks—await async service calls and handle errors.
- Logs currently use `console.*`; consider structured logging but keep deterministic order if used in tests.
- When modifying JWT/auth logic, update both matchmaking and downstream services simultaneously.
- Tie any ECS config changes (frame length, rollback window) to runner init to avoid drift from clients.

## 8. Example Usage

```ts
import config, { listen } from '@colyseus/tools';
import { CircleSumoMatchmakingRoom, CircleSumoRelayColyseusRoom } from '@lagless/circle-sumo-backend';

const app = config({
  initializeGameServer: (gameServer) => {
    gameServer.define('matchmaking', CircleSumoMatchmakingRoom);
    gameServer.define('relay', CircleSumoRelayColyseusRoom);
  },
});

listen(app, Number(process.env.PORT) || 3000);
```

## 9. Testing Guidance

- Manual QA: connect two clients via matchmaking; observe room creation, RPC fanout, and persistence events.
- Recommended automated coverage:
  - Room lifecycle unit tests (mock `GameService` to assert call ordering).
  - JWT secret validation + unauthorized join attempts.
  - Input fan-out determinism (server tick monotonicity).

## 10. Change Checklist

- [ ] Server tick/frame settings aligned with client config + documentation updated.
- [ ] New endpoints/room behaviors described, including required env vars.
- [ ] Persistence side-effects (GameService/PlayerService) verified in dev/staging.
- [ ] Security posture (JWT, monitoring endpoints) reviewed after changes.

## 11. Integration Notes (Optional)

- Monitor Colyseus metrics via `/monitor`; integrate with ops dashboards if needed.
- Use `@lagless/relay-input-provider` client-side to connect to relay rooms defined here.

## 12. Appendix (Optional)

- For advanced matchmaking tuning, see `BaseMatchmakerRoom` docs in `@lagless/colyseus-rooms`.
