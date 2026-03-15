# Multiplayer

## Architecture

Lagless uses a **relay model**: the server relays inputs between clients but does NOT run the simulation. Clients run identical deterministic simulations independently. The server is authoritative on time (tick assignment) and input acceptance, but clients are authoritative on game state.

```
Client A ──→ Server (relay) ──→ Client B
   ↓              ↓                ↓
Simulation    No simulation    Simulation
   (same inputs → same state)
```

## Input Providers

The input provider determines how RPCs are processed:

| Provider | Use Case | Rollback | verifiedTick |
|----------|---------|---------|-------------|
| `LocalInputProvider` | Single-player | None | `= tick` |
| `ReplayInputProvider` | Recorded playback | None | `= tick` |
| `RelayInputProvider` | Multiplayer | On remote inputs | `= maxServerTick - 1` |

### Single-Player Setup

```typescript
import { LocalInputProvider } from '@lagless/core';

const inputProvider = new LocalInputProvider(inputRegistry);
const runner = new MyRunner(arenaConfig, inputProvider);
```

### Multiplayer Setup

```typescript
import { RelayInputProvider } from '@lagless/relay-client';

const connection = new RelayConnection({
  serverUrl: 'ws://localhost:3333',
  scope: 'my-game',
});

const inputProvider = new RelayInputProvider(inputRegistry, connection);
const runner = new MyRunner(arenaConfig, inputProvider);

// Connect and matchmake
await connection.connect();
```

## RelayConnection

Manages WebSocket connection to the relay server. Handles matchmaking, reconnection, and message routing.

```typescript
const connection = new RelayConnection({
  serverUrl: 'ws://localhost:3333',  // server URL
  scope: 'my-game',                  // matchmaking scope (game type)
});

// Connect
await connection.connect();

// Events
connection.onMatchFound(() => { ... });
connection.onDisconnect(() => { ... });

// Disconnect
connection.disconnect();
```

## Server Setup

### RelayGameServer

```typescript
import { RelayGameServer } from '@lagless/relay-game-server';
import { hooks } from './game-hooks.js';
import { MyInputRegistry } from '@my-game/simulation';

const server = new RelayGameServer({
  port: 3333,
  loggerName: 'MyGameServer',
  roomType: {
    name: 'my-game',
    config: {
      maxPlayers: 4,
      reconnectTimeoutMs: 15_000,
      inputRecordingEnabled: true, // enable replay export
    },
    hooks,
    inputRegistry: MyInputRegistry,
  },
  matchmaking: {
    scope: 'my-game',
    config: {
      minPlayersToStart: 1,
      maxPlayers: 4,
      waitTimeoutMs: 5_000,
    },
  },
});

server.start();
```

### Dev Tools Integration

For development, add dev-tools for the dev-player testing tool:

```typescript
import { setupDevTools } from '@lagless/dev-tools';

setupDevTools(server); // Register latency API routes
server.start();
```

## Room Hooks

Room hooks define server-side game lifecycle. The server calls these hooks at appropriate times.

```typescript
import { RoomHooks, PlayerLeaveReason } from '@lagless/relay-server';

export const hooks: RoomHooks = {
  // Room created (before any players join)
  onRoomCreated: (ctx) => {
    console.log('Room created:', ctx.roomId);
  },

  // Player joins the room
  onPlayerJoin: (ctx, player) => {
    ctx.emitServerEvent(PlayerJoined, {
      slot: player.slot,
      playerId: player.id,
    });
  },

  // Player leaves (disconnect, kick, etc.)
  onPlayerLeave: (ctx, player, reason) => {
    ctx.emitServerEvent(PlayerLeft, {
      slot: player.slot,
      reason,
    });
  },

  // Player reconnects after disconnect
  onPlayerReconnect: (ctx, player) => {
    ctx.emitServerEvent(PlayerJoined, {
      slot: player.slot,
      playerId: player.id,
    });
  },

  // Whether to accept a late-joining player (room already started)
  shouldAcceptLateJoin: (ctx, player) => {
    return true; // or false to reject
  },

  // Whether to accept a reconnecting player
  shouldAcceptReconnect: (ctx, player) => {
    return true; // or false to reject
  },

  // Player reports finished (e.g., game over for them)
  onPlayerFinished: (ctx, player, result) => {
    // result is game-specific data
  },

  // Match ends (all players finished or room timeout)
  onMatchEnd: (ctx, results) => {
    // Persist results to database, etc.
  },

  // Inspect or reject client inputs before broadcast (sync, called per input)
  onInput: (ctx, player, input) => {
    // input: { tick, playerSlot, seq, payload (Uint8Array) }
    // Decode payload: InputBinarySchema.unpackBatch(registry, input.payload.buffer)
    // Return false to reject (sends CancelInput with Rejected reason)
    // Return void/true to accept
  },

  // Called when input is rejected (by validation or onInput returning false)
  onInputDeclined: (ctx, player, tick, seq, reason) => {
    // reason: 0=TooOld, 1=TooFarFuture, 2=InvalidSlot, 3=Rejected
    // Use for logging, rate-limit tracking, anti-cheat analytics
  },

  // Room is being disposed
  onRoomDisposed: (ctx) => {
    console.log('Room disposed:', ctx.roomId);
  },
};
```

