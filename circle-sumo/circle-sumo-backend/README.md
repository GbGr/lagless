# `@lagless/circle-sumo-backend`

## What it is
`@lagless/circle-sumo-backend` is the Colyseus + NestJS backend for Circle Sumo. It runs matchmaking, relay rooms, and persistence services for the authoritative simulation.

## Why it exists / when to use it
Use it to host Circle Sumo matches in a production-like environment. It coordinates player auth, matchmaking sessions, and relay room lifecycles.

## Public API
- Colyseus rooms: `CircleSumoMatchmakingRoom`, `CircleSumoRelayRoom`
- Nest module: `AppModule` (internal composition)
- Entry point: `circle-sumo/circle-sumo-backend/src/main.ts`

## Typical usage
`main.ts` registers the matchmaking and relay rooms:

```ts
import { CircleSumoMatchmakingRoom } from './colyseus/matchmaking';
import { CircleSumoRelayRoom } from './colyseus/relay';

gameServer.define('matchmaking', CircleSumoMatchmakingRoom);
gameServer.define('relay', CircleSumoRelayRoom);
```

## Key concepts & data flow
- Matchmaking rooms authenticate players and create game sessions via `GameService` and `PlayerService`.
- Relay rooms extend `RelayColyseusRoom` and feed inputs to the Circle Sumo simulation using `CircleSumoInputRegistry`.
- Nest services handle persistence (`@lagless/schemas`) while Colyseus handles WebSocket traffic.

## Configuration and environment assumptions
- `PORT` controls the server port.
- `JWT_SECRET` is required for matchmaking auth.
- `DB_CONNECTION_STRING` is required for TypeORM.
- Matchmaking and relay frame length should align with frontend `ECSConfig` (60 FPS in Circle Sumo).

## Pitfalls / common mistakes
- Blocking I/O in Colyseus room callbacks (causes tick drift).
- Mismatched frame length or input registry between backend and frontend.
- Forgetting to register schemas in TypeORM modules.

## Related modules
- `libs/colyseus-rooms`, `libs/game`, `libs/player`, `libs/schemas`
- `circle-sumo/circle-sumo-simulation` for the ECS ruleset
- `libs/relay-input-provider` for the client counterpart
