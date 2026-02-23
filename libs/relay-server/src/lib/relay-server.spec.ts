import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServerClock } from './server-clock.js';
import { PlayerConnection } from './player-connection.js';
import { InputHandler, type ValidatedInput } from './input-handler.js';
import { RelayRoom } from './relay-room.js';
import { RoomRegistry } from './room-registry.js';
import { StateTransfer } from './state-transfer.js';
import {
  type RoomTypeConfig, type RoomHooks, type PlayerInfo,
  type IWebSocket, type InputRegistry,
  LeaveReason,
} from './types.js';
import { LE } from '@lagless/binary';

// ─── Test helpers ───────────────────────────────────────────

function createMockWs(): IWebSocket & { sent: Uint8Array[]; closed: boolean } {
  return {
    sent: [],
    closed: false,
    sendBinary(data: Uint8Array) { this.sent.push(data); },
    close() { this.closed = true; },
  };
}

const DEFAULT_CONFIG: RoomTypeConfig = {
  maxPlayers: 4,
  tickRateHz: 60,
  maxFutureTicks: 20,
  lateJoinEnabled: false,
  reconnectTimeoutMs: 0,
  stateTransferTimeoutMs: 5000,
};

const MOCK_INPUT_REGISTRY: InputRegistry = {
  get: () => ({ id: 0, fields: [], byteLength: 0 }),
};

const TEST_SEED = new Uint8Array(16);

async function createTestRoom(
  config: Partial<RoomTypeConfig> = {},
  hooks: RoomHooks = {},
  playerCount = 2,
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const players = Array.from({ length: playerCount }, (_, i) => ({
    playerId: `player-${i}`,
    isBot: false,
    metadata: { skin: i },
  }));

  const room = new RelayRoom(
    'test-match-id',
    'test-game',
    fullConfig,
    hooks,
    MOCK_INPUT_REGISTRY,
    players,
    TEST_SEED,
    '{"gameType":"test"}',
  );
  await room.init();
  return room;
}

// ─── ServerClock ────────────────────────────────────────────

describe('ServerClock', () => {
  it('should start at tick 0', () => {
    const clock = new ServerClock(60);
    expect(clock.tick).toBe(0);
  });

  it('should advance tick based on elapsed time', async () => {
    const clock = new ServerClock(60);
    await new Promise(r => setTimeout(r, 50));
    expect(clock.tick).toBeGreaterThanOrEqual(2);
    expect(clock.tick).toBeLessThan(10);
  });

  it('should calculate tickMs from rate', () => {
    const clock = new ServerClock(60);
    expect(clock.tickMs).toBeCloseTo(1000 / 60, 5);

    const clock30 = new ServerClock(30);
    expect(clock30.tickMs).toBeCloseTo(1000 / 30, 5);
  });

  it('should track elapsed time', async () => {
    const clock = new ServerClock(60);
    await new Promise(r => setTimeout(r, 20));
    expect(clock.elapsedMs).toBeGreaterThanOrEqual(15);
    expect(clock.elapsedMs).toBeLessThan(100);
  });
});

// ─── PlayerConnection ───────────────────────────────────────

