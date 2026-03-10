# Lagless: Multiplayer Patterns

**Last Updated:** 2026-03-07

## Architecture Overview

- Server relays inputs — does NOT run simulation
- Clients are authoritative on determinism; server is authoritative on time + input acceptance
- `RelayInputProvider` handles prediction, rollback on remote inputs, clock sync
- Server hooks (`RoomHooks`) inject game-specific logic

## RelayGameServer Setup

```typescript
const server = new RelayGameServer({
  port: 3333,
  loggerName: 'MyGameServer',
  roomType: {
    name: 'my-game',
    config: { frameLength: 50, inputDelay: 3, maxPlayers: 4 },
    hooks: myGameHooks,
    inputRegistry: MyGameInputRegistry,
  },
  matchmaking: {
    scope: 'my-game',
    config: { minPlayersToStart: 1, maxPlayers: 4, waitTimeoutMs: 5000 },
  },
});
// Dev tools for dev-player support (never in production):
setupDevTools(server);
server.start();
```

## RoomHooks Pattern

```typescript
const hooks: RoomHooks<MatchResult> = {
  onPlayerJoin(ctx, player) {
    ctx.emitServerEvent(PlayerJoined, { slot: player.slot, playerId: player.id }, player.tick + 1);
  },
  onPlayerLeave(ctx, player) {
    ctx.emitServerEvent(PlayerLeft, { slot: player.slot }, player.tick + 1);
  },
  onMatchEnd(ctx, results) { /* persist results */ },
};
```

- `emitServerEvent(RpcClass, data, tick)` — schedules RPC at given tick for all clients
- `ctx.getPlayers()` — list connected players
- `ctx.endMatch(result)` — ends match, triggers `onMatchEnd`

## RelayConnection (client)

```typescript
const connection = new RelayConnection(
  { serverUrl, matchId, token },
  {
    onServerHello: (data) => inputProvider.handleServerHello(data),
    onTickInputFanout: (data) => inputProvider.handleTickInputFanout(data),
    onCancelInput: (data) => inputProvider.handleCancelInput(data),
    onPong: (data) => inputProvider.handlePong(data),
    onStateRequest: (requestId) => inputProvider.handleStateRequest(requestId),
    onStateResponse: (data) => inputProvider.handleStateResponse(data),
  },
);
inputProvider.setConnection(connection);
connection.connect();
const serverHello = await inputProvider.serverHello;
```

## ECS Config from Server

```typescript
// Always use server seed in multiplayer:
ecsConfig = new ECSConfig({ ...inputProvider.ecsConfig, seed: serverHello.seed });
```

## Clock Sync After Start

```typescript
_runner.start();
if (serverHello.serverTick > 0) {
  _runner.Simulation.clock.setAccumulatedTime(serverHello.serverTick * _runner.Config.frameLength);
}
```

## Hash Verification (divergence detection)

```typescript
// In runner-provider, before start():
_runner.Simulation.enableHashTracking(MapTestArena.hashReportInterval);

const reportHash = createHashReporter(_runner, {
  reportInterval: MapTestArena.hashReportInterval,
  reportHashRpc: ReportHash,
});

inputProvider.drainInputs((addRPC) => {
  reportHash(addRPC);  // reports hash for verified ticks
});
```

**Required YAML fields for hash verification:**
```yaml
playerResources:
  PlayerResource:
    lastReportedHash: uint32
    lastReportedHashTick: uint32
    hashMismatchCount: uint16
inputs:
  ReportHash:
    hash: uint32
    atTick: uint32
```

**DivergenceSignal** — extend `AbstractHashVerificationSystem` in simulation, emit when mismatch detected.

## Late-Join / State Transfer

Handled automatically by `RelayInputProvider` + `RelayRoom`:
1. Server sends `StateRequest` to connected clients
2. Clients respond with `StateResponse` (ArrayBuffer snapshot + hash + tick)
3. Server picks quorum hash, sends to joining player
4. Client calls `ECSSimulation.applyExternalState()` — replaces buffer, resets clock

**Server event journal:** Events with `tick <= stateTick` are NOT re-sent (baked into state). Only post-state events are replayed.

## Dev Player Integration (game client requirements)

```typescript
// In runner-provider:
useDevBridge(runner, { hashTrackingInterval: MapTestArena.hashReportInterval });
```

Support URL params: `?devBridge=true`, `?autoMatch=true`, `?serverUrl=`, `?scope=`, `?instanceId=`

Title screen must listen for `dev-bridge:start-match` postMessage and auto-match when `?autoMatch=true`.

## Per-Player Latency (dev only)

`RelayRoom.perPlayerLatency` — `Map<slot, LatencySimulator>` — overrides global latency per player.

API (registered by `setupDevTools`): `POST/GET/DELETE /api/dev/latency/player`

## verifiedTick Semantics

- `LocalInputProvider.verifiedTick = simulation.tick` — immediate, no rollback possible
- `RelayInputProvider.verifiedTick = max(serverTick) - 1` — server-confirmed, safe from rollback
- Signals use `verifiedTick` to distinguish Predicted vs Verified vs Cancelled events
- Hash reporter skips ticks where `lastReportedHashTick > verifiedTick`
