# Lagless — Deterministic ECS Framework for Multiplayer Games

Deterministic Entity-Component-System framework on TypeScript with simulate/rollback netcode, designed for real-time multiplayer browser games.

## Core Principles

1. **Determinism** — identical inputs + identical seed = identical simulation on every client
2. **State in ArrayBuffer** — entire simulation state lives in a single pre-allocated ArrayBuffer (Structure-of-Arrays layout), enabling instant snapshots via `ArrayBuffer.slice()` and zero-overhead state transfer
3. **Simulate/Rollback** — when a remote input arrives for an already-simulated tick, the engine rolls back to the nearest snapshot and re-simulates forward
4. **No View coupling** — the framework provides data; rendering is handled externally (Pixi.js, Three.js, etc.)
5. **Relay Multiplayer** — server relays inputs, does NOT run simulation. Clients are authoritative on determinism; server is authoritative on time and input acceptance

## Repository Structure

```
lagless/
├── libs/                          # Framework libraries (publishable)
│   ├── binary/                    # Binary serialization, MemoryTracker, BinarySchema
│   ├── math/                      # Deterministic math (WASM), Vector2
│   ├── misc/                      # Utilities: UUID, SnapshotHistory, SimulationClock, Logger, PhaseNudger
│   ├── core/                      # ECS engine: Mem, ECSSimulation, ECSRunner, DI, Signals, Input system
│   ├── net-wire/                  # Binary network protocol, ClockSync, InputDelayController
│   ├── relay-server/              # Server: RelayRoom, RoomRegistry, StateTransfer, InputHandler
│   ├── relay-client/              # Client: RelayInputProvider, RelayConnection
│   ├── matchmaking/               # Matchmaking: MatchmakingService, QueueStore, match formation
│   ├── animate/                   # Frame-based animation utilities
│   ├── react/                     # React auth context, usePlayer, API helpers
│   └── pixi-react/                # Pixi.js React: virtual joystick, VFX hooks
├── circle-sumo/                   # Example game (gameplay-focused)
│   ├── circle-sumo-simulation/    # Game logic: components, systems, signals, inputs
│   ├── circle-sumo-game/          # Browser client (React + Pixi.js)
│   └── game-server/               # Bun game server (relay + matchmaking + REST)
├── sync-test/                     # Determinism test bench (late-join, reconnect, hash verification)
│   ├── sync-test-simulation/      # Movement + coin collection + hash reporting
│   ├── sync-test-game/            # Browser client with debug panel
│   └── game-server/               # Bun game server (port 3334)
└── tools/
    └── codegen/                   # YAML schema → TypeScript code generator
```

## Dependency Graph