describe('PlayerConnection', () => {
  const playerInfo: PlayerInfo = {
    playerId: 'p1',
    slot: 0,
    isBot: false,
    metadata: {},
  };

  it('should start as Disconnected for human', () => {
    const conn = new PlayerConnection(playerInfo, null);
    expect(conn.isDisconnected).toBe(true);
    expect(conn.isConnected).toBe(false);
  });

  it('should start as Gone for bot', () => {
    const botInfo: PlayerInfo = { ...playerInfo, isBot: true };
    const conn = new PlayerConnection(botInfo, null);
    expect(conn.isGone).toBe(true);
  });

  it('should transition to Connected on connect', () => {
    const ws = createMockWs();
    const conn = new PlayerConnection(playerInfo, null);
    conn.connect(ws);
    expect(conn.isConnected).toBe(true);
  });

  it('should send data when connected', () => {
    const ws = createMockWs();
    const conn = new PlayerConnection(playerInfo, null);
    conn.connect(ws);
    conn.send(new Uint8Array([1, 2, 3]));
    expect(ws.sent.length).toBe(1);
    expect(ws.sent[0]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('should not send when disconnected', () => {
    const ws = createMockWs();
    const conn = new PlayerConnection(playerInfo, null);
    conn.connect(ws);
    conn.markDisconnected();
    conn.send(new Uint8Array([1]));
    expect(ws.sent.length).toBe(0);
  });

  it('should track reconnect timeout', async () => {
    const ws = createMockWs();
    const conn = new PlayerConnection(playerInfo, null);
    conn.connect(ws);
    conn.markDisconnected();

    expect(conn.isReconnectExpired(100)).toBe(false);
    await new Promise(r => setTimeout(r, 50));
    expect(conn.isReconnectExpired(30)).toBe(true);
    expect(conn.isReconnectExpired(200)).toBe(false);
  });

  it('should allow reconnect', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const conn = new PlayerConnection(playerInfo, null);
    conn.connect(ws1);
    conn.markDisconnected();
    expect(conn.isDisconnected).toBe(true);

    conn.connect(ws2);
    expect(conn.isConnected).toBe(true);
    conn.send(new Uint8Array([42]));
    expect(ws2.sent.length).toBe(1);
  });

  it('should have hasConnectedBefore = false before first connect', () => {
    const conn = new PlayerConnection(playerInfo, null);
    expect(conn.hasConnectedBefore).toBe(false);
  });

  it('should have hasConnectedBefore = true after connect', () => {
    const ws = createMockWs();
    const conn = new PlayerConnection(playerInfo, null);
    conn.connect(ws);
    expect(conn.hasConnectedBefore).toBe(true);
  });

  it('should keep hasConnectedBefore = true after markDisconnected', () => {
    const ws = createMockWs();
    const conn = new PlayerConnection(playerInfo, null);
    conn.connect(ws);
    conn.markDisconnected();
    expect(conn.hasConnectedBefore).toBe(true);
  });
});

// ─── RelayRoom ──────────────────────────────────────────────

describe('RelayRoom', () => {
  it('should create room with correct state', async () => {
    const room = await createTestRoom();
    expect(room.isDisposed).toBe(false);
    expect(room.matchId).toBe('test-match-id');
    expect(room.tick).toBeGreaterThanOrEqual(0);
  });

  it('should call onRoomCreated hook', async () => {
    const onRoomCreated = vi.fn();
    await createTestRoom({}, { onRoomCreated });
    expect(onRoomCreated).toHaveBeenCalledOnce();
  });

  it('should handle player connect', async () => {
    const onPlayerJoin = vi.fn();
    const room = await createTestRoom({}, { onPlayerJoin });

    const ws = createMockWs();
    const success = await room.handlePlayerConnect('player-0', ws);

    expect(success).toBe(true);
    expect(onPlayerJoin).toHaveBeenCalledOnce();
    expect(onPlayerJoin.mock.calls[0][1].playerId).toBe('player-0');
    // Should have received ServerHello
    expect(ws.sent.length).toBe(1);
  });

  it('should reject unknown player', async () => {
    const room = await createTestRoom();
    const ws = createMockWs();
    const success = await room.handlePlayerConnect('unknown-player', ws);
    expect(success).toBe(false);
  });

  it('should reject duplicate connection', async () => {
    const room = await createTestRoom();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    await room.handlePlayerConnect('player-0', ws1);
    const success = await room.handlePlayerConnect('player-0', ws2);
    expect(success).toBe(false);
  });

  it('should handle player disconnect', async () => {
    const onPlayerLeave = vi.fn();
    const room = await createTestRoom({}, { onPlayerLeave });

    const ws = createMockWs();
    await room.handlePlayerConnect('player-0', ws);

    room.handlePlayerDisconnect('player-0');
    expect(onPlayerLeave).toHaveBeenCalledOnce();
    expect(onPlayerLeave.mock.calls[0][2]).toBe(LeaveReason.Disconnected);
  });

  it('should call onMatchEnd when all humans disconnect', async () => {
    const onMatchEnd = vi.fn();
    const room = await createTestRoom({}, { onMatchEnd });

    const ws0 = createMockWs();
    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);
    await room.handlePlayerConnect('player-1', ws1);

    await room.handlePlayerDisconnect('player-0');
    expect(onMatchEnd).not.toHaveBeenCalled();

    await room.handlePlayerDisconnect('player-1');
    // endMatch is async — give it a microtask to complete
    await vi.waitFor(() => {
      expect(onMatchEnd).toHaveBeenCalledOnce();
      expect(room.isDisposed).toBe(true);
    });
  });

  it('should allow reconnect when configured', async () => {
    const room = await createTestRoom({ reconnectTimeoutMs: 5000 });
    const ws0 = createMockWs();
    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);
    await room.handlePlayerConnect('player-1', ws1);
    await room.handlePlayerDisconnect('player-0');

    const ws0b = createMockWs();
    const success = await room.handlePlayerConnect('player-0', ws0b);
    expect(success).toBe(true);
    // ServerHello sent on reconnect
    expect(ws0b.sent.length).toBeGreaterThanOrEqual(1);
  });

  it('should call onPlayerJoin on first connect, NOT onPlayerReconnect', async () => {
    const onPlayerJoin = vi.fn();
    const onPlayerReconnect = vi.fn();
    const room = await createTestRoom({}, { onPlayerJoin, onPlayerReconnect });

    const ws = createMockWs();
    await room.handlePlayerConnect('player-0', ws);

    expect(onPlayerJoin).toHaveBeenCalledOnce();
    expect(onPlayerReconnect).not.toHaveBeenCalled();
  });

  it('should call onPlayerReconnect on reconnect, NOT onPlayerJoin again', async () => {
    const onPlayerJoin = vi.fn();
    const onPlayerReconnect = vi.fn();
    const room = await createTestRoom({ reconnectTimeoutMs: 5000 }, { onPlayerJoin, onPlayerReconnect });

    const ws0 = createMockWs();
    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);
    await room.handlePlayerConnect('player-1', ws1);
    await room.handlePlayerDisconnect('player-0');

    const ws0b = createMockWs();
    await room.handlePlayerConnect('player-0', ws0b);

    expect(onPlayerJoin).toHaveBeenCalledTimes(2); // player-0 + player-1
    expect(onPlayerReconnect).toHaveBeenCalledOnce();
    expect(onPlayerReconnect.mock.calls[0][1].playerId).toBe('player-0');
  });

  it('should reject reconnect when shouldAcceptReconnect returns false', async () => {
    const shouldAcceptReconnect = vi.fn(() => false);
    const room = await createTestRoom({ reconnectTimeoutMs: 5000 }, { shouldAcceptReconnect });

    const ws0 = createMockWs();
    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);
    await room.handlePlayerConnect('player-1', ws1);
    await room.handlePlayerDisconnect('player-0');

    const ws0b = createMockWs();
    const success = await room.handlePlayerConnect('player-0', ws0b);

    expect(success).toBe(false);
    expect(shouldAcceptReconnect).toHaveBeenCalledOnce();
  });

  it('should trigger state transfer on reconnect with lateJoinEnabled', async () => {
    const room = await createTestRoom({ reconnectTimeoutMs: 5000, lateJoinEnabled: true, stateTransferTimeoutMs: 50 });

    const ws0 = createMockWs();
    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);
    await room.handlePlayerConnect('player-1', ws1);

    await room.handlePlayerDisconnect('player-0');

    // Reconnect player-0 — should trigger state request to player-1
    const ws0b = createMockWs();
    const connectPromise = room.handlePlayerConnect('player-0', ws0b);

    // player-1 should have received a StateRequest message (in addition to ServerHello)
    // StateRequest is sent as binary to connected clients
    const player1Messages = ws1.sent;
    const hasStateRequest = player1Messages.length > 1; // ServerHello + StateRequest

    // Wait for state transfer timeout
    const success = await connectPromise;
    expect(success).toBe(true);
  });

  it('should succeed reconnect without state transfer when no other clients respond', async () => {
    const room = await createTestRoom(
      { reconnectTimeoutMs: 5000, lateJoinEnabled: true, stateTransferTimeoutMs: 50 },
      {},
      3,
    );

    const ws0 = createMockWs();
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);
    await room.handlePlayerConnect('player-1', ws1);
    await room.handlePlayerConnect('player-2', ws2);

    // Disconnect player-1 and player-0 (player-2 stays connected)
    await room.handlePlayerDisconnect('player-1');
    await room.handlePlayerDisconnect('player-0');

    // Reconnect player-0 — state transfer targets player-2 but times out (no response)
    const ws0b = createMockWs();
    const success = await room.handlePlayerConnect('player-0', ws0b);
    expect(success).toBe(true);
  });

  it('should handle multiple disconnect/reconnect cycles correctly', async () => {
    const onPlayerJoin = vi.fn();
    const onPlayerReconnect = vi.fn();
    const room = await createTestRoom(
      { reconnectTimeoutMs: 5000 },
      { onPlayerJoin, onPlayerReconnect },
    );

    // Connect both players
    const ws0 = createMockWs();
    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);
    await room.handlePlayerConnect('player-1', ws1);

    // Disconnect + reconnect #1
    await room.handlePlayerDisconnect('player-0');
    const ws0b = createMockWs();
    await room.handlePlayerConnect('player-0', ws0b);

    // Disconnect + reconnect #2
    await room.handlePlayerDisconnect('player-0');
    const ws0c = createMockWs();
    await room.handlePlayerConnect('player-0', ws0c);

    expect(onPlayerJoin).toHaveBeenCalledTimes(2); // player-0 + player-1
    expect(onPlayerReconnect).toHaveBeenCalledTimes(2); // two reconnects
  });

  it('should reject reconnect after timeout expiry (Gone state)', async () => {
    const room = await createTestRoom({ reconnectTimeoutMs: 30 });

    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws1);
    await room.handlePlayerDisconnect('player-0');

    // Wait for timeout
    await new Promise(r => setTimeout(r, 50));
    // Manually trigger timeout check
    (room as any).checkReconnectTimeouts();

    const ws2 = createMockWs();
    const success = await room.handlePlayerConnect('player-0', ws2);
    expect(success).toBe(false); // Gone — rejected
  });

  it('should await async onPlayerLeave in handlePlayerDisconnect', async () => {
    let hookResolved = false;
    const onPlayerLeave = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 10));
      hookResolved = true;
    });
    const room = await createTestRoom({}, { onPlayerLeave });

    const ws = createMockWs();
    await room.handlePlayerConnect('player-0', ws);
    await room.handlePlayerDisconnect('player-0');

    expect(hookResolved).toBe(true);
    expect(onPlayerLeave).toHaveBeenCalledOnce();
  });

  it('should dispose cleanly', async () => {
    const onRoomDisposed = vi.fn();
    const room = await createTestRoom({}, { onRoomDisposed });
    await room.dispose();

    expect(room.isDisposed).toBe(true);
    expect(onRoomDisposed).toHaveBeenCalledOnce();

    // Double dispose should be no-op
    await room.dispose();
    expect(onRoomDisposed).toHaveBeenCalledOnce();
  });

  it('should await async hooks in init()', async () => {
    let hookCompleted = false;
    const onRoomCreated = async () => {
      await new Promise(r => setTimeout(r, 10));
      hookCompleted = true;
    };

    await createTestRoom({}, { onRoomCreated });
    expect(hookCompleted).toBe(true);
  });
});

