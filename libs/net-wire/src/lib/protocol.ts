import {
  BinarySchema,
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  FieldType,
  LE,
} from '@lagless/binary';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

export const WIRE_VERSION = 1;

export const enum MsgType {
  ServerHello      = 0,
  TickInput        = 1,
  TickInputFanout  = 2,
  CancelInput      = 3,
  Ping             = 4,
  Pong             = 5,
  StateRequest     = 6,
  StateResponse    = 7,
  PlayerFinished   = 8,
  TickInputBatch   = 9,
}

export const enum TickInputKind {
  Client = 0,
  Server = 1,
}

export const enum CancelReason {
  TooOld        = 0,
  TooFarFuture  = 1,
  InvalidSlot   = 2,
}

// ─────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────

export const HeaderSchema = new BinarySchema({
  version: FieldType.Uint8,
  type: FieldType.Uint8,
});

export const ServerHelloSchema = new BinarySchema({
  seed0: FieldType.Float64,
  seed1: FieldType.Float64,
  playerSlot: FieldType.Uint8,
  serverTick: FieldType.Uint32,
  maxPlayers: FieldType.Uint8,
  playerCount: FieldType.Uint8,
});

export const TickInputSchema = new BinarySchema({
  tick: FieldType.Uint32,
  playerSlot: FieldType.Uint8,
  seq: FieldType.Uint32,
  kind: FieldType.Uint8,
  payloadLength: FieldType.Uint16,
});

export const TickInputFanoutSchema = new BinarySchema({
  serverTick: FieldType.Uint32,
  inputCount: FieldType.Uint8,
});

export const TickInputBatchSchema = new BinarySchema({
  inputCount: FieldType.Uint8,
});

export const CancelInputSchema = new BinarySchema({
  tick: FieldType.Uint32,
  playerSlot: FieldType.Uint8,
  seq: FieldType.Uint32,
  reason: FieldType.Uint8,
});

export const PingSchema = new BinarySchema({
  cSend: FieldType.Float64,
});

export const PongSchema = new BinarySchema({
  cSend: FieldType.Float64,
  sRecv: FieldType.Float64,
  sSend: FieldType.Float64,
  sTick: FieldType.Uint32,
});

export const StateRequestSchema = new BinarySchema({
  requestId: FieldType.Uint32,
});

export const StateResponseHeaderSchema = new BinarySchema({
  requestId: FieldType.Uint32,
  tick: FieldType.Uint32,
  hash: FieldType.Uint32,
  stateLength: FieldType.Uint32,
});

export const PlayerFinishedSchema = new BinarySchema({
  tick: FieldType.Uint32,
  playerSlot: FieldType.Uint8,
  payloadLength: FieldType.Uint16,
});

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ServerHelloPlayer {
  readonly playerId: Uint8Array; // 16 bytes UUID
  readonly slot: number;
  readonly isBot: boolean;
  readonly metadataJson: string; // JSON-encoded metadata
}

export interface ServerHelloData {
  readonly seed0: number;
  readonly seed1: number;
  readonly playerSlot: number;
  readonly serverTick: number;
  readonly maxPlayers: number;
  readonly players: ReadonlyArray<ServerHelloPlayer>;
  readonly scopeJson: string;
}

export interface TickInputData {
  readonly tick: number;
  readonly playerSlot: number;
  readonly seq: number;
  readonly kind: TickInputKind;
  readonly payload: Uint8Array;
}

export interface FanoutData {
  readonly serverTick: number;
  readonly inputs: ReadonlyArray<TickInputData>;
}

export interface CancelInputData {
  readonly tick: number;
  readonly playerSlot: number;
  readonly seq: number;
  readonly reason: CancelReason;
}

export interface PongData {
  readonly cSend: number;
  readonly sRecv: number;
  readonly sSend: number;
  readonly sTick: number;
}

export interface StateResponseData {
  readonly requestId: number;
  readonly tick: number;
  readonly hash: number;
  readonly state: ArrayBuffer;
}

export interface PlayerFinishedData {
  readonly tick: number;
  readonly playerSlot: number;
  readonly payload: Uint8Array;
}

// ─────────────────────────────────────────────────────────────
// Packing
// ─────────────────────────────────────────────────────────────

function packHeader(pipeline: BinarySchemaPackPipeline, type: MsgType): void {
  pipeline.pack(HeaderSchema, { version: WIRE_VERSION, type });
}

