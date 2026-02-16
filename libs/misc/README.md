# @lagless/misc

## 1. Responsibility & Context

Provides utility classes and functions used across the Lagless ECS framework: time management (`SimulationClock`, `PhaseNudger`), snapshot storage for rollback (`SnapshotHistory`), circular buffers (`RingBuffer`), UUID generation with bot detection (`UUID`), and Transform2d interpolation helpers. This library sits between low-level primitives and the core ECS engine, providing common abstractions needed by networking, rendering, and simulation layers.

## 2. Architecture Role

**Utility layer** — sits above `@lagless/math` (peer dependency) and provides utilities used by `@lagless/core` and `@lagless/net-wire`.

**Downstream consumers:**
- `@lagless/core` — Uses `SimulationClock` for tick loop timing, `SnapshotHistory` for rollback storage, `RingBuffer` for input buffering
- `@lagless/net-wire` — Uses `RingBuffer` for network packet buffering
- `circle-sumo-simulation` — Uses `UUID` for player identification, `interpolateTransform2d` for smooth rendering between ticks

**Upstream dependencies:**
- `@lagless/math` (peer dependency) — Used by `transform2d-utils` for angle interpolation

## 3. Public API

### now()

```typescript
export const now: () => number
```

Cross-platform `performance.now()` wrapper. Returns high-resolution timestamp in milliseconds. Works in browsers (via `globalThis.performance.now`) and Node.js (via `node:perf_hooks`).

### UUID

UUID v4 generation and validation with "masked UUID" support for bot detection.

**Standard UUID generation:**
- `UUID.generate(): UUID` — Generate standard RFC 4122 v4 UUID (122 bits entropy)

**Masked UUID (bot detection):**
- `UUID.generateMasked(): UUID` — Generate UUID where last 4 bytes are FNV-1a hash of first 12 bytes (90 bits entropy). Used to mark bot players.
- `UUID.isMaskedUint8(bytes: Uint8Array): boolean` — Check if 16-byte array is a masked UUID (validates hash)
- `UUID.isMaskedString(uuidStr: string): boolean` — Check if UUID string is masked. Returns false for invalid strings.

**Conversion:**
- `UUID.fromString(uuidStr: string): UUID` — Parse canonical UUID string (e.g., "550e8400-e29b-41d4-a716-446655440000")
- `UUID.fromUint8(uuidUint8: Uint8Array): UUID` — Create UUID from 16-byte array
- `uuid.asString(): string` — Convert to canonical string format (cached after first call)
- `uuid.asUint8(): Uint8Array` — Convert to 16-byte array (creates new copy)

### RingBuffer<T>

Fixed-size circular buffer with FIFO semantics. Overwrites oldest elements when full.

```typescript
class RingBuffer<T> {
  constructor(size: number);
  add(item: T): number;           // Add item, returns index, wraps around when full
  get(atIdx: number): T | undefined; // Get item at index
  clear(): void;                  // Reset buffer
  [Symbol.iterator](): Iterator<T>; // Iterate over all added items
}
```

### SnapshotHistory<T>

Stores snapshots indexed by tick for rollback netcode. Maintains snapshots in tick order with efficient binary search for nearest-past-snapshot retrieval.

```typescript
class SnapshotHistory<T> {
  constructor(maxSize: number);
  set(tick: number, snapshot: T): void;  // Store snapshot at tick (must be non-decreasing)
  getNearest(tick: number): T;           // Get snapshot with greatest tick < requested tick (binary search)
  rollback(tick: number): void;          // Remove all snapshots with tick >= given tick
}
```

**Key behavior:**
- Ticks must be non-decreasing (monotonic). Call `rollback()` before writing older ticks.
- Overwrites snapshot if same tick is set twice (useful for repeated rollback-replay)
- `getNearest()` throws if no snapshot exists with tick < requested tick
- Uses ring buffer internally for O(1) insertion when full

### SimulationClock

Manages game time accumulation with `PhaseNudger` integration for server-side clock sync.

