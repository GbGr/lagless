# `@lagless/circle-sumo-game`

## What it is
`@lagless/circle-sumo-game` is the Circle Sumo frontend app built with React, Pixi, and the Lagless ECS stack. It renders the simulation, handles player input, and connects to the relay backend.

## Why it exists / when to use it
Use it as the reference client for Lagless. It demonstrates how to wire auth, matchmaking, relay input providers, and deterministic rendering.

## Public API
- This is an application package; it does not expose a public library API.
- Entry points: `circle-sumo/circle-sumo-game/src/main.tsx` and `circle-sumo/circle-sumo-game/src/app/app.tsx`.

## Typical usage
The app connects to matchmaking and relay rooms like this:

```ts
const matchmaking = new Matchmaking();
const { client, seatReservation } = await matchmaking.connectAndFindMatch(
  import.meta.env.VITE_RELAY_URL,
  ecsConfig,
  token
);
const inputProvider = await RelayInputProvider.connect(
  ecsConfig,
  CircleSumoInputRegistry,
  client,
  seatReservation
);
```

## Key concepts & data flow
- `AuthTokenStore` and React Query manage auth and API calls.
- `RelayInputProvider` connects to the backend relay and feeds inputs into the ECS runner.
- Pixi renders ECS state, with interpolation helpers from `@lagless/misc`.
- Assets and deterministic math are initialized in `AssetsLoader` before gameplay.

## Configuration and environment assumptions
- `VITE_RELAY_URL` must point to the Colyseus relay backend.
- `VITE_API_URL` is used by `@lagless/react` for REST calls.
- Pixi assets are loaded via `AssetsLoader` before rendering.

## Pitfalls / common mistakes
- Starting a match before assets and `MathOps.init()` complete.
- Mismatched `CircleSumoInputRegistry` between client and server.
- Missing environment variables for relay or API endpoints.

## Related modules
- `circle-sumo/circle-sumo-simulation` for ECS logic and components.
- `circle-sumo/circle-sumo-backend` for matchmaking and relay rooms.
- `libs/relay-input-provider`, `libs/react`, `libs/pixi-react` for client integration.
