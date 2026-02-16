# @lagless/net-wire

## 1. Responsibility & Context

Defines the binary network protocol for Lagless multiplayer games and provides utilities for network timing synchronization (`ClockSync`), adaptive input delay calculation (`InputDelayController`), and tick-indexed input buffering (`TickInputBuffer`). All network messages use binary schemas from `@lagless/binary` for efficient serialization. This library handles the "wire protocol" between clients and the relay server, ensuring deterministic input delivery and clock synchronization for rollback netcode.

## 2. Architecture Role

**Network layer** — sits above `@lagless/binary` (for schema definitions) and provides protocol/utilities used by game clients and relay servers.

**Downstream consumers:**
- Game clients — Use `ClockSync` and `InputDelayController` to adapt to network conditions
- Relay servers — Use protocol structs (`TickInputStruct`, etc.) to pack/unpack messages
- `@lagless/core` input providers — Use protocol for sending/receiving player inputs

**Upstream dependencies:**
- `@lagless/binary` — `BinarySchema`, `FieldType` for message layout

## 3. Public API

### Protocol Constants

```typescript
const RELAY_BYTES_CHANNEL = 99; // Colyseus raw-binary channel ID

enum WireVersion {
  V1 = 1, // Current protocol version
}

enum MsgType {
  ServerHello,         // 0: Server → Client (initial connection)
  TickInput,           // 1: Client → Server (player input)
  TickInputFanout,     // 2: Server → Client (broadcast inputs + server tick)
  PlayerFinishedGame,  // 3: Server → Client (game result)
  CancelInput,         // 4: Client/Server (cancel input due to disconnect)
  Ping,                // 5: Client → Server (RTT measurement)
  Pong,                // 6: Server → Client (RTT response)
}

enum TickInputKind {
  Client, // Input from human player
  Server, // Input from bot/AI
}
```

### Message Schemas (BinarySchema)

All messages start with `HeaderStruct`, followed by type-specific payload.

#### HeaderStruct

```typescript
const HeaderStruct = new BinarySchema({
  version: FieldType.Uint8, // WireVersion (1 byte)
  type: FieldType.Uint8,    // MsgType (1 byte)
});
```

#### ServerHelloStruct

Server sends this on connection. Provides seed and player slot.

```typescript
const ServerHelloStruct = new BinarySchema({
  seed0: FieldType.Float64,      // First 8 bytes of PRNG seed
  seed1: FieldType.Float64,      // Second 8 bytes of PRNG seed
  playerSlot: FieldType.Uint8,   // Assigned player slot (0-based)
});
```

#### TickInputStruct

Client sends input for a tick. Server relays to all clients.

```typescript
const TickInputStruct = new BinarySchema({
  tick: FieldType.Uint32,        // Tick this input applies to
  playerSlot: FieldType.Uint8,   // Player who sent input
  kind: FieldType.Uint8,         // TickInputKind (Client=0, Server=1)
  seq: FieldType.Uint32,         // Sequence number (for duplicate detection)
});
```

**Note:** Input payload follows this struct (variable length, game-specific).

#### TickInputFanoutStruct

Server broadcasts to clients after collecting inputs for a tick. Includes server tick hint for clock sync.

```typescript
const TickInputFanoutStruct = new BinarySchema({
  serverTick: FieldType.Uint32, // Server's current tick
});
```

**Note:** Fanout message includes all `TickInputStruct` messages for the tick (batched).

#### CancelInputStruct

Server sends when a player disconnects mid-game to cancel their future inputs.

```typescript
const CancelInputStruct = new BinarySchema({
  tick: FieldType.Uint32,        // Tick to cancel
  playerSlot: FieldType.Uint8,   // Player whose input is cancelled
  seq: FieldType.Uint32,         // Sequence number to cancel
});
```

#### PingStruct

Client sends to measure RTT.

```typescript
const PingStruct = new BinarySchema({
  cSend: FieldType.Float32, // Client send timestamp (ms, from performance.now())
});
```

#### PongStruct

Server responds with timing data for RTT and clock offset calculation.

