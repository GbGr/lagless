# `@lagless/schemas`

## What it is
`@lagless/schemas` contains the shared TypeORM entity classes used by Lagless backends. These schemas define the persistent data model for players, games, sessions, and login logs.

## Why it exists / when to use it
Use it in backend services so that entity definitions stay consistent across modules. It centralizes the database schema for Lagless services.

## Public API
- `PlayerSchema`
- `GameSchema`
- `LoginLogSchema`
- `GameSessionSchema`
- `MatchmakingSessionSchema`

## Typical usage
Circle Sumo registers these entities with TypeORM:

```ts
import { GameSchema, GameSessionSchema, LoginLogSchema, MatchmakingSessionSchema, PlayerSchema } from '@lagless/schemas';

TypeOrmModule.forRootAsync({
  useFactory: () => ({
    type: 'postgres',
    entities: [PlayerSchema, LoginLogSchema, GameSchema, GameSessionSchema, MatchmakingSessionSchema],
  }),
});
```

## Key concepts & data flow
- Each schema is a TypeORM `@Entity` with columns and constraints.
- Backend modules use these entities through TypeORM repositories.

## Configuration and environment assumptions
- Designed for TypeORM and PostgreSQL in current backends.
- Requires a DB connection string at runtime (see backend app config).

## Pitfalls / common mistakes
- Changing columns without updating migrations or synchronization settings.
- Using schema types in frontend bundles (they depend on TypeORM decorators).
- Forgetting to export new schemas from `libs/api/schemas/src/index.ts`.

## Related modules
- `libs/api/player` and `libs/api/game` use these entities in services.
- `circle-sumo/circle-sumo-backend` registers the schemas.