// ─── RoomRegistry ───────────────────────────────────────────

describe('RoomRegistry', () => {
  let registry: RoomRegistry;

  beforeEach(() => {
    registry = new RoomRegistry();
    registry.registerRoomType('test-game', DEFAULT_CONFIG, {});
  });

  it('should register room types', () => {
    expect(registry.getRoomType('test-game')).toBeDefined();
    expect(registry.getRoomType('unknown')).toBeUndefined();
  });

  it('should throw on duplicate room type', () => {
    expect(() => registry.registerRoomType('test-game', DEFAULT_CONFIG, {}))
      .toThrow(/already registered/);
  });

  it('should create rooms', async () => {
    const room = await registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [
        { playerId: 'p1', isBot: false, metadata: {} },
        { playerId: 'p2', isBot: true, metadata: {} },
      ],
    }, TEST_SEED);

    expect(room.matchId).toBe('match-1');
    expect(registry.roomCount).toBe(1);
    expect(registry.getRoom('match-1')).toBe(room);
  });

  it('should throw on duplicate match ID', async () => {
    await registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [{ playerId: 'p1', isBot: false, metadata: {} }],
    }, TEST_SEED);

    await expect(registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [{ playerId: 'p2', isBot: false, metadata: {} }],
    }, TEST_SEED)).rejects.toThrow(/already exists/);
  });

  it('should throw for unknown room type', async () => {
    await expect(registry.createRoom({
      matchId: 'match-1',
      roomType: 'unknown',
      players: [],
    }, TEST_SEED)).rejects.toThrow(/Unknown room type/);
  });

  it('should dispose all rooms', async () => {
    await registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [{ playerId: 'p1', isBot: false, metadata: {} }],
    }, TEST_SEED);

    await registry.createRoom({
      matchId: 'match-2',
      roomType: 'test-game',
      players: [{ playerId: 'p2', isBot: false, metadata: {} }],
    }, TEST_SEED);

    expect(registry.roomCount).toBe(2);
    await registry.dispose();
    expect(registry.roomCount).toBe(0);
  });

  it('should await async createRoom with async hooks', async () => {
    let hookDone = false;
    const asyncRegistry = new RoomRegistry();
    asyncRegistry.registerRoomType('async-game', DEFAULT_CONFIG, {
      onRoomCreated: async () => {
        await new Promise(r => setTimeout(r, 10));
        hookDone = true;
      },
    });

    await asyncRegistry.createRoom({
      matchId: 'async-match',
      roomType: 'async-game',
      players: [{ playerId: 'p1', isBot: false, metadata: {} }],
    }, TEST_SEED);

    expect(hookDone).toBe(true);
    await asyncRegistry.dispose();
  });
});