```typescript
const PongStruct = new BinarySchema({
  cSend: FieldType.Float32,  // Echo of client's cSend
  sRecv: FieldType.Float32,  // Server receive timestamp (ms)
  sSend: FieldType.Float32,  // Server send timestamp (ms)
  sTick: FieldType.Uint32,   // Server's current tick
});
```

#### PlayerFinishedGameStruct

Server sends when a player finishes the game (final score, MMR change).

```typescript
const PlayerFinishedGameStruct = new BinarySchema({
  tick: FieldType.Uint32,         // Tick when player finished
  verifiedTick: FieldType.Uint32, // Verified tick (after input delay)
  playerSlot: FieldType.Uint8,    // Player slot
  score: FieldType.Uint32,        // Final score
  mmrChange: FieldType.Int32,     // MMR change (can be negative)
});
```

### ClockSync

Maintains network timing statistics: RTT, jitter, and server time offset. Uses EWMA (Exponentially Weighted Moving Average) with warmup phase for stable estimates.

```typescript
class ClockSync {
  constructor(warmupSampleCount?: number); // Default: 5 samples

  get rttEwmaMs(): number;                 // Round-trip time EWMA (ms)
  get jitterEwmaMs(): number;              // Jitter EWMA (ms)
  get serverTimeOffsetMs(): number;        // Server time offset (ms)
  get sampleCount(): number;               // Total samples processed
  get isReady(): boolean;                  // True after warmup phase completes

  updateFromPong(
    clientReceiveMs: number,
    pong: InferBinarySchemaValues<typeof PongStruct>
  ): boolean;                              // Update stats from pong, returns true if became ready
}
```

**How it works:**
- **Warmup phase:** Collects `warmupSampleCount` samples (default 5), uses median for initial estimate
- **After warmup:** Uses EWMA with alpha=0.15 for smooth tracking
- **RTT calculation:** `clientReceiveMs - pong.cSend`
- **Server time offset:** `(sRecv + sSend) / 2 - (cSend + cRecv) / 2`
- **Jitter:** Deviation from EWMA RTT

**Constants:**
- `EWMA_ALPHA = 0.15` — Smoothing factor (higher = more responsive, lower = more stable)
- `WARMUP_SAMPLE_COUNT = 5` — Samples needed before `isReady = true`
- `INITIAL_RTT_MS = 100` — Initial guess before any samples
- `INITIAL_JITTER_MS = 20` — Initial guess for jitter

### InputDelayController

Calculates adaptive input delay (in ticks) based on network conditions. Uses hysteresis to prevent oscillation.

```typescript
class InputDelayController {
  constructor(minTicks?: number, maxTicks?: number, initial?: number);
  // Defaults: minTicks=1, maxTicks=8, initial=2

  get deltaTicks(): number; // Current input delay in ticks

  recompute(
    tickMs: number,
    rttEwmaMs: number,
    jitterEwmaMs: number,
    k?: number,       // Jitter multiplier (default: 1.8)
    safetyMs?: number // Safety margin (default: 10ms)
  ): number;          // Returns new deltaTicks
}
```

**Formula:**
```
deltaTicks = ceil((RTT_EWMA/2 + k*JITTER_EWMA + SAFETY_ms) / TICK_ms) + 1
```

**Hysteresis:**
- **Increase:** Immediate (if formula suggests higher delay)
- **Decrease:** Gradual (decrease by 1 tick per recompute call)

**Why hysteresis?** Prevents rapid oscillation when network conditions fluctuate.

### TickInputBuffer

Stores tick-indexed input data for late joiner synchronization. Automatically prunes old entries.

```typescript
class TickInputBuffer {
  constructor(maxRetentionTicks?: number); // Default: 600 (~10s at 60 FPS)

  get oldestTick(): number;                // Oldest stored tick
  get size(): number;                      // Number of ticks with data

  add(tick: number, data: Uint8Array): void; // Add input data for tick
  getFromTick(fromTick: number): ReadonlyMap<number, ReadonlyArray<Uint8Array>>; // Get inputs from tick onwards
  getFlattenedFromTick(fromTick: number): Uint8Array[]; // Get flattened array of inputs
  prune(currentTick: number): number;      // Remove entries older than retention window, returns pruned count
  clear(): void;                           // Clear all data
}
```

