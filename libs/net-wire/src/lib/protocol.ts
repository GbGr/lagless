import { BinarySchema, FieldType } from '@lagless/binary';

// Bytes-channel tag for Colyseus raw-binary messages
export const RELAY_BYTES_CHANNEL = 99;

export const enum WireVersion {
  V1 = 1,
}

export const enum MsgType {
  ServerHello,
  TickInput,
  TickInputFanout,
  CancelInput,
  Ping,
  Pong,
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

export const TickInputStruct = new BinarySchema({
  tick: FieldType.Uint32,
  playerSlot: FieldType.Uint8,
});

export const TickInputFanoutStruct = new BinarySchema({
  serverTick: FieldType.Uint32,
});

export const CancelInputStruct = new BinarySchema({
  tick: FieldType.Uint32,
  playerSlot: FieldType.Uint8,
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