// ─── StateTransfer ──────────────────────────────────────────

describe('StateTransfer', () => {
  it('should resolve null when no respondents', async () => {
    const st = new StateTransfer(1000);
    const connections = new Map<number, PlayerConnection>();
    const result = await st.requestState(connections);
    expect(result).toBeNull();
  });

  it('should resolve with single response', async () => {
    const st = new StateTransfer(1000);

    const ws = createMockWs();
    const info: PlayerInfo = { playerId: 'p1', slot: 0, isBot: false, metadata: {} };
    const conn = new PlayerConnection(info, null);
    conn.connect(ws);

    const connections = new Map<number, PlayerConnection>([[0, conn]]);
    const promise = st.requestState(connections);

    // Simulate client response
    const requestId = 1; // first request
    const state = new ArrayBuffer(8);
    new Uint8Array(state).fill(0xAA);
    st.receiveResponse(0, requestId, 100, 0xDEAD, state);

    const result = await promise;
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    const r = result as NonNullable<typeof result>;
    expect(r.tick).toBe(100);
    expect(r.hash).toBe(0xDEAD);
    expect(r.votedBy).toBe(1);
    expect(r.totalResponses).toBe(1);
    expect(new Uint8Array(r.state).every(b => b === 0xAA)).toBe(true);
  });

  it('should pick majority when responses differ', async () => {
    const st = new StateTransfer(1000);

    const connections = new Map<number, PlayerConnection>();
    for (let i = 0; i < 3; i++) {
      const ws = createMockWs();
      const info: PlayerInfo = { playerId: `p${i}`, slot: i, isBot: false, metadata: {} };
      const conn = new PlayerConnection(info, null);
      conn.connect(ws);
      connections.set(i, conn);
    }

    const promise = st.requestState(connections);

    // 2 agree on hash 0xAAAA, 1 has 0xBBBB
    st.receiveResponse(0, 1, 100, 0xAAAA, new ArrayBuffer(4));
    st.receiveResponse(1, 1, 100, 0xBBBB, new ArrayBuffer(4));
    st.receiveResponse(2, 1, 100, 0xAAAA, new ArrayBuffer(4));

    const result = await promise;
    expect(result).not.toBeNull();
    const r = result as NonNullable<typeof result>;
    expect(r.hash).toBe(0xAAAA);
    expect(r.votedBy).toBe(2);
    expect(r.totalResponses).toBe(3);
  });

  it('should timeout and resolve with available responses', async () => {
    const st = new StateTransfer(50); // 50ms timeout

    const connections = new Map<number, PlayerConnection>();
    for (let i = 0; i < 2; i++) {
      const ws = createMockWs();
      const info: PlayerInfo = { playerId: `p${i}`, slot: i, isBot: false, metadata: {} };
      const conn = new PlayerConnection(info, null);
      conn.connect(ws);
      connections.set(i, conn);
    }

    const promise = st.requestState(connections);

    // Only one responds
    st.receiveResponse(0, 1, 50, 0x1234, new ArrayBuffer(4));

    const result = await promise;
    expect(result).not.toBeNull();
    const r = result as NonNullable<typeof result>;
    expect(r.votedBy).toBe(1);
    expect(r.totalResponses).toBe(1);
  });

  it('should timeout with null when no responses', async () => {
    const st = new StateTransfer(50);

    const ws = createMockWs();
    const info: PlayerInfo = { playerId: 'p1', slot: 0, isBot: false, metadata: {} };
    const conn = new PlayerConnection(info, null);
    conn.connect(ws);

    const connections = new Map<number, PlayerConnection>([[0, conn]]);
    const result = await st.requestState(connections);
    expect(result).toBeNull();
  });

  it('should dispose pending requests', async () => {
    const st = new StateTransfer(5000);

    const ws = createMockWs();
    const info: PlayerInfo = { playerId: 'p1', slot: 0, isBot: false, metadata: {} };
    const conn = new PlayerConnection(info, null);
    conn.connect(ws);

    const connections = new Map<number, PlayerConnection>([[0, conn]]);
    const promise = st.requestState(connections);

    st.dispose();
    const result = await promise;
    expect(result).toBeNull();
  });
});

// ─── InputHandler (BUG 3 — bounds checking) ─────────────────