```
binary ──┐
math ────┤
         ├─► misc ──┬─► core ──────────────┬─► relay-client
         │          ├─► net-wire ───────────┤
         │          ├─► matchmaking         ├─► relay-server
         │          └───────────────────────┘
         │
         └─► game-simulation ──► game-client
                                game-server

Games: circle-sumo-simulation, sync-test-simulation
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Nx 21.6, pnpm workspaces |
| Language | TypeScript 5.9 (strict, ESM) |
| Build | tsc project references, SWC for libs needing decorator support |
| Test | Vitest 3.2 |
| Client | React 19, Pixi.js 8, Vite 7 |
| Server | Bun (native WebSocket, TS execution without compilation) |
| Math | WASM-based deterministic trig (@lagless/deterministic-math) |

---

## Library Reference

### @lagless/binary

Low-level binary serialization for both network protocol and ECS memory layout.

**Key exports:**
- `BinarySchema` — declare typed structs, `pack()/unpack()` to/from `Uint8Array`
- `BinarySchemaPackPipeline` / `BinarySchemaUnpackPipeline` — compose multiple schemas sequentially
- `InputBinarySchema` — pack/unpack game inputs with field definitions
- `MemoryTracker` — sequential allocator for placing TypedArrays in a shared ArrayBuffer (8-byte aligned)
- `FieldType` enum — Int8, Uint8, Int16, Uint16, Int32, Uint32, Float32, Float64
- `packBatchBuffers` / `unpackBatchBuffers` — length-prefixed buffer concatenation
- `align8()`, `toFloat32()`, `getFastHash()`

### @lagless/math

Deterministic math functions backed by WASM. All trig uses `dm_sin`, `dm_cos`, `dm_atan2`, `dm_sqrt` to guarantee identical results across platforms.

**Key exports:**
- `MathOps` — static class with `init()` (async, loads WASM), `sin`, `cos`, `atan2`, `sqrt`, `lerp`, `lerpAngle`, `clamp`, `clamp01`, `normalizeAngle`
- `Vector2` — 2D vector with three-variant pattern for every operation:
  - `.addToNew(other)` → new Vector2
  - `.addToRef(other, ref)` → writes into ref
  - `.addInPlace(other)` → mutates self
- `VECTOR2_BUFFER_1..10` — pre-allocated scratch vectors to avoid GC in hot loops

### @lagless/misc

Runtime utilities shared across all layers.

**Key exports:**
- `createLogger(tag)` — leveled logger (`debug/info/warn/error`), controlled by `setLogLevel(LogLevel.Silent)` for production
- `UUID` — v4 generation, masked UUIDs for bot detection (`UUID.generateMasked()`, `UUID.isMaskedUint8()`)
- `SimulationClock` — tracks `accumulatedTime`, integrates `PhaseNudger` for server-time drift correction
- `PhaseNudger` — smoothly corrects clock drift via weighted debt accumulation + gradual drain
- `SnapshotHistory<T>` — ring-buffer of (tick → snapshot) with binary search by tick, used for rollback
- `RingBuffer<T>` — fixed-size circular buffer
- `now()` — cross-platform `performance.now()` wrapper

### @lagless/core

The ECS engine. This is the heart of the framework.

#### Memory Model

All ECS state lives in **one contiguous ArrayBuffer**, laid out by `Mem`:

```
ArrayBuffer
├─ TickManager          (Uint32: current tick)
├─ PRNGManager          (Uint32[4]: xoshiro128** state)
├─ ComponentsManager    (SoA: each component field is a TypedArray[maxEntities])
├─ SingletonsManager    (global typed fields)
├─ FiltersManager       (per-filter: Uint32 length + Uint32[maxEntities] entity IDs)
├─ EntitiesManager      (nextId, removedStack, componentMasks: Uint32[maxEntities])
└─ PlayerResourcesManager (per-player typed fields × maxPlayers)
```

Snapshot = `ArrayBuffer.slice(0)`. Rollback = `Uint8Array.set()` from snapshot. This is the fastest possible state save/restore in JavaScript.

#### Entity System

- Entity = integer index (0 to maxEntities-1)
- Component mask: `Uint32Array`, 32 component types max (IDs are powers of 2)
- Removed entity sentinel: `0xFFFFFFFF` (ENTITY_REMOVED_MASK)
- Entity recycling via stack (LIFO reuse of removed IDs)
- Double-removal guard (safe to call `removeEntity` on already-removed entity)

#### Filters (Queries)

Filters maintain a live list of entities matching `include/exclude` component masks:

```typescript
class MyFilter extends AbstractFilter {
  static readonly include = [Transform2d, Velocity2d];
  static readonly exclude = [Disabled];
  readonly includeMask = Transform2d.ID | Velocity2d.ID;
  readonly excludeMask = Disabled.ID;
}
```

- O(length) scan for add/remove (not O(maxEntities))
- Swap-back-last for O(1) removal
- Iterable: `for (const entity of filter) { ... }`
- All filter data is in the shared ArrayBuffer — restored on rollback

#### Input System

Inputs are RPC objects with deterministic ordering:

```typescript
interface InputMeta {
  tick: number;       // when this input applies
  seq: number;        // per-player frame sequence
  ordinal: number;    // order within frame (multiple inputs per frame)
  playerSlot: number; // which player (0-based)
}
```

**RPCHistory** stores all inputs indexed by tick. Sorting is deterministic: `(playerSlot, ordinal, seq)`. This order is identical regardless of insertion order — critical for multiplayer determinism.

**AbstractInputProvider** is the base class:
- `addLocalRpc(InputCtor, data)` — private, creates RPC with `tick = currentTick + inputDelay`
- `addRemoteRpc(rpc)` — public, injects remote player's RPC into history
- `removeRpcAt(slot, tick, seq)` — for CancelInput handling
- `setInputDelay(ticks)` — adaptive delay based on network conditions
- `getTickRPCs(tick, InputCtor)` — query inputs for a tick (returns ephemeral ReadonlyArray)
- `getFrameRPCBuffer()` — this frame's local RPCs (for sending to server)
- `drainInputs(fn)` — register input sources (joystick, keyboard, etc.)

**Concrete providers:**
- `LocalInputProvider` — single-player, never triggers rollback
- `ReplayInputProvider` — loads pre-recorded RPCHistory from binary
- `RelayInputProvider` (in @lagless/relay-client) — multiplayer with prediction + rollback

#### Signals (Prediction/Verification Events)

Signals track game events through the rollback lifecycle:

```
1. System emits signal → Predicted fires (play sound, show VFX)
2. Tick verified (maxInputDelayTick later):
   - Still present after re-simulation → Verified fires
   - Missing after rollback → Cancelled fires (stop sound, hide VFX)