```typescript
class SimulationClock {
  constructor(frameLength: number, maxNudgePerFrame: number);

  readonly phaseNudger: PhaseNudger;  // Time debt manager for server sync

  get startedTime(): number;          // Timestamp when start() was called (from now())
  get accumulatedTime(): number;      // Total accumulated time in milliseconds

  start(): void;                      // Start the clock (must be called before getElapsedTime())
  getElapsedTime(): number;           // Real time since start() in milliseconds
  update(dt: number): void;           // Accumulate time delta + phase nudge adjustments
}
```

**Typical usage:**
```typescript
const clock = new SimulationClock(16.666, 2); // 60 FPS, max 2ms nudge per frame
clock.start();

// In game loop:
const dt = getDeltaTime();
clock.update(dt); // Adds dt + phaseNudger.drain()
```

### PhaseNudger

Gradually adjusts simulation time to synchronize with server tick hints. Prevents abrupt jumps by draining "time debt" incrementally.

```typescript
class PhaseNudger {
  constructor(frameLength: number, maxNudgePerFrame: number);

  get isActive(): boolean;           // True after activate() is called
  get currentDebtMs(): number;       // Current phase debt in milliseconds

  activate(): void;                  // Enable phase nudging (call when ClockSync is ready)
  onServerTickHint(serverTick: number, localTick: number): void; // Accumulate time debt based on tick difference
  drain(): number;                   // Drain small portion of debt per frame, returns ms to add to time
  reset(): void;                     // Reset debt to zero (use for hard sync)
}
```

**How it works:**
- Server sends tick hints → `onServerTickHint()` calculates tick difference → accumulates debt with 0.3 weight
- Every frame, `drain()` returns small correction (limited by `maxNudgePerFrame`)
- Large debt (≥50ms) drains faster (50% per frame, capped at `frameLength`)
- Small debt drains gradually for smoothness

### Transform2d Interpolation Helpers

Functions for interpolating Transform2d component values between ticks for smooth rendering.

```typescript
interface Transform2dCursorLike {
  positionX: number; positionY: number; rotation: number;
  prevPositionX: number; prevPositionY: number; prevRotation: number;
}

// Interpolate transform between prev and current state
export function interpolateTransform2d(
  prevPositionX: number, prevPositionY: number,
  positionX: number, positionY: number,
  prevRotation: number, rotation: number,
  interpolationFactor: number,
): { readonly x: number; readonly y: number; readonly rotation: number };

// Zero-allocation variant (writes to ref)
export function interpolateTransform2dToRef(
  prevPositionX: number, prevPositionY: number,
  positionX: number, positionY: number,
  prevRotation: number, rotation: number,
  interpolationFactor: number,
  ref: { x: number; y: number; rotation: number },
  teleportThresholdSquared?: number, // Default: 300
): void;

// Cursor-based convenience wrappers
export function interpolateTransform2dCursor(
  cursor: Transform2dCursorLike,
  interpolationFactor: number,
): { readonly x: number; readonly y: number; readonly rotation: number };

export function interpolateTransform2dCursorToRef(
  cursor: Transform2dCursorLike,
  interpolationFactor: number,
  ref: { x: number; y: number; rotation: number },
): void;
```

**Key behavior:**
- Uses `MathOps.lerpAngle()` for rotation (shortest path)
- Detects teleportation: if distance² ≥ threshold², skip interpolation (snap to target)
- Y coordinate is negated (game coordinate system convention)
- Non-`ToRef` variants return a shared buffer (not thread-safe, reused on next call)

## 4. Preconditions

- **`SimulationClock.start()` must be called before `getElapsedTime()`** — Throws error if called before start
- **`SnapshotHistory.set()` requires non-decreasing ticks** — Call `rollback()` before writing older ticks
- **`PhaseNudger.activate()` should be called when ClockSync is ready** — Nudging is disabled until activated
- **`UUID.fromString()` requires valid canonical UUID format** — Throws `TypeError` for invalid strings

## 5. Postconditions