**Use case:** When a late joiner connects at tick 1000, the server sends all inputs from tick 400 onwards (600-tick window). Client replays 400-1000 to catch up.

### RelayRoomOptions

Configuration interface for Colyseus relay rooms.

```typescript
interface ColyseusRelayRoomOptions {
  frameLength: number;  // Frame duration in ms (e.g., 16.666 for 60 FPS)
  maxPlayers: number;   // Max players in room
  gameId: string;       // Game identifier
}
```

## 4. Preconditions

- **`ClockSync.updateFromPong()` requires valid pong data** — Rejects RTT < 0 or RTT > 10000ms
- **`ClockSync.isReady` must be true before using timing data** — Until ready, RTT/jitter estimates are unreliable
- **`InputDelayController.recompute()` should be called after ClockSync updates** — Uses RTT/jitter for calculation
- **`TickInputBuffer.prune()` should be called periodically** — Prevents unbounded memory growth

## 5. Postconditions

- After `ClockSync.updateFromPong()` processes warmup samples, `isReady = true`
- After `InputDelayController.recompute()`, `deltaTicks` is clamped to [minTicks, maxTicks]
- After `TickInputBuffer.add()`, data is retrievable via `getFromTick()`

## 6. Invariants & Constraints

- **Protocol version:** All messages use `WireVersion.V1 = 1`
- **Message header:** All messages start with `HeaderStruct` (2 bytes: version + type)
- **Little-endian byte order:** All multi-byte fields use little-endian (enforced by BinarySchema)
- **Input delay bounds:** `InputDelayController` clamps deltaTicks to [minTicks, maxTicks]
- **ClockSync EWMA:** Uses alpha=0.15 for RTT and jitter tracking
- **TickInputBuffer retention:** Stores up to `maxRetentionTicks` (default 600) ticks

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT use `ClockSync` data before `isReady = true`** — Initial estimates are unreliable (hardcoded guesses)
- **DO NOT recompute input delay on every frame** — Call `InputDelayController.recompute()` only after ClockSync updates (typically on pong)
- **DO NOT modify protocol structs without versioning** — Breaking changes require incrementing `WireVersion`
- **DO NOT forget to prune `TickInputBuffer`** — Without pruning, buffer grows unbounded (memory leak)
- **DO NOT assume server and client ticks are synchronized** — Use `serverTimeOffsetMs` to convert between server time and local time
- **DO NOT use `InputDelayController` with negative or zero tickMs** — Formula requires positive tick duration

### Common Mistakes

- Forgetting to check `isReady` before using ClockSync data → unreliable input delay calculation
- Not calling `TickInputBuffer.prune()` → server memory leak on long-running rooms
- Using ClockSync RTT without multiplying jitter by k (default 1.8) → input delay too low, frequent rollbacks
- Implementing custom input delay formula instead of using `InputDelayController` → likely to oscillate or be too aggressive

## 8. Usage Examples

### ClockSync Usage

```typescript
import { ClockSync, PingStruct, PongStruct } from '@lagless/net-wire';
import { now } from '@lagless/misc';

const clockSync = new ClockSync(5); // 5-sample warmup

// Send ping
const pingData = PingStruct.pack({ cSend: now() });
websocket.send(pingData);

// On pong received
websocket.on('message', (data) => {
  const header = HeaderStruct.unpack(data);
  if (header.type === MsgType.Pong) {
    const pong = PongStruct.unpack(data, HeaderStruct.byteLength);
    const becameReady = clockSync.updateFromPong(now(), pong);

    if (becameReady) {
      console.log('ClockSync ready!');
      console.log(`RTT: ${clockSync.rttEwmaMs}ms`);
      console.log(`Jitter: ${clockSync.jitterEwmaMs}ms`);
      console.log(`Server offset: ${clockSync.serverTimeOffsetMs}ms`);
    }
  }
});
```

### InputDelayController with ClockSync

