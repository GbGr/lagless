# `@lagless/colyseus-rooms`

> Base rooms, matchmaking services, and relay helpers shared across Lagless multiplayer games.

## 1. Responsibility & Context

- **Primary responsibility**: Provide reusable Colyseus room infrastructure—matchmaking queues, relay room base class, and shared types—to simplify building authoritative multiplayer services.
- **Upstream dependencies**: `colyseus`, `jsonwebtoken`, `@lagless/net-wire`, Nest/DI if needed by subclasses.
- **Downstream consumers**: Game-specific backends (e.g., `@lagless/circle-sumo-backend`) and any Colyseus-based service needing matchmaking scaffolding.
- **ECS lifecycle role**: `Network / Utility`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | Provided by subclasses (e.g., 60 FPS for Circle Sumo) |
| Authority | Rooms host or connect to authoritative ECS runners |
| Persistence strategy | Out of scope; subclasses call external services |
| Network boundary | Handles WebSocket auth, matchmaking messaging, and relay fan-outs |

### 2.1 Simulation / Rollback / Resimulate

- `RelayColyseusRoom` defines hooks (player join/leave, finished game) that subclassed rooms use to drive ECS runner updates and rollback/resimulate as needed.
- `BaseMatchmakerRoom` ensures frame length and other config propagate to newly spawned relay rooms, keeping deterministic simulation consistent.

### 2.2 Networking Interaction

- Auth flow: `onAuth` verifies JWT tokens with a game-specific secret before allowing matchmaking participation.
- Matchmaking: players enqueue via messages, `MatchmakingService` groups them based on configuration, and `createGameId` + `buildGameRoomOptions` spawn relay rooms with options (frame length, max players, etc.).
- Relay: base class coordinates RPC flows to/from ECS runner (actual logic implemented downstream).

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `BaseMatchmakerRoom` | abstract class | Implements queue management, auth, and matchmaking scaffolding. | Stable |
| `MatchmakingService`, `MatchmakerState`, `MatchTicket`, `MatchGroup` | classes/types | Underlying matching logic and state snapshots. | Stable |
| `RelayColyseusRoom` | abstract class | Base class for rooms that host an ECS runner and relay input. | Stable |

## 4. Preconditions

- Subclasses must implement abstract hooks (`_getAuthSecret`, `getMatchmakingConfig`, `createGameId`, etc.).
- Colyseus server must register these rooms, and any DI dependencies (e.g., Nest providers) must be accessible.

## 5. Postconditions

- Matchmaking room keeps `MatchmakerState` updated, broadcasting ticket changes to clients.
- Relay room notifies lifecycle events (`onPlayerJoined`, `onPlayerLeave`, `onPlayerFinishedGame`, `onBeforeDispose`) for subclasses to integrate with services.

## 6. Invariants & Constraints

- Matchmaking tick interval (default 250ms) must remain deterministic; avoid long-running work in tick callbacks.
- JWT verification must be consistent across deployments; secrets should not change without logout flows.
- Room options forwarded to Colyseus must include `frameLength` to keep ECS configs aligned.

## 7. Safety Notes & Implementation Notes for AI Agents

- Avoid storing sensitive data directly in `MatchmakerState`; treat it as transient.
- Use `console` sparingly or replace with structured logging when scaling; but keep deterministic order if tests rely on logs.
- When customizing `buildGameRoomOptions`, ensure you pass only serializable options; Colyseus will clone them.
- Provide backpressure for matchmaking queue if upstream DB/service calls fail—document how to handle.

## 8. Example Usage

```ts
import { BaseMatchmakerRoom } from '@lagless/colyseus-rooms';
import { ConfigService } from '@nestjs/config';

export class MyMatchmakingRoom extends BaseMatchmakerRoom {
  protected _getAuthSecret() {
    return this._configService.getOrThrow('JWT_SECRET');
  }

  protected getMatchmakingConfig() {
    return { virtualCapacity: 4, maxHumans: 4, /* ... */ };
  }

  // override createGameId, getPlayerDataFromAuth, etc.
}
```

## 9. Testing Guidance

- Run `nx test @lagless/colyseus-rooms` (Vitest) to cover matchmaking service behavior (extend existing specs).
- Add integration tests mocking Colyseus `matchMaker` to ensure room creation logic handles edge cases (cancelled tickets, auth errors).
- For relay base class, consider unit tests verifying lifecycle hooks fire in correct order.

## 10. Change Checklist

- [ ] Abstract methods documented when adding new ones so downstream rooms can implement them.
- [ ] Matchmaking config changes mirrored in downstream service docs.
- [ ] JWT/auth flows updated alongside adoption guidance.
- [ ] README references updated if new utilities are added.

## 11. Integration Notes (Optional)

- Works with Colyseus `matchMaker` by default; to scale horizontally, plug in Redis driver/presence at the server entry point.
- Game-specific rooms can inject Nest services via static DI container (`NestDI` pattern in Circle Sumo backend).

## 12. Appendix (Optional)

- `matchmaking.types.ts` documents all DTOs; reference when building client RPCs.
