import { describe, it, expect } from 'vitest';
import {
  MsgType, TickInputKind, CancelReason, WIRE_VERSION,
  packServerHello, unpackServerHello, unpackHeader,
  packTickInput, unpackTickInput,
  packTickInputFanout, unpackTickInputFanout,
  packCancelInput, unpackCancelInput,
  packPing, unpackPing,
  packPong, unpackPong,
  packStateRequest, unpackStateRequest,
  packStateResponse, unpackStateResponse,
  packPlayerFinished, unpackPlayerFinished,
  type ServerHelloData, type TickInputData, type FanoutData,
} from './protocol.js';

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────

describe('Header', () => {
  it('should unpack header from any message', () => {
    const msg = packPing(123.456);
    const header = unpackHeader(msg.buffer as ArrayBuffer);
    expect(header.version).toBe(WIRE_VERSION);
    expect(header.type).toBe(MsgType.Ping);
  });
});

// ─────────────────────────────────────────────────────────────
// ServerHello
// ─────────────────────────────────────────────────────────────

describe('ServerHello', () => {
  it('should roundtrip with players and scope', () => {
    const seed = new Uint8Array(16);
    for (let i = 0; i < 16; i++) seed[i] = (i * 17 + 3) & 0xFF;

    const playerId1 = new Uint8Array(16);
    playerId1[0] = 0xAB;
    playerId1[15] = 0xCD;

    const playerId2 = new Uint8Array(16);
    playerId2[0] = 0x12;

    const data: ServerHelloData = {
      seed,
      playerSlot: 2,
      serverTick: 1000,
      maxPlayers: 4,
      players: [
        { playerId: playerId1, slot: 0, isBot: false, metadataJson: '{"skin":5}' },
        { playerId: playerId2, slot: 1, isBot: true, metadataJson: '{}' },
      ],
      scopeJson: '{"gameType":"circle-sumo","tickRate":60}',
    };

    const packed = packServerHello(data);
    const unpacked = unpackServerHello(packed.buffer as ArrayBuffer);

    expect(new Uint8Array(unpacked.seed)).toEqual(seed);
    expect(unpacked.playerSlot).toBe(2);
    expect(unpacked.serverTick).toBe(1000);
    expect(unpacked.maxPlayers).toBe(4);

    expect(unpacked.players.length).toBe(2);
    expect(unpacked.players[0].playerId[0]).toBe(0xAB);
    expect(unpacked.players[0].playerId[15]).toBe(0xCD);
    expect(unpacked.players[0].slot).toBe(0);
    expect(unpacked.players[0].isBot).toBe(false);
    expect(unpacked.players[0].metadataJson).toBe('{"skin":5}');

    expect(unpacked.players[1].playerId[0]).toBe(0x12);
    expect(unpacked.players[1].isBot).toBe(true);
    expect(unpacked.players[1].metadataJson).toBe('{}');

    expect(unpacked.scopeJson).toBe('{"gameType":"circle-sumo","tickRate":60}');
  });

  it('should roundtrip with long scopeJson (BUG 7 regression)', () => {
    const longScope = JSON.stringify({
      gameType: 'circle-sumo',
      tickRate: 60,
      extra: 'a'.repeat(500),
    });

    const data: ServerHelloData = {
      seed: new Uint8Array(16).fill(42),
      playerSlot: 0,
      serverTick: 500,
      maxPlayers: 2,
      players: [],
      scopeJson: longScope,
    };

    const packed = packServerHello(data);
    const unpacked = unpackServerHello(packed.buffer as ArrayBuffer);

    expect(unpacked.scopeJson).toBe(longScope);
    expect(unpacked.serverTick).toBe(500);
  });

  it('should roundtrip with no players', () => {
    const data: ServerHelloData = {
      seed: new Uint8Array(16), playerSlot: 0, serverTick: 0, maxPlayers: 2,
      players: [], scopeJson: '{}',
    };
    const packed = packServerHello(data);
    const unpacked = unpackServerHello(packed.buffer as ArrayBuffer);
    expect(unpacked.players.length).toBe(0);
    expect(unpacked.scopeJson).toBe('{}');
  });
});

