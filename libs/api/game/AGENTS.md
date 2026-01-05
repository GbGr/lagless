# AGENTS: @lagless/game

## Purpose and boundaries
- Provide backend services for game and matchmaking session persistence.
- Not responsible for player auth or relay networking.

## Imports and entry points
- `libs/api/game/src/index.ts`
- `libs/api/game/src/lib/game.module.ts`
- `libs/api/game/src/lib/game.service.ts`

## Common tasks -> files
- Add or change persistence logic: `game.service.ts`.
- Adjust module wiring: `game.module.ts`.

## Integration points
- Depends on entities from `@lagless/schemas`.
- Circle Sumo backend uses `GameService` in matchmaking and relay rooms.

## Invariants and rules
- `internal*` methods are backend-only and should not be exposed to clients.
- Updates that affect both player and game session should remain transactional.

## Workflow for modifications
- Update service methods and any related schemas.
- Update backend callers if method signatures change.
- Verify with `nx lint @lagless/game` and `nx typecheck @lagless/game`.

## Example future AI tasks
1) Add a new game outcome field: update schemas, update `game.service.ts`, update backend usage.
2) Add a query to fetch recent games: add method in `game.service.ts`, expose via a controller in the backend.
3) Add analytics hooks on game completion: update `internalGameOver` and document behavior.
