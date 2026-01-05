# AGENTS: @lagless/circle-sumo-backend

## Purpose and boundaries
- Run Circle Sumo backend services: matchmaking, relay rooms, and persistence.
- Not responsible for frontend rendering or client UI.

## Imports and entry points
- `circle-sumo/circle-sumo-backend/src/main.ts` (entry point)
- `circle-sumo/circle-sumo-backend/src/colyseus/matchmaking.ts`
- `circle-sumo/circle-sumo-backend/src/colyseus/relay.ts`
- `circle-sumo/circle-sumo-backend/src/app/*` (Nest controllers/services)
- `circle-sumo/circle-sumo-backend/src/nest-di.ts`

## Common tasks -> files
- Adjust matchmaking rules: `src/colyseus/matchmaking.ts`.
- Adjust relay behavior or RPC fanout: `src/colyseus/relay.ts`.
- Add API endpoints: `src/app/*.controller.ts` and `src/app/*.service.ts`.
- Update module wiring: `src/app/app.module.ts`.

## Integration points
- Depends on `@lagless/colyseus-rooms`, `@lagless/game`, `@lagless/player`, and `@lagless/schemas`.
- Uses `@lagless/circle-sumo-simulation` for input registry and gameplay helpers.
- Client-side counterpart is `@lagless/relay-input-provider`.

## Invariants and rules
- Relay rooms must send input-only RPCs and use `CircleSumoInputRegistry`.
- Frame length must match client `ECSConfig` to keep prediction stable.
- Do not block Colyseus callbacks; await async work and handle failures.

## Workflow for modifications
- Update room logic or Nest services, then update any client assumptions.
- If RPCs or schema change, regenerate simulation code and update clients.
- Verify with `nx lint @lagless/circle-sumo-backend` and `nx typecheck @lagless/circle-sumo-backend`.
- Run locally with `nx serve @lagless/circle-sumo-backend`.

## Example future AI tasks
1) Tune matchmaking thresholds: update `matchmaking.ts`, update docs, verify with staging clients.
2) Add a relay-side analytics hook: update `relay.ts`, update persistence service, update docs.
3) Add a new REST endpoint: update controller/service, register schema entity if needed.