```typescript
import { InputDelayController, ClockSync } from '@lagless/net-wire';

const clockSync = new ClockSync();
const inputDelay = new InputDelayController(1, 8, 2); // Min 1, max 8, initial 2 ticks

// On pong received (after ClockSync update)
clockSync.updateFromPong(now(), pong);

if (clockSync.isReady) {
  const tickMs = 16.666; // 60 FPS
  const newDelay = inputDelay.recompute(
    tickMs,
    clockSync.rttEwmaMs,
    clockSync.jitterEwmaMs,
    1.8,  // k (jitter multiplier)
    10    // safety margin (ms)
  );

  console.log(`Input delay: ${newDelay} ticks`);
}
```

### Sending TickInput

```typescript
import { HeaderStruct, TickInputStruct, MsgType, WireVersion, TickInputKind } from '@lagless/net-wire';

// Pack input for tick 100
const header = HeaderStruct.pack({ version: WireVersion.V1, type: MsgType.TickInput });
const tickInput = TickInputStruct.pack({
  tick: 100,
  playerSlot: 0,
  kind: TickInputKind.Client,
  seq: sequenceNumber++,
});

// Append game-specific input payload (e.g., Move, LookAt)
const inputPayload = packMyGameInput({ dx: 0.5, dy: 0.3 });

// Concatenate header + tickInput + payload
const message = new Uint8Array(header.byteLength + tickInput.byteLength + inputPayload.byteLength);
message.set(header, 0);
message.set(tickInput, header.byteLength);
message.set(inputPayload, header.byteLength + tickInput.byteLength);

websocket.send(message);
```

### TickInputBuffer for Late Joiners

```typescript
import { TickInputBuffer } from '@lagless/net-wire';

// Server side: buffer inputs for late joiners
const buffer = new TickInputBuffer(600); // Keep 600 ticks (~10s at 60 FPS)

// On input received
function onTickInput(tick: number, data: Uint8Array) {
  buffer.add(tick, data);

  // Prune old data every 60 ticks (~1s)
  if (tick % 60 === 0) {
    const pruned = buffer.prune(tick);
    console.log(`Pruned ${pruned} old ticks`);
  }
}

// When late joiner connects at tick 1000
function onLateJoinerConnect(joinTick: number) {
  const catchupData = buffer.getFlattenedFromTick(buffer.oldestTick);
  sendToClient(catchupData);
}
```

### Parsing TickInputFanout

```typescript
import { HeaderStruct, TickInputFanoutStruct, TickInputStruct, MsgType } from '@lagless/net-wire';

// On fanout message received
websocket.on('message', (data) => {
  const header = HeaderStruct.unpack(data);

  if (header.type === MsgType.TickInputFanout) {
    let offset = HeaderStruct.byteLength;

    // Read fanout header
    const fanout = TickInputFanoutStruct.unpack(data, offset);
    offset += TickInputFanoutStruct.byteLength;

    console.log(`Server tick: ${fanout.serverTick}`);

    // Read all tick inputs in the fanout
    while (offset < data.byteLength) {
      const tickInput = TickInputStruct.unpack(data, offset);
      offset += TickInputStruct.byteLength;

      // Read game-specific input payload (variable length)
      const payload = unpackMyGameInput(data, offset);
      offset += payload.byteLength;

      processInput(tickInput.tick, tickInput.playerSlot, payload);
    }
  }
});
```

## 9. Testing Guidance

No tests currently exist for this library. When adding tests, consider:

**Framework suggestion:** Vitest (used by other Lagless libraries)

**Test coverage priorities:**
1. **Protocol packing/unpacking** — Verify all BinarySchema structs pack and unpack correctly
2. **ClockSync warmup** — Verify median calculation during warmup phase
3. **ClockSync EWMA** — Verify smooth tracking after warmup
4. **InputDelayController hysteresis** — Verify gradual decrease, immediate increase
5. **TickInputBuffer pruning** — Verify old entries are removed correctly

**Example test pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import { ClockSync } from '@lagless/net-wire';