### RoomContext (ctx)

The `ctx` parameter provides safe room interaction:

```typescript
ctx.emitServerEvent(InputClass, data);  // Send server-originated RPC
ctx.getPlayers();                        // Get all player info
ctx.endMatch(results);                   // End the match
ctx.roomId;                              // Room identifier
ctx.exportRecordedInputs();              // RPCHistory binary (requires inputRecordingEnabled)
ctx.exportReplay();                      // Full replay binary (seed + maxPlayers + fps + RPCHistory)
```

### Replay Export

Enable `inputRecordingEnabled: true` in server config. All broadcast inputs (client + server events) are stored. Export in `onMatchEnd`:

```typescript
onMatchEnd: async (ctx, results) => {
  const replay = ctx.exportReplay();
  if (replay) {
    // replay is ArrayBuffer — save to DB, file, or cloud storage
    // Load later via ReplayInputProvider.createFromReplay(replay, inputRegistry)
    await saveReplay(ctx.matchId, replay);
  }
},
```

## Server Events via emitServerEvent

Server events are RPCs that originate from the server, not from players. They're used for authoritative game events.

```typescript
// In hooks:
ctx.emitServerEvent(PlayerJoined, { slot: player.slot, playerId: player.id });
ctx.emitServerEvent(PlayerLeft, { slot: player.slot, reason: 0 });

// Custom server events:
ctx.emitServerEvent(RoundStart, { roundNumber: 1 });
ctx.emitServerEvent(PowerUpSpawned, { x: 100, y: 200, type: 3 });
```

Server events have `playerSlot = 255` (SERVER_SLOT) in the RPC metadata.

## State Transfer (Late Join)

When a player joins a room that's already running:

1. Server sends `StateRequest` to all connected clients
2. Clients export `ArrayBuffer.slice(0)` snapshot + hash + tick
3. `StateTransfer` picks majority hash (quorum) — protects against corrupted clients
4. Server sends chosen `StateResponse` to joining player
5. Server sends **only** events with `tick > stateResult.tick` (events baked into state are not re-sent)
6. Client applies state via `ECSSimulation.applyExternalState()` — replaces ArrayBuffer, resets clock + snapshots

### What You Need to Do

State transfer works automatically with the framework. However:
- Ensure all game state is in the ArrayBuffer (components, singletons, player resources)
- Don't keep simulation state in JavaScript variables or closures
- Physics: `ColliderEntityMap` must be rebuilt after state transfer (handled by physics runner)

## Reconnect

When a player disconnects:

1. Server tracks `PlayerConnection` as `Disconnected` with configurable timeout (`reconnectTimeoutMs`)
2. If player reconnects before timeout: state transfer restores their simulation
3. If timeout expires: `onPlayerLeave` is called with `TIMEOUT` reason
4. `shouldAcceptReconnect` hook can reject reconnection

### Testing Reconnect

1. Open F3 debug panel in game
2. Click "Disconnect" button
3. Wait a few seconds
4. Click "Reconnect" button
5. Verify: player resumes with correct state, no permanent desync

## Testing Multiplayer

### Quick Test: Two Browser Tabs

1. Start server: `pnpm dev:backend`
2. Start client: `pnpm dev:frontend`
3. Open `http://localhost:4200` in two tabs
4. Both click "Multiplayer" → they should see each other

### Dev Player Tool

The dev-player opens N game instances in an iframe grid with auto-matchmaking:

1. Start everything: `pnpm dev`
2. Open `http://localhost:4210`
3. Set instance count (2-8)
4. Click "Start" — instances auto-matchmake with unique scope

Features:
- Per-instance stats (FPS, tick, rollbacks)
- Hash timeline for divergence detection
- Per-player latency sliders
- Auto-match on load

### Debug Panel (F3)

Press F3 in-game to toggle the debug panel:
- **RTT** — round-trip time to server
- **Jitter** — RTT variance
- **Input Delay** — ticks ahead inputs are scheduled
- **Nudger** — clock offset correction
- **Tick** — current simulation tick
- **Rollbacks** — count of rollbacks
- **FPS** — render frame rate
- **Hash Table** — state hash comparison (red = divergence)
- **Disconnect/Reconnect** — buttons for testing
