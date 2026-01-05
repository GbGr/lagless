# AGENTS: @lagless/relay-input-provider

## Purpose and boundaries
- Provide a client-side `AbstractInputProvider` that communicates with relay servers.
- Not responsible for server matchmaking logic or ECS systems.

## Imports and entry points
- `libs/relay-input-provider/src/index.ts`
- `libs/relay-input-provider/src/lib/matchmaking.ts`
- `libs/relay-input-provider/src/lib/relay-input-provider.ts`

## Common tasks -> files
- Adjust matchmaking flow or timeouts: `matchmaking.ts`.
- Update handshake, ping, or rollback behavior: `relay-input-provider.ts`.
- Update exports or types: `src/index.ts`.

## Integration points
- Circle Sumo frontend connects to relay via `use-start-match` (`circle-sumo/circle-sumo-game/src/app/hooks/use-start-match.ts`).
- Server-side counterpart is `@lagless/colyseus-rooms` relay rooms.
- Protocol schemas live in `@lagless/net-wire`.

## Invariants and rules
- Must only send/receive binary messages on `RELAY_BYTES_CHANNEL`.
- Wait for `ServerHello` before sending inputs.
- Input delay ticks must stay within `ECSConfig` bounds.

## Workflow for modifications
- Update provider logic, then update Circle Sumo usage if signatures change.
- If protocol handling changes, update `@lagless/net-wire` docs and server relay rooms.
- Verify with `nx lint @lagless/relay-input-provider`, `nx typecheck @lagless/relay-input-provider`, and `nx test @lagless/relay-input-provider`.

## Example future AI tasks
1) Add a reconnect helper: implement in `relay-input-provider.ts`, expose API, update README and Circle Sumo usage.
2) Add matchmaking cancellation reason codes: update `matchmaking.ts`, update frontend handling and docs.
3) Add telemetry callbacks: implement in provider, update README, add tests.