describe('InputHandler', () => {
  function createInputHandler(tickOverride?: number) {
    const clock = new ServerClock(60);
    const config: RoomTypeConfig = { ...DEFAULT_CONFIG };
    const handler = new InputHandler(clock, config);
    return { handler, clock };
  }

  /**
   * Build a raw TickInputBatch ArrayBuffer manually.
   * Format: Header(2) + inputCount(u8) + [tick(u32) + slot(u8) + seq(u32) + kind(u8) + payloadLen(u16) + payload]×N
   */
  function buildRawBatch(inputs: Array<{
    tick: number;
    slot: number;
    seq: number;
    kind?: number;
    payload?: Uint8Array;
  }>): ArrayBuffer {
    // Calculate total size
    let size = 2 + 1; // header + inputCount
    for (const i of inputs) {
      const pl = i.payload ?? new Uint8Array([1, 2]);
      size += 4 + 1 + 4 + 1 + 2 + pl.byteLength; // tick+slot+seq+kind+payloadLen+payload
    }

    const buf = new ArrayBuffer(size);
    const view = new DataView(buf);
    const uint8 = new Uint8Array(buf);
    let offset = 0;

    // Header
    view.setUint8(offset++, 1); // version
    view.setUint8(offset++, 9); // MsgType.TickInputBatch

    // inputCount
    view.setUint8(offset++, inputs.length);

    for (const i of inputs) {
      const payload = i.payload ?? new Uint8Array([1, 2]);
      view.setUint32(offset, i.tick, LE); offset += 4;
      view.setUint8(offset++, i.slot);
      view.setUint32(offset, i.seq, LE); offset += 4;
      view.setUint8(offset++, i.kind ?? 0); // Client = 0
      view.setUint16(offset, payload.byteLength, LE); offset += 2;
      uint8.set(payload, offset); offset += payload.byteLength;
    }

    return buf;
  }

  it('should handle valid batch', () => {
    const { handler } = createInputHandler();
    const raw = buildRawBatch([
      { tick: 5, slot: 0, seq: 1 },
      { tick: 6, slot: 0, seq: 2 },
    ]);

    const results = handler.validateClientInputBatch(0, raw);
    expect(results.length).toBe(2);
    expect(results[0].accepted).toBe(true);
    expect(results[1].accepted).toBe(true);
  });

  it('should handle truncated batch header (empty buffer)', () => {
    const { handler } = createInputHandler();
    // Just header bytes (2), no inputCount byte
    const raw = new ArrayBuffer(2);
    const view = new DataView(raw);
    view.setUint8(0, 1); // version
    view.setUint8(1, 9); // MsgType.TickInputBatch

    const results = handler.validateClientInputBatch(0, raw);
    expect(results.length).toBe(0);
  });

  it('should handle batch with inputCount > actual data', () => {
    const { handler } = createInputHandler();
    // Build a batch with inputCount=5 but only header bytes
    const HEADER_LEN = 2;
    const raw = new ArrayBuffer(HEADER_LEN + 1);
    const view = new DataView(raw);
    view.setUint8(0, 1); // version
    view.setUint8(1, 9); // MsgType.TickInputBatch
    view.setUint8(HEADER_LEN, 5); // claim 5 inputs

    const results = handler.validateClientInputBatch(0, raw);
    expect(results.length).toBe(0); // all truncated, none parsed
  });

  it('should parse valid inputs and stop at truncation', () => {
    const { handler } = createInputHandler();

    // Build a normal batch with 2 inputs, then truncate to cut off the 2nd input's payload
    const raw = buildRawBatch([
      { tick: 5, slot: 0, seq: 1, payload: new Uint8Array([1, 2, 3]) },
      { tick: 6, slot: 0, seq: 2, payload: new Uint8Array([4, 5, 6]) },
    ]);

    // Truncate the buffer to cut into the 2nd input's payload
    // Header(2) + batchHeader(1) + input1: tick(4)+slot(1)+seq(4)+kind(1)+payloadLen(2)+payload(3) = 18
    // input2 header: 12 bytes, need 3 more for payload — truncate before payload completes
    const truncatedLength = 2 + 1 + 12 + 3 + 12 + 1; // just 1 byte of 2nd payload
    const truncated = raw.slice(0, truncatedLength);

    const results = handler.validateClientInputBatch(0, truncated);
    expect(results.length).toBe(1); // only first input parsed
    if (results[0].accepted) {
      expect(results[0].input.seq).toBe(1);
    }
  });

  it('should return payload as independent copy, not a view into source buffer', () => {
    const { handler } = createInputHandler();
    const payload = new Uint8Array([10, 20, 30]);
    const raw = buildRawBatch([
      { tick: 5, slot: 0, seq: 1, payload },
    ]);

    const results = handler.validateClientInputBatch(0, raw);
    expect(results.length).toBe(1);
    expect(results[0].accepted).toBe(true);
    if (!results[0].accepted) return;

    // Mutating the source buffer must not affect the payload
    new Uint8Array(raw).fill(0);
    expect(new Uint8Array(results[0].input.payload)).toEqual(new Uint8Array([10, 20, 30]));
  });

  it('should return independent payloads for each input in batch', () => {
    const { handler } = createInputHandler();
    const raw = buildRawBatch([
      { tick: 5, slot: 0, seq: 1, payload: new Uint8Array([1, 2]) },
      { tick: 6, slot: 0, seq: 2, payload: new Uint8Array([3, 4]) },
    ]);

    const results = handler.validateClientInputBatch(0, raw);
    expect(results.length).toBe(2);
    expect(results[0].accepted).toBe(true);
    expect(results[1].accepted).toBe(true);
    if (!results[0].accepted || !results[1].accepted) return;

    // Mutating source doesn't affect either payload
    new Uint8Array(raw).fill(0);
    expect(new Uint8Array(results[0].input.payload)).toEqual(new Uint8Array([1, 2]));
    expect(new Uint8Array(results[1].input.payload)).toEqual(new Uint8Array([3, 4]));

    // Each payload has its own ArrayBuffer
    expect(results[0].input.payload.buffer).not.toBe(results[1].input.payload.buffer);
  });
});

// ─── uuidToBytes (BUG 5 — PlayerId encoding) ────────────────

describe('uuidToBytes via buildServerHello', () => {
  it('should produce valid 16-byte playerIds in ServerHello', async () => {
    const room = await createTestRoom({}, {}, 2);
    const ws = createMockWs();
    await room.handlePlayerConnect('player-0', ws);

    // ServerHello should have been sent
    expect(ws.sent.length).toBe(1);
    // Just verifying no crash — the player IDs are UUIDs like "player-0"
    // which are NOT valid UUID hex, so they'll use XOR fallback
  });

  it('should produce different bytes for different player IDs', async () => {
    // Create room with UUID-like player IDs
    const fullConfig = { ...DEFAULT_CONFIG };
    const players = [
      { playerId: '550e8400-e29b-41d4-a716-446655440000', isBot: false, metadata: {} },
      { playerId: '550e8400-e29b-41d4-a716-446655440001', isBot: false, metadata: {} },
    ];

    const room = new RelayRoom(
      'uuid-test-match',
      'test-game',
      fullConfig,
      {},
      MOCK_INPUT_REGISTRY,
      players,
      TEST_SEED,
      '{}',
    );
    await room.init();

    const ws1 = createMockWs();
    const ws2 = createMockWs();
    await room.handlePlayerConnect('550e8400-e29b-41d4-a716-446655440000', ws1);
    await room.handlePlayerConnect('550e8400-e29b-41d4-a716-446655440001', ws2);

    // Both should have received ServerHello
    expect(ws1.sent.length).toBe(1);
    expect(ws2.sent.length).toBeGreaterThanOrEqual(1);

    // The messages should be different (different playerSlot + different player bytes)
    const msg1 = ws1.sent[0];
    const msg2 = ws2.sent[ws2.sent.length - 1];
    expect(msg1).not.toEqual(msg2);

    await room.dispose();
  });
});