export function packServerHello(data: ServerHelloData): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();

  packHeader(pipeline, MsgType.ServerHello);
  pipeline.pack(ServerHelloSchema, {
    seed0: data.seed0,
    seed1: data.seed1,
    playerSlot: data.playerSlot,
    serverTick: data.serverTick,
    maxPlayers: data.maxPlayers,
    playerCount: data.players.length,
  });

  // Pack players: for each player: playerId (16 bytes) + slot (u8) + isBot (u8) + metadataJsonLen (u16) + metadataJson
  const playerChunks: ArrayBuffer[] = [];
  for (const player of data.players) {
    const metadataBytes = new TextEncoder().encode(player.metadataJson);
    const chunk = new ArrayBuffer(16 + 1 + 1 + 2 + metadataBytes.length);
    const view = new DataView(chunk);
    const uint8 = new Uint8Array(chunk);
    uint8.set(player.playerId, 0);
    view.setUint8(16, player.slot);
    view.setUint8(17, player.isBot ? 1 : 0);
    view.setUint16(18, metadataBytes.length, LE);
    uint8.set(metadataBytes, 20);
    playerChunks.push(chunk);
  }
  for (const chunk of playerChunks) {
    pipeline.appendBuffer(chunk);
  }

  // Pack scope JSON
  const scopeBytes = new TextEncoder().encode(data.scopeJson);
  const scopeHeader = new ArrayBuffer(2);
  new DataView(scopeHeader).setUint16(0, scopeBytes.length, LE);
  pipeline.appendBuffer(scopeHeader);
  pipeline.appendView(scopeBytes);

  return pipeline.toUint8Array();
}

export function packTickInput(data: TickInputData): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();
  packHeader(pipeline, MsgType.TickInput);
  pipeline.pack(TickInputSchema, {
    tick: data.tick,
    playerSlot: data.playerSlot,
    seq: data.seq,
    kind: data.kind,
    payloadLength: data.payload.byteLength,
  });
  pipeline.appendView(data.payload);
  return pipeline.toUint8Array();
}

export function packTickInputFanout(data: FanoutData): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();
  packHeader(pipeline, MsgType.TickInputFanout);
  pipeline.pack(TickInputFanoutSchema, {
    serverTick: data.serverTick,
    inputCount: data.inputs.length,
  });

  for (const input of data.inputs) {
    pipeline.pack(TickInputSchema, {
      tick: input.tick,
      playerSlot: input.playerSlot,
      seq: input.seq,
      kind: input.kind,
      payloadLength: input.payload.byteLength,
    });
    pipeline.appendView(input.payload);
  }

  return pipeline.toUint8Array();
}

export function packTickInputBatch(inputs: ReadonlyArray<TickInputData>): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();
  packHeader(pipeline, MsgType.TickInputBatch);
  pipeline.pack(TickInputBatchSchema, { inputCount: inputs.length });

  for (const input of inputs) {
    pipeline.pack(TickInputSchema, {
      tick: input.tick,
      playerSlot: input.playerSlot,
      seq: input.seq,
      kind: input.kind,
      payloadLength: input.payload.byteLength,
    });
    pipeline.appendView(input.payload);
  }

  return pipeline.toUint8Array();
}

export function packCancelInput(data: CancelInputData): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();
  packHeader(pipeline, MsgType.CancelInput);
  pipeline.pack(CancelInputSchema, {
    tick: data.tick,
    playerSlot: data.playerSlot,
    seq: data.seq,
    reason: data.reason,
  });
  return pipeline.toUint8Array();
}

export function packPing(cSend: number): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();
  packHeader(pipeline, MsgType.Ping);
  pipeline.pack(PingSchema, { cSend });
  return pipeline.toUint8Array();
}

export function packPong(data: PongData): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();
  packHeader(pipeline, MsgType.Pong);
  pipeline.pack(PongSchema, data);
  return pipeline.toUint8Array();
}

export function packStateRequest(requestId: number): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();
  packHeader(pipeline, MsgType.StateRequest);
  pipeline.pack(StateRequestSchema, { requestId });
  return pipeline.toUint8Array();
}

export function packStateResponse(data: StateResponseData): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();
  packHeader(pipeline, MsgType.StateResponse);
  pipeline.pack(StateResponseHeaderSchema, {
    requestId: data.requestId,
    tick: data.tick,
    hash: data.hash,
    stateLength: data.state.byteLength,
  });
  pipeline.appendBuffer(data.state);
  return pipeline.toUint8Array();
}

export function packPlayerFinished(data: PlayerFinishedData): Uint8Array {
  const pipeline = new BinarySchemaPackPipeline();
  packHeader(pipeline, MsgType.PlayerFinished);
  pipeline.pack(PlayerFinishedSchema, {
    tick: data.tick,
    playerSlot: data.playerSlot,
    payloadLength: data.payload.byteLength,
  });
  pipeline.appendView(data.payload);
  return pipeline.toUint8Array();
}

// ─────────────────────────────────────────────────────────────
// Unpacking
// ─────────────────────────────────────────────────────────────

export function unpackHeader(data: ArrayBuffer): { version: number; type: MsgType } {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  const header = pipeline.unpack(HeaderSchema);
  return { version: header.version, type: header.type as MsgType };
}

