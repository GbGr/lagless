# AGENTS.md - @lagless/net-wire

AI coding guide for the network protocol module.

## Module Purpose

Network communication primitives:
- Binary message schemas (protocol.ts)
- Clock synchronization (clock-sync.ts)
- Input delay adaptation (input-delay-controller.ts)
- Input buffering (tick-input-buffer.ts)

## Status

**Under Development** - Server-side and full multiplayer support planned.

## Key Exports

```typescript
// Protocol
export const RELAY_BYTES_CHANNEL: number;
export enum WireVersion { V1 = 1 }
export enum MsgType { ServerHello, TickInput, TickInputFanout, PlayerFinishedGame, CancelInput, Ping, Pong }
export enum TickInputKind { Client, Server }

// Binary schemas
export const HeaderStruct: BinarySchema;
export const ServerHelloStruct: BinarySchema;
export const TickInputStruct: BinarySchema;
export const TickInputFanoutStruct: BinarySchema;
export const CancelInputStruct: BinarySchema;
export const PingStruct: BinarySchema;
export const PongStruct: BinarySchema;
export const PlayerFinishedGameStruct: BinarySchema;

// Classes
export class ClockSync;
export class InputDelayController;
export class TickInputBuffer;
export interface RelayRoomOptions;
```

## Protocol Structures

### HeaderStruct (2 bytes)

```typescript
{
  version: uint8,  // WireVersion.V1
  type: uint8,     // MsgType enum
}
```

### ServerHelloStruct

```typescript
{
  seed0: float64,    // First half of 128-bit seed
  seed1: float64,    // Second half
  playerSlot: uint8, // Assigned player slot
}
```

### TickInputStruct

```typescript
{
  tick: uint32,       // Target simulation tick
  playerSlot: uint8,  // Player sending input
  kind: uint8,        // Client (0) or Server (1)
  seq: uint32,        // Sequence number
}
```

### PingStruct / PongStruct

```typescript
// Ping
{ cSend: float32 }  // Client send time

// Pong
{
  cSend: float32,  // Echo of client send time
  sRecv: float32,  // Server receive time
  sSend: float32,  // Server send time
  sTick: uint32,   // Server's current tick
}
```

## ClockSync

### State

```typescript
class ClockSync {
  rttEwmaMs: number;         // Smoothed RTT
  jitterEwmaMs: number;      // Smoothed jitter
  serverTimeOffsetMs: number; // Client time + offset = server time
  sampleCount: number;
  isReady: boolean;          // Has enough samples
}
```

### Usage Pattern

```typescript
const clockSync = new ClockSync(5); // 5 warmup samples

// Send ping periodically
function sendPing() {
  const ping = PingStruct.pack({ cSend: now() });
  send(MsgType.Ping, ping);
}

// On pong received
function onPong(data: ArrayBuffer) {
  const pong = PongStruct.unpack(data);
  const becameReady = clockSync.updateFromPong(now(), pong);

  if (becameReady) {
    console.log('Clock sync ready!');
  }
}

// Convert times
const serverTime = clockSync.serverNowMs(Date.now());
```

### EWMA Algorithm

- Uses Exponential Weighted Moving Average
- Alpha = 0.15 for smooth tracking
- Warmup phase uses median for robustness

## InputDelayController

Adapts input delay based on RTT:

```typescript
const controller = new InputDelayController(
  config.initialInputDelayTick,
  config.minInputDelayTick,
  config.maxInputDelayTick,
);

// Each frame
const delay = controller.update(clockSync.rttEwmaMs, frameLength);
// Returns ticks of delay to use
```

## Message Flow

### Client → Server

```
1. Client creates input
2. Pack: Header + TickInputStruct + InputPayload
3. Send via WebSocket/Colyseus
```

### Server → Clients (Fanout)

```
1. Server receives input
2. Validates and assigns authoritative tick
3. Pack: Header + TickInputFanoutStruct + [TickInputStruct + Payload]*
4. Broadcast to all clients
```

### Rollback Trigger

When client receives authoritative input for tick T:
- If T < currentTick: rollback needed
- Restore snapshot at or before T
- Re-simulate forward with authoritative inputs

## Implementation Pattern

### Sending Input

```typescript
import {
  HeaderStruct,
  TickInputStruct,
  MsgType,
  WireVersion,
  TickInputKind,
} from '@lagless/net-wire';
import { BinarySchemaPackPipeline } from '@lagless/binary';

function sendInput(tick: number, inputData: Uint8Array) {
  const pipeline = new BinarySchemaPackPipeline();

  pipeline.pack(HeaderStruct, {
    version: WireVersion.V1,
    type: MsgType.TickInput,
  });

  pipeline.pack(TickInputStruct, {
    tick,
    playerSlot: mySlot,
    kind: TickInputKind.Client,
    seq: nextSeq++,
  });

  pipeline.appendBuffer(inputData.buffer);

  websocket.send(pipeline.toUint8Array());
}
```

### Receiving Messages

```typescript
import { BinarySchemaUnpackPipeline } from '@lagless/binary';

function onMessage(data: ArrayBuffer) {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  const header = pipeline.unpack(HeaderStruct);

  switch (header.type) {
    case MsgType.ServerHello:
      handleServerHello(pipeline.unpack(ServerHelloStruct));
      break;

    case MsgType.TickInputFanout:
      handleFanout(pipeline);
      break;

    case MsgType.Pong:
      clockSync.updateFromPong(now(), pipeline.unpack(PongStruct));
      break;
  }
}
```

## File Structure

```
libs/net-wire/src/lib/
├── protocol.ts              # Message types and schemas
├── clock-sync.ts            # ClockSync class
├── input-delay-controller.ts # InputDelayController
├── tick-input-buffer.ts     # TickInputBuffer
└── relay-room-options.ts    # Room configuration types
```

## DO's and DON'Ts

### DO

- Check `clockSync.isReady` before using timing data
- Send pings regularly (every ~1-2 seconds)
- Use sequence numbers for ordering
- Handle clock wrap-around for uint32 ticks

### DON'T

- Trust client-provided tick values (server authoritative)
- Assume immediate sync (warmup takes 5+ samples)
- Ignore jitter (use for input delay calculation)
- Send inputs without proper sequencing
