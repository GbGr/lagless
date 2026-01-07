# @lagless/misc

Utility classes for the Lagless framework. Provides ring buffers, snapshot history, simulation clock, and other helpers.

## Installation

```bash
pnpm add @lagless/misc @lagless/math
```

## Overview

This module provides supporting utilities:

- **RingBuffer**: Fixed-size circular buffer
- **SnapshotHistory**: Tick-indexed snapshot storage
- **SimulationClock**: Time accumulation with nudging
- **PhaseNudger**: Gradual time correction
- **UUID**: UUID generation and utilities
- **Transform2dUtils**: 2D transform helpers

## RingBuffer

A fixed-size circular buffer:

```typescript
import { RingBuffer } from '@lagless/misc';

const buffer = new RingBuffer<string>(5);

// Add items
buffer.push('a');
buffer.push('b');
buffer.push('c');

// Get most recent
const last = buffer.get(0);   // 'c'
const prev = buffer.get(1);   // 'b'
const oldest = buffer.get(2); // 'a'

// Iterate (newest to oldest)
for (const item of buffer) {
  console.log(item);
}

// Properties
buffer.length;   // Current count
buffer.capacity; // Maximum size

// Clear
buffer.clear();
```

When capacity is reached, oldest items are overwritten:

```typescript
const buf = new RingBuffer<number>(3);
buf.push(1); buf.push(2); buf.push(3);
buf.push(4); // Overwrites 1

buf.get(0); // 4
buf.get(1); // 3
buf.get(2); // 2
```

## SnapshotHistory

Stores snapshots indexed by tick:

```typescript
import { SnapshotHistory } from '@lagless/misc';

const history = new SnapshotHistory<ArrayBuffer>(100);

// Store snapshot at tick
history.set(tick, snapshot);

// Get exact snapshot
const snap = history.get(tick);

// Get nearest snapshot at or before tick
const nearest = history.getNearest(tick);

// Rollback - remove snapshots after tick
history.rollback(tick);

// Check bounds
const oldest = history.oldestTick;
const newest = history.newestTick;
```

## SimulationClock

Manages simulation time with smoothing:

```typescript
import { SimulationClock } from '@lagless/misc';

const clock = new SimulationClock(
  16.67,  // frameLength (ms per tick)
  4.17,   // maxNudgePerFrame (smoothing limit)
);

// Start the clock
clock.start();

// Update with delta time
clock.update(deltaMs);

// Get accumulated time
const time = clock.accumulatedTime;

// Apply nudge (for sync correction)
clock.nudge(adjustment);
```

## PhaseNudger

Gradually applies time corrections:

```typescript
import { PhaseNudger } from '@lagless/misc';

const nudger = new PhaseNudger(4.17); // maxNudgePerFrame

// Queue a correction
nudger.addOffset(50); // Need to catch up 50ms

// Each frame, get the amount to apply
const adjustment = nudger.consume();
// Returns up to maxNudgePerFrame
```

## UUID

UUID generation and utilities:

```typescript
import { UUID } from '@lagless/misc';

// Generate UUID string
const id = UUID.generate(); // "550e8400-e29b-41d4-a716-446655440000"

// Convert UUID to Uint8Array (16 bytes)
const bytes = UUID.toBytes(id);

// Convert bytes back to string
const str = UUID.fromBytes(bytes);

// Check if bytes represent a "masked" (bot/AI) ID
const isBot = UUID.isMaskedUint8(bytes);
```

## Transform2dUtils

Utilities for 2D transforms:

```typescript
import { Transform2dUtils } from '@lagless/misc';

// Interpolate between two transforms
const interpolated = Transform2dUtils.lerp(prev, curr, t);

// Get world position from local + parent
const world = Transform2dUtils.localToWorld(local, parent);
```

## now

High-resolution timestamp:

```typescript
import { now } from '@lagless/misc';

const timestamp = now(); // Milliseconds
```

## Usage in Lagless

These utilities are used internally by:

- **@lagless/core**: SnapshotHistory for rollback, SimulationClock for timing
- **@lagless/net-wire**: PhaseNudger for network sync
- **Games**: UUID for player IDs, RingBuffer for input history