```

#### Simulation Loop

```
ECSSimulation.update(dt):
  1. clock.update(dt)              — advance accumulatedTime + PhaseNudger correction
  2. targetTick = floor(accTime / frameLength)
  3. checkAndRollback()            — if inputProvider says rollback needed
  4. simulationTicks(current, target):
     for each tick:
       a. tickManager.setTick(++tick)
       b. systems[i].update(tick)   — for loop, deterministic order
       c. signalsRegistry.onTick()  — verify/cancel predictions
       d. saveSnapshot (if snapshotRate match)
  5. inputProvider.update()         — drain input sources, send to server
  6. interpolationFactor = leftover / frameLength  — for render interpolation
```

#### Dependency Injection

Decorators `@ECSSystem()` and `@ECSSignal()` + reflect-metadata for constructor injection:

```typescript
@ECSSystem()
class PhysicsSystem implements IECSSystem {
  constructor(
    private readonly _transform: Transform2d,    // component instance
    private readonly _velocity: Velocity2d,      // component instance
    private readonly _filter: Velocity2dFilter,  // filter instance
    private readonly _entities: EntitiesManager,  // manager
    private readonly _prng: PRNG,                // deterministic RNG
  ) {}

  update(tick: number) {
    for (const entity of this._filter) {
      // ...
    }
  }
}
```

All components, singletons, filters, player resources, and managers are registered in `ECSRunner` constructor and resolved automatically.

#### ECSConfig (defaults)

| Property | Default | Description |
|----------|---------|-------------|
| `seed` | zero | 128-bit PRNG seed (Uint8Array[16]) |
| `maxEntities` | 1000 | Maximum entity slots |
| `maxPlayers` | 6 | Player slots |
| `fps` | 60 | Tick rate |
| `frameLength` | 16.67ms | = 1000/fps |
| `initialInputDelayTick` | 2 | Starting input delay |
| `minInputDelayTick` | 1 | Lower bound |
| `maxInputDelayTick` | 8 | Upper bound |
| `snapshotRate` | 1 | Save snapshot every N ticks |
| `snapshotHistorySize` | 100 | Ring buffer size |
| `maxNudgePerFrame` | frameLength/4 | Max clock correction per frame |

### @lagless/net-wire

Binary network protocol shared between client and server.

**Message types (MsgType enum):**

| Type | Dir | Purpose | Key Fields |
|------|-----|---------|------------|
| ServerHello | S→C | Match init | seed0/1 (f64), playerSlot, serverTick, players[], scopeJson |
| TickInput | C→S | Player input | tick, playerSlot, seq, kind (Client/Server), payload |
| TickInputFanout | S→C | Broadcast inputs | serverTick, inputCount, inputs[] |
| CancelInput | S→C | Reject late input | tick, playerSlot, seq, reason |
| Ping | C→S | RTT measurement | cSend (f64) |
| Pong | S→C | RTT response | cSend, sRecv, sSend (all f64), sTick |
| StateRequest | S→C | Late-join state | requestId |
| StateResponse | C→S | State snapshot | requestId, tick, hash, state (ArrayBuffer) |
| PlayerFinished | C→S | Game result | tick, playerSlot, payload |

All timestamps are **Float64** for sub-millisecond precision over long sessions.

**ClockSync** — EWMA-based network timing:
- Warmup phase (5 samples): median for initial RTT/offset/jitter
- Post-warmup: EWMA with alpha=0.15
- `serverNowMs(clientNowMs)` / `clientNowMs(serverNowMs)` for time conversion

**InputDelayController** — adaptive input delay:
```
delay = ceil((RTT/2 + k*JITTER + SAFETY) / tickMs) + 1
```
- k=1.8 (jitter multiplier), SAFETY=10ms
- Hysteresis: increases immediately, decreases by 1 per step

### @lagless/relay-server

Server-side relay room management. Runtime-agnostic (works with Bun, Node.js, etc.).

**Architecture: sealed RelayRoom + RoomHooks composition**

The `RelayRoom` class is NOT extended. Game-specific behavior is injected via `RoomHooks<TResult>`:

```typescript
interface RoomHooks<TResult> {
  onRoomCreated?(ctx: RoomContext): void | Promise<void>;
  onPlayerJoin?(ctx: RoomContext, player: PlayerInfo): void | Promise<void>;
  onPlayerLeave?(ctx: RoomContext, player: PlayerInfo, reason: LeaveReason): void | Promise<void>;
  onPlayerFinished?(ctx: RoomContext, player: PlayerInfo, result: TResult): void | Promise<void>;
  onMatchEnd?(ctx: RoomContext, results: ReadonlyMap<PlayerSlot, TResult>): void | Promise<void>;
  onRoomDisposed?(ctx: RoomContext): void | Promise<void>;
  shouldAcceptReconnect?(ctx: RoomContext, playerId: PlayerId): boolean;
}
```

Hooks receive `RoomContext` — a safe API for interacting with the room:
- `emitServerEvent(inputId, data)` — broadcast server-side input to all clients
- `getPlayers()`, `getConnectedPlayerCount()`, `isPlayerConnected(slot)`
- `sendTo(slot, message)`, `broadcast(message)`
- `endMatch()`

**Key components:**
- `ServerClock` — authoritative tick based on `performance.now()`
- `InputHandler` — validates incoming TickInput (tick range, slot ownership), broadcasts or sends CancelInput
- `StateTransfer` — late-join/reconnect: requests snapshots from connected clients, majority vote by hash, timeout fallback to full journal replay
- `PlayerConnection` — tracks WebSocket, connection state (Connected/Disconnected/Gone), reconnect timeout
- **Server events journal** — stores all server-emitted events (PlayerJoined, PlayerLeft). On state transfer, only post-state events (tick > stateTick) are sent to avoid duplication
- `RoomRegistry` — manages room types + active rooms, periodic cleanup of disposed rooms
- `LatencySimulator` — artificial delay/jitter/packet-loss for testing

**Input validation rule:** `input.tick < serverTick` → reject (TooOld). `input.tick > serverTick + maxFutureTicks` → reject (TooFarFuture).

### @lagless/relay-client

Client-side multiplayer networking.

**RelayInputProvider extends AbstractInputProvider:**
- On local input: adds to history (prediction) + sends to server via `RelayConnection`
- On `TickInputFanout`: adds remote RPCs, triggers rollback if `remoteTick <= currentTick`
- On `CancelInput`: removes RPC, triggers rollback
- On `Pong`: updates ClockSync → PhaseNudger activation → InputDelayController recompute
- On `StateRequest`: exports simulation snapshot, sends to server
- On `StateResponse`: applies external state via `ECSSimulation.applyExternalState()` — replaces ArrayBuffer, resets clock + snapshots + RPC history
- Tracks `rollbackCount` for debug monitoring

**RelayConnection** — WebSocket wrapper:
- Binary message parsing for all MsgType
- Auto ping interval: warmup (150ms × 5), then steady (1000ms)
- Event-driven: callbacks for each message type

#### Late-Join & Reconnect (State Transfer)

When a player connects to a room with an active simulation (`serverTick > 0` and `lateJoinEnabled: true`):

```
1. Server → StateRequest to all connected clients
2. Clients → StateResponse (ArrayBuffer snapshot + hash + tick)
3. Server picks majority hash (quorum), forwards chosen state to joining player
4. Server sends post-state journal events (tick > stateTick only)
5. Client calls ECSSimulation.applyExternalState() — replaces ArrayBuffer, resets clock/snapshots
6. Client resumes normal simulation from transferred tick
```

**Server events journal** (`_serverEventJournal`): All server-emitted events (PlayerJoined, PlayerLeft) are recorded. On state transfer success, only events with `tick > stateResult.tick` are sent — events already in the state are NOT duplicated. On failure (timeout, no quorum), the full journal is replayed as fallback.

**Reconnect** follows the same flow. `PlayerConnection` tracks `Disconnected` state with `reconnectTimeoutMs`. The `shouldAcceptReconnect` hook can reject reconnection attempts.

### @lagless/matchmaking

Scoped matchmaking with WebSocket transport.

**Architecture:**
- `QueueStore` interface → `InMemoryQueueStore` (default), can swap to Redis
- `MatchmakingService` — coordinates queue management, periodic match formation, player notifications
- `tryFormMatch()` — pure function: FIFO + optional MMR proximity sorting

**Match formation rules:**
1. `entries >= maxPlayers` → match immediately (pick by MMR proximity to longest-waiting player)
2. `waitTimeout reached && entries >= minPlayers` → match with bots filling remaining slots
3. Otherwise → keep waiting

**Player lifecycle:**
```
addPlayer(id, scope, mmr, metadata, notifyFn) → queued notification
  → periodic check → match formed
  → onMatchFormed callback (game server creates room, generates tokens)
  → match_found notification to all matched players