describe('ClockSync', () => {
  it('should not be ready until warmup completes', () => {
    const sync = new ClockSync(3); // 3-sample warmup
    expect(sync.isReady).toBe(false);

    sync.updateFromPong(100, { cSend: 0, sRecv: 25, sSend: 26, sTick: 10 });
    expect(sync.isReady).toBe(false);

    sync.updateFromPong(200, { cSend: 100, sRecv: 125, sSend: 126, sTick: 20 });
    expect(sync.isReady).toBe(false);

    const becameReady = sync.updateFromPong(300, { cSend: 200, sRecv: 225, sSend: 226, sTick: 30 });
    expect(becameReady).toBe(true);
    expect(sync.isReady).toBe(true);
  });
});
```

## 10. Change Checklist

When modifying this module:

1. **Increment `WireVersion` for breaking changes** — Clients and servers must use same version
2. **Update protocol docs** — Document all message formats in this README
3. **Test on high-latency network** — Simulate 200ms+ RTT to verify ClockSync/InputDelayController behavior
4. **Profile memory usage** — Ensure `TickInputBuffer` pruning prevents leaks
5. **Update this README:** Document new APIs in Public API section
6. **Preserve binary layout** — BinarySchema field order must remain stable (breaking change)
7. **Test EWMA stability** — Verify ClockSync doesn't oscillate with noisy samples

## 11. Integration Notes

### Used By

- **Game clients:**
  - Use `ClockSync` to estimate RTT, jitter, server time offset
  - Use `InputDelayController` to calculate adaptive input delay
  - Use protocol structs to pack/unpack network messages

- **Relay servers:**
  - Use protocol structs to parse incoming messages and pack responses
  - Use `TickInputBuffer` to store inputs for late joiners

### Common Integration Patterns

**Client-side network stack:**
```typescript
import { ClockSync, InputDelayController, HeaderStruct, MsgType } from '@lagless/net-wire';
import { SimulationClock } from '@lagless/misc';

class NetworkClient {
  private clockSync = new ClockSync();
  private inputDelay = new InputDelayController();
  private simClock: SimulationClock;

  constructor(simClock: SimulationClock) {
    this.simClock = simClock;
  }

  // Send ping every second
  startPingLoop() {
    setInterval(() => {
      const ping = PingStruct.pack({ cSend: now() });
      this.sendMessage(MsgType.Ping, ping);
    }, 1000);
  }

  // On pong received
  onPong(pong: InferBinarySchemaValues<typeof PongStruct>) {
    const becameReady = this.clockSync.updateFromPong(now(), pong);

    if (becameReady) {
      this.simClock.phaseNudger.activate();
    }

    if (this.clockSync.isReady) {
      this.inputDelay.recompute(
        16.666,
        this.clockSync.rttEwmaMs,
        this.clockSync.jitterEwmaMs
      );
    }
  }

  // Send input with delay
  sendInput(localTick: number, inputData: Uint8Array) {
    const delayedTick = localTick + this.inputDelay.deltaTicks;
    const tickInput = TickInputStruct.pack({
      tick: delayedTick,
      playerSlot: this.playerSlot,
      kind: TickInputKind.Client,
      seq: this.nextSeq++,
    });
    this.sendMessage(MsgType.TickInput, concat(tickInput, inputData));
  }
}
```

**Server-side relay:**
```typescript
import { TickInputBuffer, HeaderStruct, TickInputStruct } from '@lagless/net-wire';

class RelayRoom {
  private inputBuffer = new TickInputBuffer(600);
  private currentTick = 0;

  onClientInput(client: Client, data: Uint8Array) {
    const header = HeaderStruct.unpack(data);

    if (header.type === MsgType.TickInput) {
      const tickInput = TickInputStruct.unpack(data, HeaderStruct.byteLength);

      // Store for late joiners
      this.inputBuffer.add(tickInput.tick, data);

      // Broadcast to all clients
      this.broadcast(data, { except: client });
    }
  }

  onTick() {
    this.currentTick++;

    // Prune old inputs every 60 ticks
    if (this.currentTick % 60 === 0) {
      this.inputBuffer.prune(this.currentTick);
    }
  }

