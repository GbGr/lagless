# `@lagless/game`

## What it is
`@lagless/game` is a NestJS module that provides game and matchmaking session services. It coordinates persistence of games, sessions, and player results.

## Why it exists / when to use it
Use it in backend apps that need to track matchmaking sessions, game creation, and post-game results. It keeps game persistence consistent across services.

## Public API
- `LaglessGameModule`
- `GameService`

## Typical usage
Circle Sumo uses `GameService` from relay and matchmaking rooms:

```ts
import { GameService } from '@lagless/game';

const matchmakingSession = await this._GameService.internalStartMatchmakingSession(auth.id, new Date());
```

## Key concepts & data flow
- Game and matchmaking sessions are stored in TypeORM entities from `@lagless/schemas`.
- `internal*` methods are intended for trusted backend flows (matchmaking, relay rooms).

## Configuration and environment assumptions
- Requires TypeORM and the schema entities (`GameSchema`, `GameSessionSchema`, `MatchmakingSessionSchema`).
- Expects database connectivity configured by the hosting backend.

## Pitfalls / common mistakes
- Skipping transactions when updating player and session state together.
- Failing to register the schema entities in the backend module.
- Calling internal methods from untrusted contexts.

## Related modules
- `libs/api/schemas` for game and session entities.
- `circle-sumo/circle-sumo-backend` for real usage.