removePlayer(id) → auto-called on WebSocket disconnect
```

---

## Creating a New Game

For each new game, create three NX packages:

### 1. GameSimulation (`my-game/my-game-simulation/`)

Use `@lagless/codegen` to generate components, singletons, filters, inputs, player resources from a YAML schema. Then write systems and signals.

```yaml
# schema.yml example
components:
  Transform2d:
    fields:
      positionX: float32
      positionY: float32
inputs:
  Move:
    id: 3
    fields:
      direction: float32
      speed: float32
```

### 2. GameClient (`my-game/my-game-client/`)

React + Pixi.js application. Key integration points:
- Create `LocalInputProvider` or `RelayInputProvider`
- Store in `ProviderStore`, navigate to game route
- `RunnerProvider` creates `ECSRunner` with systems/signals, starts simulation
- `RunnerTicker` calls `runner.update(deltaMS)` every frame via Pixi ticker
- `drainInputs()` connects UI (joystick, buttons) to input system

### 3. GameServer (`my-game/game-server/`)

Bun application. Wire up relay-server + matchmaking:

```typescript
import { RoomRegistry } from '@lagless/relay-server';
import { MatchmakingService, InMemoryQueueStore } from '@lagless/matchmaking';

const roomRegistry = new RoomRegistry();
roomRegistry.registerRoomType('my-game', roomConfig, myGameHooks);