  onLateJoinerConnect(client: Client) {
    // Send all buffered inputs
    const inputs = this.inputBuffer.getFlattenedFromTick(this.inputBuffer.oldestTick);
    client.send(inputs);
  }
}
```

## 12. Appendix

### Message Format Table

| Message | Size (bytes) | Direction | Purpose |
|---------|--------------|-----------|---------|
| ServerHello | 2 + 17 = 19 | Server → Client | Initial connection: seed + player slot |
| TickInput | 2 + 10 + payload | Client → Server | Player input for tick |
| TickInputFanout | 2 + 4 + inputs | Server → Client | Broadcast inputs + server tick |
| CancelInput | 2 + 9 = 11 | Server → Client | Cancel input due to disconnect |
| Ping | 2 + 4 = 6 | Client → Server | RTT measurement request |
| Pong | 2 + 16 = 18 | Server → Client | RTT measurement response |
| PlayerFinishedGame | 2 + 17 = 19 | Server → Client | Game result |

**Header:** 2 bytes (version:Uint8 + type:Uint8)

### ClockSync Algorithm

**Warmup phase (first `warmupSampleCount` samples):**
1. Collect samples: `{rtt, serverTimeOffset}`
2. After collecting all samples → Calculate median RTT and median offset
3. Set `rttEwmaMs = medianRTT`, `serverTimeOffsetMs = medianOffset`
4. Set `isReady = true`

**After warmup (EWMA tracking):**
1. Calculate RTT: `clientReceiveMs - pong.cSend`
2. Update RTT EWMA: `rttEwma = alpha * rtt + (1 - alpha) * rttEwma`
3. Calculate jitter: `abs(rtt - rttEwma)`
4. Update jitter EWMA: `jitterEwma = alpha * jitter + (1 - alpha) * jitterEwma`
5. Calculate server time offset: `(sRecv + sSend) / 2 - (cSend + cRecv) / 2`
6. Update offset EWMA: `offsetEwma = alpha * offset + (1 - alpha) * offsetEwma`

**Why median for warmup?** Initial samples may include connection setup overhead. Median is robust to outliers.

**Why EWMA after warmup?** Smooth tracking of changing network conditions without being too sensitive to individual samples.

### InputDelayController Formula Breakdown

```
deltaTicks = ceil((RTT_EWMA/2 + k*JITTER_EWMA + SAFETY_ms) / TICK_ms) + 1
```

**Components:**
- `RTT_EWMA/2` — Half-RTT (one-way latency estimate)
- `k*JITTER_EWMA` — Jitter buffer (k=1.8 covers ~90% of jitter spikes)
- `SAFETY_ms` — Fixed safety margin (default 10ms)
- `/ TICK_ms` — Convert ms to ticks
- `ceil(...)` — Round up to next tick
- `+ 1` — Extra tick for processing/scheduling margin

**Example:**
- RTT = 100ms → Half-RTT = 50ms
- Jitter = 10ms → Jitter buffer = 18ms
- Safety = 10ms
- Need = 50 + 18 + 10 = 78ms
- Ticks = ceil(78 / 16.666) + 1 = 5 + 1 = 6 ticks

**Hysteresis prevents oscillation:**
- If formula suggests 7 ticks → immediately jump to 7
- If formula suggests 5 ticks → decrease by 1 per recompute call (7 → 6 → 5)

### Byte Layout Examples

**ServerHello message:**
```
Offset | Size | Field
-------|------|-------
0      | 1    | version (1)
1      | 1    | type (MsgType.ServerHello = 0)
2      | 8    | seed0 (Float64)
10     | 8    | seed1 (Float64)
18     | 1    | playerSlot (Uint8)
-------|------|-------
Total: 19 bytes
```

**TickInput message (with 8-byte payload):**
```
Offset | Size | Field
-------|------|-------
0      | 1    | version (1)
1      | 1    | type (MsgType.TickInput = 1)
2      | 4    | tick (Uint32)
6      | 1    | playerSlot (Uint8)
7      | 1    | kind (Uint8)
8      | 4    | seq (Uint32)
12     | N    | payload (game-specific input data)
-------|------|-------
Total: 12 + N bytes
```

**TickInputFanout message (with 2 TickInputs):**
```
Offset | Size | Field
-------|------|-------
0      | 1    | version (1)
1      | 1    | type (MsgType.TickInputFanout = 2)
2      | 4    | serverTick (Uint32)
6      | M    | TickInput #1 (TickInputStruct + payload)
6+M    | N    | TickInput #2 (TickInputStruct + payload)
-------|------|-------
Total: 6 + M + N bytes
```