- `SimulationClock.update(dt)` advances `accumulatedTime` by `dt + phaseNudger.drain()`
- `SnapshotHistory.getNearest(tick)` returns the snapshot with the greatest tick < requested tick
- `UUID.generateMasked()` produces UUIDs that pass `isMaskedUint8()` validation
- `interpolateTransform2d*()` functions produce smooth interpolation for rendering between ticks

## 6. Invariants & Constraints

- **SnapshotHistory monotonicity:** Ticks must be non-decreasing. Violating this throws an error.
- **RingBuffer wraps around:** When full, oldest elements are overwritten (FIFO)
- **PhaseNudger debt accumulation:** Uses weighted average (0.3) to prevent oscillation from noisy server hints
- **UUID masked format:** Last 4 bytes = FNV-1a hash of first 12 bytes (after RFC 4122 version/variant bits set)
- **Transform2d interpolation coordinate system:** Y is negated, rotation is negated (matches Pixi.js convention)

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT call `SimulationClock.getElapsedTime()` before `start()`** — This throws an error
- **DO NOT write older ticks to `SnapshotHistory` without calling `rollback()` first** — This throws an error
- **DO NOT rely on `interpolateTransform2d()` return value persistence** — It returns a shared buffer that is reused on the next call. Use `...ToRef()` variant for persistent results.
- **DO NOT use `PhaseNudger` directly inside ECS systems** — It's managed by `SimulationClock`, which calls `drain()` automatically
- **DO NOT assume masked UUIDs are cryptographically secure** — They have 90 bits entropy (vs 122 in standard v4) and are detectable by hash validation
- **DO NOT mutate `RingBuffer` during iteration** — Iterator behavior is undefined if buffer is modified during iteration

### Common Mistakes

- Forgetting to call `clock.start()` before using `getElapsedTime()` → throws error
- Writing ticks out of order to `SnapshotHistory` without rollback → throws error
- Storing `interpolateTransform2d()` result → next call overwrites it (use `...ToRef()` instead)
- Using `UUID.isMaskedString()` to validate UUID format → it returns false for invalid UUIDs (not an error)

## 8. Usage Examples

### SimulationClock with PhaseNudger

```typescript
import { SimulationClock } from '@lagless/misc';

const FRAME_LENGTH = 16.666; // 60 FPS
const MAX_NUDGE_PER_FRAME = 2; // Max 2ms correction per frame

const clock = new SimulationClock(FRAME_LENGTH, MAX_NUDGE_PER_FRAME);
clock.start();

// When ClockSync is ready
clock.phaseNudger.activate();

// On server tick hint (from network)
clock.phaseNudger.onServerTickHint(serverTick, localTick);

// In game loop
function gameLoop(dt: number) {
  clock.update(dt); // Advances accumulatedTime with phase correction

  const ticks = Math.floor(clock.accumulatedTime / FRAME_LENGTH);
  for (let i = 0; i < ticks; i++) {
    runSimulationTick();
  }
}
```

### SnapshotHistory for Rollback

```typescript
import { SnapshotHistory } from '@lagless/misc';

const history = new SnapshotHistory<ArrayBuffer>(100); // Store up to 100 snapshots

// Store snapshots after each tick
function saveTick(tick: number, worldState: ArrayBuffer) {
  history.set(tick, worldState.slice(0)); // Clone ArrayBuffer
}

// Rollback to tick
function rollbackTo(tick: number) {
  const snapshot = history.getNearest(tick); // Get snapshot with tick < target
  restoreWorldState(snapshot);
  history.rollback(tick); // Remove snapshots >= tick
}

// Now you can write new snapshots starting from tick
saveTick(tick, newWorldState);
```

### UUID with Masked Bot Detection

