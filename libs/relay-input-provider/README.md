# `@lagless/relay-input-provider`

## What it is
`@lagless/relay-input-provider` is the client-side bridge between a Lagless ECS simulation and a Colyseus relay server. It handles matchmaking, handshake, ping/pong sync, and rollback triggers.

## Why it exists / when to use it
Use it in game frontends that connect to a relay backend. It implements `AbstractInputProvider` so you can plug networked inputs directly into an ECS runner.

## Public API
- `Matchmaking`: connects to the matchmaking room and returns a Colyseus seat reservation
- `RelayInputProvider`: `AbstractInputProvider` implementation that speaks the Lagless wire protocol
- `RelayInputProviderConfig`: configuration for ping interval and connection timeouts

## Typical usage
Circle Sumo uses matchmaking and relay inputs like this:

```ts
import { Matchmaking, RelayInputProvider } from '@lagless/relay-input-provider';
import { ECSConfig } from '@lagless/core';
import { CircleSumoInputRegistry } from '@lagless/circle-sumo-simulation';

const ecsConfig = new ECSConfig({ fps: 60 });
const matchmaking = new Matchmaking();
const { client, seatReservation } = await matchmaking.connectAndFindMatch(relayUrl, ecsConfig, authToken);
const inputProvider = await RelayInputProvider.connect(
  ecsConfig,
  CircleSumoInputRegistry,
  client,
  seatReservation
);
```

## Key concepts & data flow
- `RelayInputProvider.connect()` waits for `ServerHello` to set seeds and player slot.
- Ping/Pong drives `ClockSync` and `InputDelayController` to keep prediction stable.
- When authoritative inputs arrive, the provider requests rollback via `getInvalidateRollbackTick()`.

## Configuration and environment assumptions
- Requires a Colyseus relay server that uses `@lagless/net-wire` schemas.
- `ECSConfig` and `InputRegistry` must match the server-side simulation.
- Auth tokens must be valid for the relay and matchmaking rooms.

## Pitfalls / common mistakes
- Forgetting to call `dispose()` when leaving a match (leaks ping intervals).
- Using mismatched `InputRegistry` definitions between client and server.
- Ignoring rollback requests when integrating with the ECS runner.

## Related modules
- `libs/core` for `AbstractInputProvider` and ECS config types.
- `libs/net-wire` for packet schemas and clock sync.
- `libs/colyseus-rooms` for server-side relay rooms.
- `circle-sumo/circle-sumo-game` for real usage.