const matchmaking = new MatchmakingService(new InMemoryQueueStore());
matchmaking.registerScope('my-game', scopeConfig);
matchmaking.setOnMatchFormed(async (match) => {
  roomRegistry.createRoom({ matchId: match.matchId, roomType: match.scope, players: [...] }, seed0, seed1);
  // generate tokens, return per-player data
});
matchmaking.start();

Bun.serve({
  fetch(req, server) { /* WS upgrade + REST */ },
  websocket: wsRouter.websocket,
});
```

---

## Running the Examples

```bash
# Install dependencies
pnpm install

# Build framework libs (needed for Bun server)
npx tsc --build libs/net-wire/tsconfig.lib.json --force
npx tsc --build libs/relay-server/tsconfig.lib.json --force
npx tsc --build libs/matchmaking/tsconfig.lib.json --force

# Terminal 1: Game server (Bun)
cd circle-sumo/game-server && bun run src/main.ts

# Terminal 2: Game client (Vite)
npx nx serve @lagless/circle-sumo-game

# Browser: http://localhost:4200
# Click "Play Online" to test multiplayer
```

**Debug endpoints (both servers):**
- `GET http://localhost:<port>/health` — server status, room count, queue count
- `GET/POST http://localhost:<port>/api/latency` — artificial latency control:
  ```bash
  curl -X POST http://localhost:3333/api/latency -H 'Content-Type: application/json' \
    -d '{"delayMs": 100, "jitterMs": 30, "packetLossPercent": 5}'
  ```