export function unpackServerHello(data: ArrayBuffer): ServerHelloData {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  pipeline.unpack(HeaderSchema); // skip header
  const hello = pipeline.unpack(ServerHelloSchema);

  const remaining = new Uint8Array(pipeline.sliceRemaining());
  let offset = 0;

  const players: ServerHelloPlayer[] = [];
  for (let i = 0; i < hello.playerCount; i++) {
    const playerId = remaining.slice(offset, offset + 16);
    offset += 16;
    const slot = remaining[offset++];
    const isBot = remaining[offset++] === 1;
    const view = new DataView(remaining.buffer, remaining.byteOffset + offset, 2);
    const metadataLen = view.getUint16(0, LE);
    offset += 2;
    const metadataJson = new TextDecoder().decode(remaining.slice(offset, offset + metadataLen));
    offset += metadataLen;
    players.push({ playerId, slot, isBot, metadataJson });
  }

  // Scope JSON
  const scopeView = new DataView(remaining.buffer, remaining.byteOffset + offset, 2);
  const scopeLen = scopeView.getUint16(0, LE);
  offset += 2;
  const scopeJson = new TextDecoder().decode(remaining.slice(offset, offset + scopeLen));

  return {
    seed0: hello.seed0,
    seed1: hello.seed1,
    playerSlot: hello.playerSlot,
    serverTick: hello.serverTick,
    maxPlayers: hello.maxPlayers,
    players,
    scopeJson,
  };
}

export function unpackTickInput(data: ArrayBuffer): TickInputData {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  pipeline.unpack(HeaderSchema); // skip header
  const input = pipeline.unpack(TickInputSchema);
  const payload = new Uint8Array(pipeline.sliceRemaining()).slice(0, input.payloadLength);
  return {
    tick: input.tick,
    playerSlot: input.playerSlot,
    seq: input.seq,
    kind: input.kind as TickInputKind,
    payload,
  };
}

export function unpackCancelInput(data: ArrayBuffer): CancelInputData {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  pipeline.unpack(HeaderSchema);
  const cancel = pipeline.unpack(CancelInputSchema);
  return {
    tick: cancel.tick,
    playerSlot: cancel.playerSlot,
    seq: cancel.seq,
    reason: cancel.reason as CancelReason,
  };
}

export function unpackPing(data: ArrayBuffer): number {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  pipeline.unpack(HeaderSchema);
  const ping = pipeline.unpack(PingSchema);
  return ping.cSend;
}

export function unpackPong(data: ArrayBuffer): PongData {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  pipeline.unpack(HeaderSchema);
  return pipeline.unpack(PongSchema);
}

export function unpackStateRequest(data: ArrayBuffer): number {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  pipeline.unpack(HeaderSchema);
  const req = pipeline.unpack(StateRequestSchema);
  return req.requestId;
}

export function unpackStateResponse(data: ArrayBuffer): StateResponseData {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  pipeline.unpack(HeaderSchema);
  const header = pipeline.unpack(StateResponseHeaderSchema);
  const remaining = pipeline.sliceRemaining();
  const state = remaining.slice(0, header.stateLength);
  return {
    requestId: header.requestId,
    tick: header.tick,
    hash: header.hash,
    state,
  };
}

export function unpackPlayerFinished(data: ArrayBuffer): PlayerFinishedData {
  const pipeline = new BinarySchemaUnpackPipeline(data);
  pipeline.unpack(HeaderSchema);
  const pf = pipeline.unpack(PlayerFinishedSchema);
  const remaining = new Uint8Array(pipeline.sliceRemaining());
  const payload = remaining.slice(0, pf.payloadLength);
  return {
    tick: pf.tick,
    playerSlot: pf.playerSlot,
    payload,
  };
}

export function unpackTickInputFanout(data: ArrayBuffer): FanoutData {
  const view = new DataView(data);
  let offset = HeaderSchema.byteLength; // skip header

  const serverTick = view.getUint32(offset, LE); offset += 4;
  const inputCount = view.getUint8(offset); offset += 1;

  const inputs: TickInputData[] = [];
  for (let i = 0; i < inputCount; i++) {
    const tick = view.getUint32(offset, LE); offset += 4;
    const playerSlot = view.getUint8(offset); offset += 1;
    const seq = view.getUint32(offset, LE); offset += 4;
    const kind = view.getUint8(offset) as TickInputKind; offset += 1;
    const payloadLength = view.getUint16(offset, LE); offset += 2;
    const payload = new Uint8Array(data, offset, payloadLength);
    offset += payloadLength;

    inputs.push({ tick, playerSlot, seq, kind, payload });
  }

  return { serverTick, inputs };
}

/**
 * Unpack TickInputBatch (client→server batch of inputs).
 * Format: Header(2) + inputCount(u8) + [TickInputSchema + payload]×N
 */
export function unpackTickInputBatchManual(data: ArrayBuffer): TickInputData[] {
  const view = new DataView(data);
  let offset = HeaderSchema.byteLength; // skip header

  const inputCount = view.getUint8(offset); offset += 1;

  const inputs: TickInputData[] = [];
  for (let i = 0; i < inputCount; i++) {
    const tick = view.getUint32(offset, LE); offset += 4;
    const playerSlot = view.getUint8(offset); offset += 1;
    const seq = view.getUint32(offset, LE); offset += 4;
    const kind = view.getUint8(offset) as TickInputKind; offset += 1;
    const payloadLength = view.getUint16(offset, LE); offset += 2;
    const payload = new Uint8Array(data, offset, payloadLength);
    offset += payloadLength;

    inputs.push({ tick, playerSlot, seq, kind, payload });
  }

  return inputs;
}
