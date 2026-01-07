# AGENTS.md - @lagless/misc

AI coding guide for the misc utilities module.

## Module Purpose

Supporting utilities for:
- Circular data storage (RingBuffer)
- Snapshot management (SnapshotHistory)
- Simulation timing (SimulationClock, PhaseNudger)
- UUID handling
- Transform utilities

## Key Exports

```typescript
export class RingBuffer<T>;
export class SnapshotHistory<T>;
export class SimulationClock;
export class PhaseNudger;
export const UUID: {
  generate(): string;
  toBytes(uuid: string): Uint8Array;
  fromBytes(bytes: Uint8Array): string;
  isMaskedUint8(bytes: Uint8Array): boolean;
};
export const Transform2dUtils;
export function now(): number;
```

## RingBuffer<T>

Fixed-capacity circular buffer. Oldest items overwritten when full.

### API

```typescript
class RingBuffer<T> {
  constructor(capacity: number);

  push(item: T): void;
  get(index: number): T | undefined;  // 0 = newest
  clear(): void;

  readonly length: number;
  readonly capacity: number;

  [Symbol.iterator](): Iterator<T>;  // Newest to oldest
}
```

### Usage Pattern

```typescript
const history = new RingBuffer<InputFrame>(60); // 1 second at 60fps

// Each frame
history.push(currentInput);

// Check recent inputs
for (let i = 0; i < 10; i++) {
  const frame = history.get(i);
  if (frame) processFrame(frame);
}
```

## SnapshotHistory<T>

Tick-indexed storage for game state snapshots.

### API

```typescript
class SnapshotHistory<T> {
  constructor(maxSize: number);

  set(tick: number, snapshot: T): void;
  get(tick: number): T | undefined;
  getNearest(tick: number): T;  // Throws if empty
  rollback(tick: number): void;  // Remove ticks > tick

  readonly oldestTick: number;
  readonly newestTick: number;
}
```

### Usage in ECSSimulation

```typescript
// Store snapshot periodically
if (tick % snapshotRate === 0) {
  this._snapshotHistory.set(tick, mem.exportSnapshot());
}

// On rollback
const snapshot = this._snapshotHistory.getNearest(rollbackTick);
mem.applySnapshot(snapshot);
this._snapshotHistory.rollback(mem.tickManager.tick);
```

## SimulationClock

Manages accumulated time for fixed timestep simulation.

### API

```typescript
class SimulationClock {
  constructor(frameLength: number, maxNudgePerFrame: number);

  start(): void;
  update(dt: number): void;
  nudge(amount: number): void;

  readonly accumulatedTime: number;
}
```

### Usage

```typescript
const clock = new SimulationClock(16.67, 4.17);
clock.start();

function gameLoop(timestamp: number) {
  const dt = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  clock.update(dt);

  const targetTick = Math.floor(clock.accumulatedTime / frameLength);
  // Simulate until caught up...

  requestAnimationFrame(gameLoop);
}
```

## PhaseNudger

Gradually applies time corrections without jarring jumps.

### API

```typescript
class PhaseNudger {
  constructor(maxNudgePerFrame: number);

  addOffset(offset: number): void;
  consume(): number;  // Returns amount to apply this frame
}
```

### Usage for Network Sync

```typescript
// Server says we're 30ms behind
nudger.addOffset(30);

// Each frame, apply gradual correction
function update(dt: number) {
  const adjustment = nudger.consume();
  clock.nudge(adjustment);
}
```

## UUID

UUID generation and byte conversion.

### API

```typescript
const UUID = {
  generate(): string;
  toBytes(uuid: string): Uint8Array;  // 16 bytes
  fromBytes(bytes: Uint8Array): string;
  isMaskedUint8(bytes: Uint8Array): boolean;  // Check for bot/masked ID
};
```

### Usage

```typescript
// Generate player ID
const playerId = UUID.generate();

// Store in PlayerResource (as uint8[16])
const bytes = UUID.toBytes(playerId);
for (let i = 0; i < 16; i++) {
  playerResource.unsafe.id[i] = bytes[i];
}

// Check if bot
const isBot = UUID.isMaskedUint8(bytes);
```

### Masked IDs (Bots)

Bot/AI players use "masked" UUIDs where all bytes match a pattern:

```typescript
// Generate masked ID for bot
const botId = new Uint8Array(16).fill(0xFF);  // All 255s
UUID.isMaskedUint8(botId);  // true
```

## Common Patterns

### Input History

```typescript
const inputHistory = new RingBuffer<PlayerInput>(120);

// Store
inputHistory.push({ tick, direction, speed });

// Replay
for (const input of inputHistory) {
  replay(input);
}
```

### Snapshot Management

```typescript
// In simulation
const history = new SnapshotHistory<ArrayBuffer>(100);

// Periodic storage
if (tick % config.snapshotRate === 0) {
  history.set(tick, mem.exportSnapshot());
}

// Rollback
try {
  const snap = history.getNearest(targetTick);
  mem.applySnapshot(snap);
} catch {
  // No snapshot available - use initial
  mem.applySnapshot(initialSnapshot);
}
```

### Time Smoothing

```typescript
// Detect desync
const serverTime = receivedPacket.serverTime;
const localTime = clock.accumulatedTime;
const diff = serverTime - localTime;

if (Math.abs(diff) > 50) {
  // Gradual correction
  nudger.addOffset(diff);
}
```

## File Structure

```
libs/misc/src/lib/
├── ring-buffer.ts
├── snapshot-history.ts
├── simulation-clock.ts
├── phase-nudger.ts
├── uuid.ts
├── transform2d-utils.ts
└── now.ts
```

## DO's and DON'Ts

### DO

- Use RingBuffer for bounded history
- Store snapshots at regular intervals
- Use PhaseNudger for smooth sync corrections
- Check `isMaskedUint8` to identify bots

### DON'T

- Store unlimited history (memory leak)
- Apply large time corrections instantly
- Assume UUID bytes are null-terminated strings
- Forget to handle empty SnapshotHistory (throws)