```typescript
import { UUID } from '@lagless/misc';

// Human player
const playerUuid = UUID.generate();
console.log(playerUuid.asString()); // "550e8400-e29b-41d4-a716-446655440000"
console.log(UUID.isMaskedString(playerUuid.asString())); // false

// Bot player
const botUuid = UUID.generateMasked();
console.log(botUuid.asString()); // "7c9e6679-7425-40de-944b-e07fc1f90ae7"
console.log(UUID.isMaskedString(botUuid.asString())); // true

// Check at runtime
function handlePlayer(uuid: UUID) {
  if (UUID.isMaskedUint8(uuid.asUint8())) {
    console.log('Bot detected');
  }
}
```

### RingBuffer

```typescript
import { RingBuffer } from '@lagless/misc';

const buffer = new RingBuffer<number>(3);

buffer.add(1); // idx 0
buffer.add(2); // idx 1
buffer.add(3); // idx 2
buffer.add(4); // idx 0 (overwrites 1)

console.log(buffer.get(0)); // 4
console.log(buffer.get(1)); // 2
console.log(buffer.get(2)); // 3

// Iterate (visits all added items, including overwritten slots)
for (const item of buffer) {
  console.log(item); // 4, 2, 3
}
```

### Transform2d Interpolation (Rendering)

```typescript
import { interpolateTransform2dCursorToRef } from '@lagless/misc';

// In rendering loop (between simulation ticks)
function render(interpolationFactor: number) {
  const result = { x: 0, y: 0, rotation: 0 };

  for (const entityId of entities) {
    const transform = getTransform2dComponent(entityId);

    // Interpolate between prev and current transform
    interpolateTransform2dCursorToRef(transform, interpolationFactor, result);

    // Use result for rendering
    sprite.x = result.x;
    sprite.y = result.y;
    sprite.rotation = result.rotation;
  }
}
```

## 9. Testing Guidance

No tests currently exist for this library. When adding tests, consider:

**Framework suggestion:** Vitest (used by other Lagless libraries)

**Test coverage priorities:**
1. `SnapshotHistory` — Binary search correctness, rollback behavior, edge cases (empty, single element)
2. `PhaseNudger` — Debt accumulation, drain rate, large correction rejection
3. `UUID` — Masked UUID validation (hash correctness), string parsing edge cases
4. `RingBuffer` — Wrap-around behavior, iteration during overwrites
5. `SimulationClock` — Time accumulation with phase nudge integration

**Example test pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import { SnapshotHistory } from '@lagless/misc';

describe('SnapshotHistory', () => {
  it('should retrieve nearest snapshot before target tick', () => {
    const history = new SnapshotHistory<string>(10);
    history.set(10, 'tick10');
    history.set(20, 'tick20');
    history.set(30, 'tick30');

    expect(history.getNearest(25)).toBe('tick20');
    expect(history.getNearest(31)).toBe('tick30');
  });

  it('should throw if no snapshot exists before target tick', () => {
    const history = new SnapshotHistory<string>(10);
    history.set(10, 'tick10');

    expect(() => history.getNearest(5)).toThrow();
  });
});
```

## 10. Change Checklist

When modifying this module:

1. **Verify rollback correctness:** Changes to `SnapshotHistory` must preserve binary search invariants
2. **Profile allocation:** `interpolateTransform2dToRef()` must remain zero-allocation
3. **Test PhaseNudger stability:** Ensure debt accumulation doesn't oscillate with noisy server hints
4. **Maintain UUID masked format:** FNV-1a hash of first 12 bytes must be embedded in last 4 bytes
5. **Update this README:** Document new APIs in Public API section
6. **Add tests:** Cover new functionality with unit tests
7. **Check cross-platform behavior:** `now()` must work in Node.js and all browsers

## 11. Integration Notes

### Used By

- **`@lagless/core`:**
  - `SimulationClock` — Drives tick loop timing in `ECSSimulation`
  - `SnapshotHistory` — Stores world state snapshots for rollback
  - `RingBuffer` — Buffers incoming RPC inputs

- **`@lagless/net-wire`:**
  - `RingBuffer` — Buffers network packets

- **`circle-sumo-simulation`:**
  - `UUID` — Identifies players, detects bots with `isMaskedUint8()`
  - `interpolateTransform2d*` — Smooths rendering between ticks in game view

### Common Integration Patterns

**Rollback Netcode Pattern:**
```typescript
import { SnapshotHistory, SimulationClock } from '@lagless/misc';

