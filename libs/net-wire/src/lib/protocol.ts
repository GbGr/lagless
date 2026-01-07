// libs/net-wire/src/lib/protocol.ts

import { BinarySchema, FieldType } from '@lagless/binary';

// Bytes-channel tag for Colyseus raw-binary messages
export const RELAY_BYTES_CHANNEL = 99;

export const enum WireVersion {
  V1 = 1,
  V2 = 2,
}

export const enum MsgType {
  // V1 Messages (0-6)
  ServerHello = 0,
  TickInput = 1,
  TickInputFanout = 2,
  PlayerFinishedGame = 3,
  CancelInput = 4,
  Ping = 5,
  Pong = 6,
  // V2 Messages (7+)
  SnapshotRequest = 7,
  SnapshotResponse = 8,
  LateJoinBundle = 9,
  RoomClosing = 10,
  StateHash = 11,
}

export const enum RoomCloseReason {
  AllFinished = 0,
  Timeout = 1,
  Error = 2,
  HostLeft = 3,
}

export const HeaderStruct = new BinarySchema({
  version: FieldType.Uint8,
  type: FieldType.Uint8,
});

export const ServerHelloStruct = new BinarySchema({
  seed0: FieldType.Float64,
  seed1: FieldType.Float64,
  playerSlot: FieldType.Uint8,
});

export enum TickInputKind {
  Client,
  Server,
}

export const TickInputStruct = new BinarySchema({
  tick: FieldType.Uint32,
  playerSlot: FieldType.Uint8,
  kind: FieldType.Uint8,
  seq: FieldType.Uint32,
});

export const TickInputFanoutStruct = new BinarySchema({
  serverTick: FieldType.Uint32,
});

export const CancelInputStruct = new BinarySchema({
  tick: FieldType.Uint32,
  playerSlot: FieldType.Uint8,
  seq: FieldType.Uint32,
});

export const PingStruct = new BinarySchema({
  cSend: FieldType.Float32,
});

export const PongStruct = new BinarySchema({
  cSend: FieldType.Float32,
  sRecv: FieldType.Float32,
  sSend: FieldType.Float32,
  sTick: FieldType.Uint32,
});

export const PlayerFinishedGameStruct = new BinarySchema({
  tick: FieldType.Uint32,
  verifiedTick: FieldType.Uint32,
  playerSlot: FieldType.Uint8,
  score: FieldType.Uint32,
  mmrChange: FieldType.Int32,
});

// ============================================================================
// V2 Protocol Structures
// ============================================================================

/**
 * ServerHelloV2 - Extended server hello with server tick for clock alignment
 * Sent immediately after client joins the relay room
 */
export const ServerHelloV2Struct = new BinarySchema({
  seed0: FieldType.Float64,       // First seed for deterministic RNG
  seed1: FieldType.Float64,       // Second seed for deterministic RNG
  playerSlot: FieldType.Uint8,    // Assigned player slot (0-N)
  serverTick: FieldType.Uint32,   // Current server tick for clock alignment
  maxPlayers: FieldType.Uint8,    // Maximum players in this room
});

/**
 * SnapshotRequest - Server asks connected clients for a state snapshot
 * Used for late-join majority voting
 */
export const SnapshotRequestStruct = new BinarySchema({
  requestId: FieldType.Uint32,    // Unique request identifier
  targetTickMin: FieldType.Uint32, // Minimum acceptable snapshot tick
  targetTickMax: FieldType.Uint32, // Maximum acceptable snapshot tick
});

/**
 * SnapshotResponse - Client sends snapshot data to server
 * snapshotBytes follows after this header
 */
export const SnapshotResponseStruct = new BinarySchema({
  requestId: FieldType.Uint32,    // Request ID this responds to
  snapshotTick: FieldType.Uint32, // Actual tick of the snapshot
  hash32: FieldType.Uint32,       // Hash of snapshot for validation
  snapshotSize: FieldType.Uint32, // Size of snapshot bytes that follow
});

/**
 * LateJoinBundleHeader - Server sends snapshot + inputs to late joiner
 * snapshotBytes (snapshotSize) + inputBytes follow after this header
 */
export const LateJoinBundleHeaderStruct = new BinarySchema({
  snapshotTick: FieldType.Uint32, // Tick of the snapshot
  snapshotHash: FieldType.Uint32, // Hash for validation
  snapshotSize: FieldType.Uint32, // Size of snapshot bytes
  inputCount: FieldType.Uint16,   // Number of input buffers that follow
});

/**
 * RoomClosing - Server notifies clients that room is closing
 */
export const RoomClosingStruct = new BinarySchema({
  reason: FieldType.Uint8,        // RoomCloseReason enum value
  finalTick: FieldType.Uint32,    // Last valid tick
});

/**
 * StateHash - Periodic state hash for desync detection
 * Sent by clients to server for comparison
 */
export const StateHashStruct = new BinarySchema({
  tick: FieldType.Uint32,         // Tick this hash is for
  hash32: FieldType.Uint32,       // Hash of ECS state at this tick
});


