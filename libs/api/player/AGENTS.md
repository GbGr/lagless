# AGENTS: @lagless/player

## Purpose and boundaries
- Provide NestJS player auth, guards, and player service logic.
- Not responsible for game-specific player data beyond core identity.

## Imports and entry points
- `libs/api/player/src/index.ts`
- `libs/api/player/src/lib/player.module.ts`
- `libs/api/player/src/lib/player.service.ts`
- `libs/api/player/src/lib/auth.guard.ts`
- `libs/api/player/src/lib/jwt.service.ts`
- `libs/api/player/src/lib/types.ts`

## Common tasks -> files
- Add or change auth behavior: `auth.guard.ts`, `jwt.service.ts`.
- Add or change player APIs: `player.controller.ts`, `player.service.ts`.
- Update module wiring: `player.module.ts`.

## Integration points
- Depends on `@lagless/schemas` entities via TypeORM.
- Circle Sumo backend uses `AuthGuard` in custom controllers.

## Invariants and rules
- `AuthGuard` must populate `req.authData` consistently.
- JWT validation must use the configured `JWT_SECRET`.
- Module exports must remain stable for downstream backends.

## Workflow for modifications
- Update types and services, then update any consuming controllers.
- If auth payload changes, update `AuthenticatedRequest` and frontend expectations.
- Verify with `nx lint @lagless/player` and `nx typecheck @lagless/player`.

## Example future AI tasks
1) Add a player profile endpoint: update controller and service, update docs and backend usage.
2) Add a new auth claim: update JWT service, guard, and `AuthenticatedRequest` types.
3) Add rate limiting hooks: update guard or controller and document behavior.
