# AGENTS: @lagless/colyseus-rooms

## Purpose and boundaries
- Provide reusable Colyseus room base classes for matchmaking and relay workflows.
- Not responsible for game-specific services or ECS systems.

## Imports and entry points
- `libs/colyseus-rooms/src/index.ts`
- `libs/colyseus-rooms/src/lib/matchmaking.room.ts`
- `libs/colyseus-rooms/src/lib/matchmaking.service.ts`
- `libs/colyseus-rooms/src/lib/matchmaking.types.ts`
- `libs/colyseus-rooms/src/lib/matchmaking.state.ts`
- `libs/colyseus-rooms/src/lib/relay-colyseus-room.ts`

## Common tasks -> files
- Change matchmaking behavior: `matchmaking.room.ts`, `matchmaking.service.ts`, `matchmaking.types.ts`.
- Update relay lifecycle hooks or RPC fanout: `relay-colyseus-room.ts`.
- Update state shape for clients: `matchmaking.state.ts`.

## Integration points
- Circle Sumo backend extends `BaseMatchmakerRoom` and `RelayColyseusRoom` (`circle-sumo/circle-sumo-backend/src/colyseus/*`).
- Uses `@lagless/net-wire` packet schemas internally for relay bytes.

## Invariants and rules
- `frameLength` must be provided to relay rooms and match clients' ECS config.
- Auth verification must remain consistent across all rooms.
- Relay rooms must only send input-only packets over the bytes channel.

## Workflow for modifications
- Update the base classes, then update downstream room implementations if signatures change.
- Add or update tests for matchmaking behavior changes.
- Verify with `nx lint @lagless/colyseus-rooms`, `nx typecheck @lagless/colyseus-rooms`, and `nx test @lagless/colyseus-rooms`.

## Example future AI tasks
1) Add a new matchmaking config field: update types, implement behavior, update Circle Sumo room configuration.
2) Add a relay lifecycle hook: update `relay-colyseus-room.ts`, document in README, update subclass usage.
3) Add matchmaking state fields: update `matchmaking.state.ts`, ensure serialization, update client expectations.
