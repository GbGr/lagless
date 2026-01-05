# `@lagless/net-wire`

## What it is
`@lagless/net-wire` defines the shared binary wire protocol for Lagless input-only networking. It includes packet schemas, clock sync helpers, and input delay logic.

## Why it exists / when to use it
Use it anywhere you need to encode or decode Lagless relay packets or compute client-side input delay. It keeps the client and server in sync on the exact byte layout and timing rules.

## Public API
- `WireVersion`, `MsgType`, `TickInputKind`, `RELAY_BYTES_CHANNEL`
- Binary schemas: `HeaderStruct`, `ServerHelloStruct`, `TickInputStruct`, `TickInputFanoutStruct`, `CancelInputStruct`, `PingStruct`, `PongStruct`, `PlayerFinishedGameStruct`
- `ClockSync`: RTT/jitter tracking and clock offset estimation
- `InputDelayController`: converts RTT/jitter into target input delay
- `TickInputBuffer`: stores recent inputs for late joiners
- `ColyseusRelayRoomOptions`: relay room connection options

## Typical usage
Circle Sumo does not import `@lagless/net-wire` directly; the relay server and input provider do. This is the pattern used inside those layers:

```ts
import { HeaderStruct, MsgType, TickInputStruct, WireVersion } from '@lagless/net-wire';

const buffer = new ArrayBuffer(HeaderStruct.byteLength + TickInputStruct.byteLength);
const header = HeaderStruct.pack(buffer);
header.struct.version = WireVersion.V1;
header.struct.type = MsgType.TickInput;
```

## Key concepts & data flow
- Every packet begins with `HeaderStruct` and a `MsgType` identifier.
- `ClockSync` tracks RTT and jitter via Ping/Pong to align client tick timing.
- `InputDelayController` clamps delay inside configured min/max bounds.

## Configuration and environment assumptions
- All schemas are fixed-size and little-endian via `@lagless/binary`.
- Client and server must share the same `WireVersion` and `MsgType` list.

## Pitfalls / common mistakes
- Changing schema ordering without bumping `WireVersion`.
- Sending ad-hoc JSON or string payloads on the relay bytes channel.
- Using clock sync values before receiving enough Pong samples.

## Related modules
- `libs/relay-input-provider` uses these schemas on the client.
- `libs/colyseus-rooms` uses these schemas on the server.
- `circle-sumo/circle-sumo-backend` and `circle-sumo/circle-sumo-game` consume those layers.
