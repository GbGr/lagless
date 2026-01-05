# `@lagless/colyseus-rooms`

## What it is
`@lagless/colyseus-rooms` provides base Colyseus room classes for matchmaking and relay-based gameplay. It abstracts common auth, queueing, and input fanout behavior.

## Why it exists / when to use it
Use it when building a Lagless backend that needs matchmaking and relay rooms. It keeps server-side behavior consistent across games and reduces boilerplate.

## Public API
- `BaseMatchmakerRoom`: abstract room with auth and matchmaking queue logic
- `RelayColyseusRoom`: abstract room that relays ECS inputs to clients
- `MatchmakingConfig`, `MatchTicket`, `MatchGroup`, `RoomAuthResult`: matchmaking types
- `MatchmakerState`, `SearchingPlayer`: matchmaking state snapshots

## Typical usage
Circle Sumo implements matchmaking by extending the base room:

```ts
export class CircleSumoMatchmakingRoom extends BaseMatchmakerRoom {
  protected override getMatchmakingConfig() {
    return { virtualCapacity: 4, maxHumans: 4, /* ... */ };
  }

  protected override getGameRoomName() {
    return 'relay';
  }
}
```

## Key concepts & data flow
- `BaseMatchmakerRoom` verifies auth tokens, enqueues players, and groups tickets into matches.
- When a match is found, it spawns a relay room via `matchMaker.createRoom` using `buildGameRoomOptions`.
- `RelayColyseusRoom` handles RPC fanout and lifecycle hooks (player join/leave, game over).

## Configuration and environment assumptions
- Subclasses must provide JWT secret, matchmaking config, frame length, and game room name.
- Relay rooms should align `frameLength` with `ECSConfig` values used by clients.

## Pitfalls / common mistakes
- Forgetting to propagate `frameLength` or max players into relay options.
- Doing long-running work inside matchmaking tick callbacks.
- Leaving auth hooks unimplemented or inconsistent with backend auth services.

## Related modules
- `libs/net-wire` for the underlying packet schemas.
- `libs/relay-input-provider` for the client-side counterpart.
- `circle-sumo/circle-sumo-backend` for real usage.
