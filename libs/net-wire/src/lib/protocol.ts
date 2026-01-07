// libs/net-wire/src/lib/protocol.ts

import { BinarySchema, FieldType } from '@lagless/binary';

// Bytes-channel tag for Colyseus raw-binary messages
export const RELAY_BYTES_CHANNEL = 99;

export const enum WireVersion {
  V1 = 1,
  V2 = 2,
}

export const enum MsgType {
  ServerHello,
  TickInput,
  TickInputFanout,
  PlayerFinishedGame,
  CancelInput,
  Ping,
  Pong,
  ServerHelloV2,
  SnapshotRequest,
  SnapshotResponse,
  LateJoinBundle,
  RoomClosing,
  ClientReady,
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

export const ServerHelloV2Struct = new BinarySchema({
  seed0: FieldType.Float64,
  seed1: FieldType.Float64,
  playerSlot: FieldType.Uint8,
  serverTick: FieldType.Uint32,
  frameLengthMs: FieldType.Float32,
  maxPlayers: FieldType.Uint8,
  allowLateJoin: FieldType.Uint8,
  wireVersion: FieldType.Uint8,
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

export const SnapshotRequestStruct = new BinarySchema({
  requestId: FieldType.Uint32,
  minTick: FieldType.Uint32,
  maxTick: FieldType.Uint32,
  maxBytes: FieldType.Uint32,
  preferredChunkSize: FieldType.Uint32,
});

export const SnapshotResponseStruct = new BinarySchema({
  requestId: FieldType.Uint32,
  snapshotTick: FieldType.Uint32,
  hash32: FieldType.Uint32,
  chunkIndex: FieldType.Uint16,
  chunkCount: FieldType.Uint16,
  totalBytes: FieldType.Uint32,
});

export const LateJoinBundleStruct = new BinarySchema({
  snapshotTick: FieldType.Uint32,
  snapshotHash: FieldType.Uint32,
  snapshotByteLength: FieldType.Uint32,
  serverTick: FieldType.Uint32,
});

export const RoomClosingStruct = new BinarySchema({
  reason: FieldType.Uint8,
  finalTick: FieldType.Uint32,
});

export const ClientReadyStruct = new BinarySchema({
  clientVersionHash: FieldType.Uint32,
  schemaHash: FieldType.Uint32,
  role: FieldType.Uint8,
});

export enum ClientRole {
  Player = 0,
  Spectator = 1,
}