### Sync Test (Determinism Test Bench)

```bash
# Terminal 1: Game server (Bun, port 3334)
cd sync-test/game-server && bun run src/main.ts

# Terminal 2: Game client (Vite, port 4201)
npx nx serve @lagless/sync-test-game

# Browser: http://localhost:4201
```

**What it tests:** PRNG determinism (random coin spawns must match), entity lifecycle (frequent create/destroy), late-join state transfer, reconnect, and divergence detection (cross-client hash comparison every 2 seconds).

## Testing

```bash
# All unit tests (193 tests, 13 files)
npx vitest run

# Specific library
npx vitest run --project=@lagless/core

# Integration test (server must be running)
cd circle-sumo/game-server && bun run src/integration-test.ts
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single ArrayBuffer for all state | Instant snapshot/restore via slice/set — fastest possible rollback |
| Uint32 component masks (32 components max) | Single bitwise AND per filter check — cache-friendly |
| Structure-of-Arrays (SoA) layout | Contiguous memory per field across entities — cache-line optimal |
| xoshiro128** PRNG in ArrayBuffer | Deterministic, fast, state included in snapshots — restored on rollback |
| Sorted RPCs by (playerSlot, ordinal, seq) | Deterministic input processing regardless of network arrival order |
| Server rejects `tick < serverTick` | Simple rule, lagging player handles rollback locally |
| Sealed RelayRoom + RoomHooks | Game devs can't break relay logic; hooks provide safe extension points |
| Matchmaking decoupled from relay | Different scaling needs; matchmaking is stateless, relay is stateful |
| Float64 for network timestamps | Sub-ms precision even after hours of gameplay |
| Bun for game server | Fastest JS WebSocket implementation, native TS support |

## Known Limitations

- **32 component types max** — Uint32 bitmask. Upgrade path: two Uint32 words (64 components) with minimal performance impact
- **RPCHistory grows unbounded** — no pruning of old ticks yet. For very long sessions, consider adding a prune method
- **No server-side simulation** — relay model trusts clients. For cheat detection, would need server-side replay
- **Single-instance matchmaking** — InMemoryQueueStore. For horizontal scaling, implement Redis-backed QueueStore