class ECSSimulation {
  private clock = new SimulationClock(16.666, 2);
  private snapshots = new SnapshotHistory<ArrayBuffer>(100);

  start() {
    this.clock.start();
  }

  update(dt: number) {
    this.clock.update(dt);

    const targetTick = Math.floor(this.clock.accumulatedTime / 16.666);
    while (this.currentTick < targetTick) {
      this.runTick();
      this.snapshots.set(this.currentTick, this.saveSnapshot());
      this.currentTick++;
    }
  }

  rollbackTo(tick: number) {
    const snapshot = this.snapshots.getNearest(tick);
    this.restoreSnapshot(snapshot);
    this.snapshots.rollback(tick);
  }
}
```

**Server Clock Sync:**
```typescript
import { SimulationClock } from '@lagless/misc';
import { ClockSync } from '@lagless/net-wire';

const clock = new SimulationClock(16.666, 2);
const clockSync = new ClockSync(...);

// When clock sync is ready
clockSync.on('ready', () => {
  clock.phaseNudger.activate();
});

// On every tick input from server
connection.on('tickInput', (msg) => {
  const serverTick = msg.tick;
  const localTick = Math.floor(clock.accumulatedTime / 16.666);
  clock.phaseNudger.onServerTickHint(serverTick, localTick);
});
```

## 12. Appendix

### UUID Masked Format Details

A **masked UUID** embeds a checksum in the last 4 bytes, allowing bot detection without a database lookup.

**Structure:**
```
Byte 0-5:   Random data
Byte 6-7:   Version/variant bits (RFC 4122 v4)
Byte 8-11:  Random data
Byte 12-15: FNV-1a hash of bytes 0-11
```

**FNV-1a Hash (32-bit):**
```
hash = 0x811c9dc5 (offset basis)
for each byte:
  hash ^= byte
  hash *= 0x01000193 (FNV prime)
```

**Entropy:** 90 bits (vs 122 in standard v4 UUID)

**False positive rate:** 1 in ~4.3 billion (2^32)

**Why this works:**
- Standard UUIDs are random → hash of first 12 bytes doesn't match last 4 bytes
- Masked UUIDs are generated with embedded hash → validation passes
- No server roundtrip needed to identify bots

### SnapshotHistory Ring Buffer Implementation

Internally uses two arrays (`_ticks` and `_snapshots`) as a ring buffer:
- `_head` — Physical index of oldest element
- `_count` — Number of stored elements
- `indexAt(logicalIndex)` — Maps logical index [0, count) to physical index [0, maxSize)

**Binary search** for `getNearest()`:
- Searches logical indices [0, count)
- Finds greatest tick < target using standard binary search
- O(log n) complexity

**Rollback** uses binary search to find first tick ≥ target, then truncates count.

### PhaseNudger Tuning Parameters

**`LARGE_DEBT_THRESHOLD_MS = 50`** — Debt above this drains faster (50% per frame vs gradual)

**`MAX_SINGLE_CORRECTION_MS = 5000`** — Reject server hints with corrections > 5s (likely bad data)

**`weight = 0.3`** — Weighted accumulation: `debt = debt * 0.7 + correction * 0.3`. Prevents oscillation from noisy hints.

**Recommended `maxNudgePerFrame`:**
- 1-2ms for 60 FPS (imperceptible to players)
- Higher values = faster convergence but more visible speed changes

### Transform2d Interpolation Coordinate System

**Pixi.js convention (Circle Sumo uses this):**
- Y-axis points down → Y is negated during interpolation
- Rotation is counter-clockwise → Rotation is negated

**Teleport detection:**
- Calculates distance² between prev and current position
- If distance² ≥ threshold² (default 300² = 90,000), skip interpolation (snap to target)
- Prevents interpolation artifacts when player teleports or respawns