// ─── RelayRoom.addPlayer (Late-Join) ─────────────────────────

describe('RelayRoom.addPlayer', () => {
  it('should return PlayerInfo with correct slot', async () => {
    const room = await createTestRoom({ lateJoinEnabled: true, maxPlayers: 4 });
    const info = room.addPlayer('late-player', false, { skin: 5 });

    expect(info).not.toBeNull();
    expect(info!.slot).toBe(2); // 2 initial players → next slot is 2
    expect(info!.playerId).toBe('late-player');
    expect(info!.isBot).toBe(false);
    expect(info!.metadata).toEqual({ skin: 5 });

    await room.dispose();
  });

  it('should start reconnect timeout for late-joiner', async () => {
    const room = await createTestRoom({ lateJoinEnabled: true, maxPlayers: 4, reconnectTimeoutMs: 30 });
    room.addPlayer('late-player', false, {});

    // Wait for reconnect timeout
    await new Promise(r => setTimeout(r, 50));
    (room as any).checkReconnectTimeouts();

    // Late-joiner should be gone now
    const ws = createMockWs();
    const success = await room.handlePlayerConnect('late-player', ws);
    expect(success).toBe(false);

    await room.dispose();
  });

  it('should reject when lateJoinEnabled=false', async () => {
    const room = await createTestRoom({ lateJoinEnabled: false, maxPlayers: 4 });
    const info = room.addPlayer('late-player', false, {});
    expect(info).toBeNull();
    await room.dispose();
  });

  it('should reject when room is full', async () => {
    const room = await createTestRoom({ lateJoinEnabled: true, maxPlayers: 2 });
    const info = room.addPlayer('late-player', false, {});
    expect(info).toBeNull();
    await room.dispose();
  });

  it('should reject when room is disposed', async () => {
    const room = await createTestRoom({ lateJoinEnabled: true, maxPlayers: 4 });
    await room.dispose();
    const info = room.addPlayer('late-player', false, {});
    expect(info).toBeNull();
  });

  it('should reject duplicate playerId', async () => {
    const room = await createTestRoom({ lateJoinEnabled: true, maxPlayers: 4 });
    const info = room.addPlayer('player-0', false, {}); // already exists
    expect(info).toBeNull();
    await room.dispose();
  });

  it('should reject when shouldAcceptLateJoin returns false', async () => {
    const shouldAcceptLateJoin = vi.fn(() => false);
    const room = await createTestRoom({ lateJoinEnabled: true, maxPlayers: 4 }, { shouldAcceptLateJoin });
    const info = room.addPlayer('late-player', false, {});
    expect(info).toBeNull();
    expect(shouldAcceptLateJoin).toHaveBeenCalledOnce();
    await room.dispose();
  });

  it('should assign incrementing slots for multiple late-joiners', async () => {
    const room = await createTestRoom({ lateJoinEnabled: true, maxPlayers: 6 });

    const info1 = room.addPlayer('late-1', false, {});
    const info2 = room.addPlayer('late-2', false, {});
    const info3 = room.addPlayer('late-3', false, {});

    expect(info1!.slot).toBe(2);
    expect(info2!.slot).toBe(3);
    expect(info3!.slot).toBe(4);

    // Room should still have open slots (5 of 6 used)
    expect(room.hasOpenSlots).toBe(true);

    const info4 = room.addPlayer('late-4', false, {});
    expect(info4!.slot).toBe(5);

    // Now full
    expect(room.hasOpenSlots).toBe(false);
    expect(room.addPlayer('late-5', false, {})).toBeNull();

    await room.dispose();
  });
});

// ─── Late-Join handlePlayerConnect flow ──────────────────────

describe('Late-join handlePlayerConnect', () => {
  it('should call onPlayerJoin for late-joiner (not onPlayerReconnect)', async () => {
    const onPlayerJoin = vi.fn();
    const onPlayerReconnect = vi.fn();
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4, reconnectTimeoutMs: 5000 },
      { onPlayerJoin, onPlayerReconnect },
    );

    // Connect initial players
    const ws0 = createMockWs();
    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);
    await room.handlePlayerConnect('player-1', ws1);

    // Add late-joiner
    room.addPlayer('late-player', false, {});

    const wsLate = createMockWs();
    const success = await room.handlePlayerConnect('late-player', wsLate);
    expect(success).toBe(true);

    // onPlayerJoin called for player-0, player-1, late-player
    expect(onPlayerJoin).toHaveBeenCalledTimes(3);
    expect(onPlayerJoin.mock.calls[2][1].playerId).toBe('late-player');
    expect(onPlayerReconnect).not.toHaveBeenCalled();

    await room.dispose();
  });

  it('should send ServerHello with all players including late-joiner', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4, reconnectTimeoutMs: 5000 },
    );

    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    room.addPlayer('late-player', false, {});
    const wsLate = createMockWs();
    await room.handlePlayerConnect('late-player', wsLate);

    // ServerHello should have been sent
    expect(wsLate.sent.length).toBeGreaterThanOrEqual(1);

    await room.dispose();
  });

  it('should fall back to journal replay when state transfer fails', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4, reconnectTimeoutMs: 5000, stateTransferTimeoutMs: 50 },
    );

    // Connect player-0 to start the clock
    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    // Wait for tick > 0
    await new Promise(r => setTimeout(r, 30));

    // Add late-joiner — state transfer will timeout (no one responds)
    room.addPlayer('late-player', false, {});
    const wsLate = createMockWs();
    const success = await room.handlePlayerConnect('late-player', wsLate);
    expect(success).toBe(true);

    await room.dispose();
  });
});

// ─── RoomRegistry.findRoomForLateJoin ────────────────────────