// ─────────────────────────────────────────────────────────────
// TickInput
// ─────────────────────────────────────────────────────────────

describe('TickInput', () => {
  it('should roundtrip client input', () => {
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const data: TickInputData = {
      tick: 500,
      playerSlot: 3,
      seq: 42,
      kind: TickInputKind.Client,
      payload,
    };

    const packed = packTickInput(data);
    const unpacked = unpackTickInput(packed.buffer as ArrayBuffer);

    expect(unpacked.tick).toBe(500);
    expect(unpacked.playerSlot).toBe(3);
    expect(unpacked.seq).toBe(42);
    expect(unpacked.kind).toBe(TickInputKind.Client);
    expect(new Uint8Array(unpacked.payload)).toEqual(payload);
  });

  it('should roundtrip server input', () => {
    const payload = new Uint8Array([0xFF]);
    const data: TickInputData = {
      tick: 100, playerSlot: 255, seq: 1,
      kind: TickInputKind.Server, payload,
    };

    const packed = packTickInput(data);
    const unpacked = unpackTickInput(packed.buffer as ArrayBuffer);

    expect(unpacked.kind).toBe(TickInputKind.Server);
    expect(unpacked.playerSlot).toBe(255);
  });

  it('should handle empty payload', () => {
    const data: TickInputData = {
      tick: 1, playerSlot: 0, seq: 1,
      kind: TickInputKind.Client, payload: new Uint8Array(0),
    };
    const packed = packTickInput(data);
    const unpacked = unpackTickInput(packed.buffer as ArrayBuffer);
    expect(unpacked.payload.byteLength).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// TickInputFanout
// ─────────────────────────────────────────────────────────────

describe('TickInputFanout', () => {
  it('should roundtrip multiple inputs', () => {
    const data: FanoutData = {
      serverTick: 1000,
      inputs: [
        { tick: 1005, playerSlot: 0, seq: 10, kind: TickInputKind.Client, payload: new Uint8Array([1, 2]) },
        { tick: 1005, playerSlot: 1, seq: 5, kind: TickInputKind.Client, payload: new Uint8Array([3]) },
        { tick: 1006, playerSlot: 255, seq: 1, kind: TickInputKind.Server, payload: new Uint8Array([4, 5, 6]) },
      ],
    };

    const packed = packTickInputFanout(data);
    const unpacked = unpackTickInputFanout(packed.buffer as ArrayBuffer);

    expect(unpacked.serverTick).toBe(1000);
    expect(unpacked.inputs.length).toBe(3);

    expect(unpacked.inputs[0].tick).toBe(1005);
    expect(unpacked.inputs[0].playerSlot).toBe(0);
    expect(unpacked.inputs[0].seq).toBe(10);
    expect(new Uint8Array(unpacked.inputs[0].payload)).toEqual(new Uint8Array([1, 2]));

    expect(unpacked.inputs[1].playerSlot).toBe(1);
    expect(new Uint8Array(unpacked.inputs[1].payload)).toEqual(new Uint8Array([3]));

    expect(unpacked.inputs[2].kind).toBe(TickInputKind.Server);
    expect(new Uint8Array(unpacked.inputs[2].payload)).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('should roundtrip empty fanout', () => {
    const data: FanoutData = { serverTick: 500, inputs: [] };
    const packed = packTickInputFanout(data);
    const unpacked = unpackTickInputFanout(packed.buffer as ArrayBuffer);

    expect(unpacked.serverTick).toBe(500);
    expect(unpacked.inputs.length).toBe(0);
  });

  it('should roundtrip single input with large payload', () => {
    const bigPayload = new Uint8Array(1000);
    for (let i = 0; i < 1000; i++) bigPayload[i] = i % 256;

    const data: FanoutData = {
      serverTick: 42,
      inputs: [{ tick: 50, playerSlot: 0, seq: 1, kind: TickInputKind.Client, payload: bigPayload }],
    };

    const packed = packTickInputFanout(data);
    const unpacked = unpackTickInputFanout(packed.buffer as ArrayBuffer);

    expect(unpacked.inputs.length).toBe(1);
    expect(new Uint8Array(unpacked.inputs[0].payload)).toEqual(bigPayload);
  });

  it('should return payload as independent copy, not a view into source buffer', () => {
    const originalPayload = new Uint8Array([10, 20, 30]);
    const data: FanoutData = {
      serverTick: 1,
      inputs: [{ tick: 5, playerSlot: 0, seq: 1, kind: TickInputKind.Client, payload: originalPayload }],
    };

    const packed = packTickInputFanout(data);
    const sourceBuffer = packed.buffer as ArrayBuffer;
    const unpacked = unpackTickInputFanout(sourceBuffer);

    const payload = unpacked.inputs[0].payload;

    // Payload must not share the source ArrayBuffer
    expect(payload.buffer).not.toBe(sourceBuffer);

    // Mutating the source buffer must not affect the payload
    new Uint8Array(sourceBuffer).fill(0);
    expect(new Uint8Array(payload)).toEqual(new Uint8Array([10, 20, 30]));
  });

  it('should return independent buffers for each payload in multi-input fanout', () => {
    const data: FanoutData = {
      serverTick: 1,
      inputs: [
        { tick: 5, playerSlot: 0, seq: 1, kind: TickInputKind.Client, payload: new Uint8Array([1, 2]) },
        { tick: 5, playerSlot: 1, seq: 1, kind: TickInputKind.Client, payload: new Uint8Array([3, 4]) },
      ],
    };

    const packed = packTickInputFanout(data);
    const sourceBuffer = packed.buffer as ArrayBuffer;
    const unpacked = unpackTickInputFanout(sourceBuffer);

    // Each payload has its own ArrayBuffer
    expect(unpacked.inputs[0].payload.buffer).not.toBe(unpacked.inputs[1].payload.buffer);
    expect(unpacked.inputs[0].payload.buffer).not.toBe(sourceBuffer);
    expect(unpacked.inputs[1].payload.buffer).not.toBe(sourceBuffer);

    // Mutating source doesn't affect either payload
    new Uint8Array(sourceBuffer).fill(0);
    expect(new Uint8Array(unpacked.inputs[0].payload)).toEqual(new Uint8Array([1, 2]));
    expect(new Uint8Array(unpacked.inputs[1].payload)).toEqual(new Uint8Array([3, 4]));
  });
});

// ─────────────────────────────────────────────────────────────
// CancelInput
// ─────────────────────────────────────────────────────────────

describe('CancelInput', () => {
  it('should roundtrip all cancel reasons', () => {
    for (const reason of [CancelReason.TooOld, CancelReason.TooFarFuture, CancelReason.InvalidSlot]) {
      const packed = packCancelInput({ tick: 100, playerSlot: 2, seq: 5, reason });
      const unpacked = unpackCancelInput(packed.buffer as ArrayBuffer);
      expect(unpacked.tick).toBe(100);
      expect(unpacked.playerSlot).toBe(2);
      expect(unpacked.seq).toBe(5);
      expect(unpacked.reason).toBe(reason);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Ping / Pong
// ─────────────────────────────────────────────────────────────

describe('Ping/Pong', () => {
  it('should roundtrip Ping with Float64 precision', () => {
    const cSend = 1234567.890123;
    const packed = packPing(cSend);
    const unpacked = unpackPing(packed.buffer as ArrayBuffer);
    expect(unpacked).toBeCloseTo(cSend, 10);
  });

  it('should roundtrip Pong with all fields', () => {
    const data = { cSend: 100.5, sRecv: 150.123, sSend: 150.456, sTick: 9000 };
    const packed = packPong(data);
    const unpacked = unpackPong(packed.buffer as ArrayBuffer);
    expect(unpacked.cSend).toBeCloseTo(100.5, 10);
    expect(unpacked.sRecv).toBeCloseTo(150.123, 10);
    expect(unpacked.sSend).toBeCloseTo(150.456, 10);
    expect(unpacked.sTick).toBe(9000);
  });

  it('should preserve high timestamp values', () => {
    // After 10 hours: ~36,000,000ms — must not lose precision
    const cSend = 36_000_000.123456;
    const packed = packPing(cSend);
    const unpacked = unpackPing(packed.buffer as ArrayBuffer);
    expect(unpacked).toBeCloseTo(cSend, 6);
  });
});

// ─────────────────────────────────────────────────────────────
// StateRequest / StateResponse
// ─────────────────────────────────────────────────────────────

describe('StateRequest/StateResponse', () => {
  it('should roundtrip StateRequest', () => {
    const packed = packStateRequest(42);
    const unpacked = unpackStateRequest(packed.buffer as ArrayBuffer);
    expect(unpacked).toBe(42);
  });

  it('should roundtrip StateResponse with state data', () => {
    const state = new ArrayBuffer(256);
    new Uint8Array(state).fill(0xAB);

    const data = { requestId: 7, tick: 500, hash: 0xDEADBEEF, state };
    const packed = packStateResponse(data);
    const unpacked = unpackStateResponse(packed.buffer as ArrayBuffer);

    expect(unpacked.requestId).toBe(7);
    expect(unpacked.tick).toBe(500);
    expect(unpacked.hash).toBe(0xDEADBEEF);
    expect(unpacked.state.byteLength).toBe(256);
    expect(new Uint8Array(unpacked.state).every(b => b === 0xAB)).toBe(true);
  });

  it('should handle empty state', () => {
    const data = { requestId: 1, tick: 0, hash: 0, state: new ArrayBuffer(0) };
    const packed = packStateResponse(data);
    const unpacked = unpackStateResponse(packed.buffer as ArrayBuffer);
    expect(unpacked.state.byteLength).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// PlayerFinished
// ─────────────────────────────────────────────────────────────

describe('PlayerFinished', () => {
  it('should roundtrip with payload', () => {
    const payload = new Uint8Array([10, 20, 30]);
    const packed = packPlayerFinished({ tick: 3000, playerSlot: 1, payload });
    const unpacked = unpackPlayerFinished(packed.buffer as ArrayBuffer);

    expect(unpacked.tick).toBe(3000);
    expect(unpacked.playerSlot).toBe(1);
    expect(new Uint8Array(unpacked.payload)).toEqual(payload);
  });
});

// ─────────────────────────────────────────────────────────────
// Message type detection
// ─────────────────────────────────────────────────────────────

describe('Message type detection', () => {
  it('should correctly identify all message types via header', () => {
    const messages: Array<[Uint8Array, MsgType]> = [
      [packPing(0), MsgType.Ping],
      [packPong({ cSend: 0, sRecv: 0, sSend: 0, sTick: 0 }), MsgType.Pong],
      [packCancelInput({ tick: 0, playerSlot: 0, seq: 0, reason: CancelReason.TooOld }), MsgType.CancelInput],
      [packStateRequest(0), MsgType.StateRequest],
      [packTickInput({ tick: 0, playerSlot: 0, seq: 0, kind: TickInputKind.Client, payload: new Uint8Array(0) }), MsgType.TickInput],
    ];

    for (const [msg, expectedType] of messages) {
      const header = unpackHeader(msg.buffer as ArrayBuffer);
      expect(header.version).toBe(WIRE_VERSION);
      expect(header.type).toBe(expectedType);
    }
  });
});
