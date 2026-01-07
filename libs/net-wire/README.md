# @lagless/net-wire

Network protocol and synchronization utilities for the Lagless framework. Provides binary message formats, clock synchronization, and input buffering for multiplayer games.

## Installation

```bash
pnpm add @lagless/net-wire @lagless/binary @lagless/core
```

## Overview

This module provides:

- **Protocol**: Binary message schemas for network communication
- **ClockSync**: Server-client time synchronization
- **InputDelayController**: Adaptive input delay based on network conditions
- **TickInputBuffer**: Buffer for network inputs
- **RelayRoomOptions**: Room configuration

## Status

This module is under development. The server-side implementation and full multiplayer support are planned for future releases.

## Protocol

Binary message schemas for efficient network communication:

### Message Types

```typescript
import { MsgType } from '@lagless/net-wire';

enum MsgType {
  ServerHello,       // Server sends initial state
  TickInput,         // Player input for a tick
  TickInputFanout,   // Server broadcasts inputs to all
  PlayerFinishedGame,// Player completed the game
  CancelInput,       // Cancel a previously sent input
  Ping,              // Latency measurement
  Pong,              // Latency response
}
```

### Message Structures

```typescript
import {
  HeaderStruct,
  ServerHelloStruct,
  TickInputStruct,
  PingStruct,
  PongStruct,
} from '@lagless/net-wire';

// All messages start with a header
const header = HeaderStruct.unpack(data);
// { version: 1, type: MsgType.TickInput }

// Server hello contains seed and player slot
const hello = ServerHelloStruct.unpack(data);
// { seed0, seed1, playerSlot }

// Tick input metadata
const input = TickInputStruct.unpack(data);
// { tick, playerSlot, kind, seq }

// Ping/Pong for latency
const ping = PingStruct.pack({ cSend: Date.now() });
const pong = PongStruct.unpack(data);
// { cSend, sRecv, sSend, sTick }
```

## ClockSync

Maintains network timing statistics:

```typescript
import { ClockSync } from '@lagless/net-wire';

const clockSync = new ClockSync();

// On pong received
const becameReady = clockSync.updateFromPong(Date.now(), pongData);

// Check if ready for use
if (clockSync.isReady) {
  // Get timing stats
  const rtt = clockSync.rttEwmaMs;
  const jitter = clockSync.jitterEwmaMs;
  const offset = clockSync.serverTimeOffsetMs;

  // Convert times
  const serverTime = clockSync.serverNowMs(Date.now());
  const clientTime = clockSync.clientNowMs(serverTime);
}
```

### Warmup Phase

ClockSync collects initial samples before providing reliable estimates:

```typescript
// During warmup
clockSync.isReady; // false

// After 5 samples (default)
clockSync.isReady; // true
clockSync.sampleCount; // 5+
```

## InputDelayController

Adapts input delay based on network conditions:

```typescript
import { InputDelayController } from '@lagless/net-wire';

const controller = new InputDelayController(
  2,  // initialDelay
  1,  // minDelay
  8,  // maxDelay
);

// Update with current RTT
const newDelay = controller.update(clockSync.rttEwmaMs, frameLength);

// Get current delay
const delay = controller.currentDelay;
```

## TickInputBuffer

Buffers inputs for network transmission:

```typescript
import { TickInputBuffer } from '@lagless/net-wire';

const buffer = new TickInputBuffer();

// Add input
buffer.add(tick, playerSlot, inputData);

// Get inputs for a tick
const inputs = buffer.get(tick);

// Clear old inputs
buffer.clearUpTo(tick);
```

## Wire Format

### Message Layout

```
┌────────────────────┐
│ Header (2 bytes)   │
├────────────────────┤
│ version (uint8)    │
│ type (uint8)       │
├────────────────────┤
│ Payload (variable) │
└────────────────────┘
```

### TickInput Payload

```
┌──────────────────────────────────────┐
│ TickInputStruct (10 bytes)           │
├──────────────────────────────────────┤
│ tick (uint32)                        │
│ playerSlot (uint8)                   │
│ kind (uint8) - Client/Server         │
│ seq (uint32)                         │
├──────────────────────────────────────┤
│ Input payload (from InputRegistry)   │
└──────────────────────────────────────┘
```

## Usage Example

```typescript
import {
  HeaderStruct,
  TickInputStruct,
  MsgType,
  WireVersion,
  ClockSync,
} from '@lagless/net-wire';
import { BinarySchemaPackPipeline, BinarySchemaUnpackPipeline } from '@lagless/binary';

// Packing a TickInput message
function packTickInput(tick: number, slot: number, inputPayload: ArrayBuffer): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();

  pipeline.pack(HeaderStruct, {
    version: WireVersion.V1,
    type: MsgType.TickInput,
  });

  pipeline.pack(TickInputStruct, {
    tick,
    playerSlot: slot,
    kind: TickInputKind.Client,
    seq: nextSeq++,
  });

  pipeline.appendBuffer(inputPayload);

  return pipeline.toUint8Array();
}

// Unpacking
function handleMessage(data: ArrayBuffer): void {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  const header = pipeline.unpack(HeaderStruct);

  switch (header.type) {
    case MsgType.TickInput: {
      const meta = pipeline.unpack(TickInputStruct);
      const payload = pipeline.sliceRemaining();
      // Process input...
      break;
    }
    case MsgType.Pong: {
      const pong = pipeline.unpack(PongStruct);
      clockSync.updateFromPong(Date.now(), pong);
      break;
    }
  }
}
```

## Integration

This module is used internally by the (planned) network input providers that extend `AbstractInputProvider` from `@lagless/core`.

The typical flow:
1. Client sends inputs as `TickInput` messages
2. Server validates and broadcasts via `TickInputFanout`
3. Clients apply authoritative inputs, rollback if needed
4. `ClockSync` maintains timing for proper tick scheduling