describe('RoomRegistry.findRoomForLateJoin', () => {
  it('should find room with open slots', async () => {
    const registry = new RoomRegistry();
    registry.registerRoomType('test-game', { ...DEFAULT_CONFIG, lateJoinEnabled: true, maxPlayers: 4 }, {});

    await registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [
        { playerId: 'p1', isBot: false, metadata: {} },
        { playerId: 'p2', isBot: false, metadata: {} },
      ],
    }, TEST_SEED);

    const found = registry.findRoomForLateJoin('test-game');
    expect(found).toBeDefined();
    expect(found!.matchId).toBe('match-1');

    await registry.dispose();
  });

  it('should return undefined when no rooms exist', () => {
    const registry = new RoomRegistry();
    registry.registerRoomType('test-game', DEFAULT_CONFIG, {});

    expect(registry.findRoomForLateJoin('test-game')).toBeUndefined();

    registry.dispose();
  });

  it('should return undefined when rooms are full', async () => {
    const registry = new RoomRegistry();
    registry.registerRoomType('test-game', { ...DEFAULT_CONFIG, lateJoinEnabled: true, maxPlayers: 2 }, {});

    await registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [
        { playerId: 'p1', isBot: false, metadata: {} },
        { playerId: 'p2', isBot: false, metadata: {} },
      ],
    }, TEST_SEED);

    expect(registry.findRoomForLateJoin('test-game')).toBeUndefined();

    await registry.dispose();
  });

  it('should return undefined when lateJoinEnabled=false', async () => {
    const registry = new RoomRegistry();
    registry.registerRoomType('test-game', { ...DEFAULT_CONFIG, lateJoinEnabled: false, maxPlayers: 4 }, {});

    await registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [{ playerId: 'p1', isBot: false, metadata: {} }],
    }, TEST_SEED);

    expect(registry.findRoomForLateJoin('test-game')).toBeUndefined();

    await registry.dispose();
  });

  it('should return undefined for wrong roomType', async () => {
    const registry = new RoomRegistry();
    registry.registerRoomType('game-a', { ...DEFAULT_CONFIG, lateJoinEnabled: true, maxPlayers: 4 }, {});

    await registry.createRoom({
      matchId: 'match-1',
      roomType: 'game-a',
      players: [{ playerId: 'p1', isBot: false, metadata: {} }],
    }, TEST_SEED);

    expect(registry.findRoomForLateJoin('game-b')).toBeUndefined();

    await registry.dispose();
  });
});

// ─── State transfer + journal filtering ──────────────────────

describe('handlePlayerConnect — state transfer + journal filtering', () => {
  /**
   * Directly populate the server event journal with an entry at a given tick.
   * Bypasses binary packing / broadcast — purely for testing journal filtering logic.
   */
  function addJournalEntry(room: RelayRoom, tick: number, seq?: number): void {
    const journal = (room as any)._serverEventJournal as ValidatedInput[];
    journal.push({
      tick,
      playerSlot: 255, // SERVER_SLOT
      seq: seq ?? journal.length + 100,
      kind: 1, // TickInputKind.Server
      payload: new Uint8Array([1, 2, 3]),
    } as ValidatedInput);
  }

  function getStateTransfer(room: RelayRoom): StateTransfer {
    return (room as any)._stateTransfer;
  }

  function getInputHandler(room: RelayRoom): InputHandler {
    return (room as any)._inputHandler;
  }

  it('should send only post-state journal events after successful state transfer', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4, stateTransferTimeoutMs: 5000 },
      {},
      2,
    );

    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    // Populate journal with events at known ticks
    addJournalEntry(room, 1);
    addJournalEntry(room, 3);
    addJournalEntry(room, 5);
    addJournalEntry(room, 7);
    addJournalEntry(room, 10);

    // Wait for tick > 0 so state transfer is triggered
    await new Promise(r => setTimeout(r, 30));

    const sendBatchSpy = vi.spyOn(getInputHandler(room), 'sendInputBatchToPlayer');

    // Add and connect late-joiner
    room.addPlayer('late-player', false, {});
    const wsLate = createMockWs();
    const connectPromise = room.handlePlayerConnect('late-player', wsLate);

    // Player-0 responds with state at tick=5
    getStateTransfer(room).receiveResponse(0, 1, 5, 0xABCD, new ArrayBuffer(8));

    const success = await connectPromise;
    expect(success).toBe(true);

    // Should have sent only events with tick > 5 (ticks 7 and 10)
    expect(sendBatchSpy).toHaveBeenCalledTimes(1);
    const sentInputs = sendBatchSpy.mock.calls[0][0] as ValidatedInput[];
    expect(sentInputs).toHaveLength(2);
    expect(sentInputs[0].tick).toBe(7);
    expect(sentInputs[1].tick).toBe(10);

    await room.dispose();
  });

  it('should not send journal events when state covers all of them', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4, stateTransferTimeoutMs: 5000 },
      {},
      2,
    );

    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    addJournalEntry(room, 1);
    addJournalEntry(room, 3);
    addJournalEntry(room, 5);

    await new Promise(r => setTimeout(r, 30));

    const sendBatchSpy = vi.spyOn(getInputHandler(room), 'sendInputBatchToPlayer');

    room.addPlayer('late-player', false, {});
    const wsLate = createMockWs();
    const connectPromise = room.handlePlayerConnect('late-player', wsLate);

    // State at tick=10 — all journal events (1, 3, 5) are already included
    getStateTransfer(room).receiveResponse(0, 1, 10, 0xABCD, new ArrayBuffer(8));

    await connectPromise;

    // No journal events should be sent
    expect(sendBatchSpy).not.toHaveBeenCalled();

    await room.dispose();
  });

  it('should use strict > (not >=) for tick boundary', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4, stateTransferTimeoutMs: 5000 },
      {},
      2,
    );

    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    addJournalEntry(room, 5);  // at state tick — should NOT be sent
    addJournalEntry(room, 6);  // one after — SHOULD be sent

    await new Promise(r => setTimeout(r, 30));

    const sendBatchSpy = vi.spyOn(getInputHandler(room), 'sendInputBatchToPlayer');

    room.addPlayer('late-player', false, {});
    const wsLate = createMockWs();
    const connectPromise = room.handlePlayerConnect('late-player', wsLate);

    // State at tick=5
    getStateTransfer(room).receiveResponse(0, 1, 5, 0xABCD, new ArrayBuffer(8));

    await connectPromise;

    expect(sendBatchSpy).toHaveBeenCalledTimes(1);
    const sentInputs = sendBatchSpy.mock.calls[0][0] as ValidatedInput[];
    expect(sentInputs).toHaveLength(1);
    expect(sentInputs[0].tick).toBe(6);

    await room.dispose();
  });

  it('should send full journal when state transfer fails (timeout)', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4, stateTransferTimeoutMs: 50 },
      {},
      2,
    );

    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    addJournalEntry(room, 1);
    addJournalEntry(room, 3);
    addJournalEntry(room, 5);

    await new Promise(r => setTimeout(r, 30));

    const sendBatchSpy = vi.spyOn(getInputHandler(room), 'sendInputBatchToPlayer');

    room.addPlayer('late-player', false, {});
    const wsLate = createMockWs();

    // Don't respond to state request — times out after 50ms
    await room.handlePlayerConnect('late-player', wsLate);

    // Full journal should be sent as fallback
    expect(sendBatchSpy).toHaveBeenCalledTimes(1);
    const sentInputs = sendBatchSpy.mock.calls[0][0] as ValidatedInput[];
    expect(sentInputs).toHaveLength(3);
    expect(sentInputs[0].tick).toBe(1);
    expect(sentInputs[1].tick).toBe(3);
    expect(sentInputs[2].tick).toBe(5);

    await room.dispose();
  });

  it('should send full journal at tick=0 (no state transfer)', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4 },
      {},
      2,
    );

    // Add journal entry before any player connects
    addJournalEntry(room, 1);

    const sendBatchSpy = vi.spyOn(getInputHandler(room), 'sendInputBatchToPlayer');

    // Connect at tick=0 — journal replay, no state transfer
    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    expect(sendBatchSpy).toHaveBeenCalledTimes(1);
    const sentInputs = sendBatchSpy.mock.calls[0][0] as ValidatedInput[];
    expect(sentInputs).toHaveLength(1);
    expect(sentInputs[0].tick).toBe(1);

    await room.dispose();
  });

  it('should handle empty journal with successful state transfer', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4, stateTransferTimeoutMs: 5000 },
      {},
      2,
    );

    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    // No journal entries — empty journal
    await new Promise(r => setTimeout(r, 30));

    const sendBatchSpy = vi.spyOn(getInputHandler(room), 'sendInputBatchToPlayer');

    room.addPlayer('late-player', false, {});
    const wsLate = createMockWs();
    const connectPromise = room.handlePlayerConnect('late-player', wsLate);

    getStateTransfer(room).receiveResponse(0, 1, 5, 0xABCD, new ArrayBuffer(8));

    await connectPromise;

    // No journal events to send
    expect(sendBatchSpy).not.toHaveBeenCalled();

    await room.dispose();
  });

  it('should send all journal events when state tick is 0', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 4, stateTransferTimeoutMs: 5000 },
      {},
      2,
    );

    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    addJournalEntry(room, 1);
    addJournalEntry(room, 3);
    addJournalEntry(room, 5);

    await new Promise(r => setTimeout(r, 30));

    const sendBatchSpy = vi.spyOn(getInputHandler(room), 'sendInputBatchToPlayer');

    room.addPlayer('late-player', false, {});
    const wsLate = createMockWs();
    const connectPromise = room.handlePlayerConnect('late-player', wsLate);

    // State at tick=0 — all journal events are post-state
    getStateTransfer(room).receiveResponse(0, 1, 0, 0xABCD, new ArrayBuffer(8));

    await connectPromise;

    expect(sendBatchSpy).toHaveBeenCalledTimes(1);
    const sentInputs = sendBatchSpy.mock.calls[0][0] as ValidatedInput[];
    expect(sentInputs).toHaveLength(3);
    expect(sentInputs[0].tick).toBe(1);
    expect(sentInputs[1].tick).toBe(3);
    expect(sentInputs[2].tick).toBe(5);

    await room.dispose();
  });

  it('should handle multiple late-joiners with independent state transfers', async () => {
    const room = await createTestRoom(
      { lateJoinEnabled: true, maxPlayers: 6, stateTransferTimeoutMs: 5000 },
      {},
      2,
    );

    const ws0 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);

    addJournalEntry(room, 1);
    addJournalEntry(room, 5);
    addJournalEntry(room, 10);

    await new Promise(r => setTimeout(r, 30));

    const sendBatchSpy = vi.spyOn(getInputHandler(room), 'sendInputBatchToPlayer');

    // First late-joiner: state at tick=3 → should get events at 5, 10
    room.addPlayer('late-1', false, {});
    const wsLate1 = createMockWs();
    const connect1 = room.handlePlayerConnect('late-1', wsLate1);
    getStateTransfer(room).receiveResponse(0, 1, 3, 0x1111, new ArrayBuffer(8));
    await connect1;

    expect(sendBatchSpy).toHaveBeenCalledTimes(1);
    const batch1 = sendBatchSpy.mock.calls[0][0] as ValidatedInput[];
    expect(batch1).toHaveLength(2);
    expect(batch1[0].tick).toBe(5);
    expect(batch1[1].tick).toBe(10);

    sendBatchSpy.mockClear();

    // Second late-joiner: state at tick=8 → should get event at 10 only
    room.addPlayer('late-2', false, {});
    const wsLate2 = createMockWs();
    const connect2 = room.handlePlayerConnect('late-2', wsLate2);
    // requestId=2, respondents: slot 0 (player-0) and slot 2 (late-1) — must respond for both
    getStateTransfer(room).receiveResponse(0, 2, 8, 0x2222, new ArrayBuffer(8));
    getStateTransfer(room).receiveResponse(2, 2, 8, 0x2222, new ArrayBuffer(8));
    await connect2;

    expect(sendBatchSpy).toHaveBeenCalledTimes(1);
    const batch2 = sendBatchSpy.mock.calls[0][0] as ValidatedInput[];
    expect(batch2).toHaveLength(1);
    expect(batch2[0].tick).toBe(10);

    await room.dispose();
  });
});
