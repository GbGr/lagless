import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServerClock } from './server-clock.js';
import { PlayerConnection } from './player-connection.js';
import { RelayRoom } from './relay-room.js';
import { RoomRegistry } from './room-registry.js';
import { StateTransfer } from './state-transfer.js';
import {
  type RoomTypeConfig, type RoomHooks, type PlayerInfo,
  type IWebSocket,
  LeaveReason,
} from './types.js';

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

function createTestRoom(
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

  return new RelayRoom(
    'test-match-id',
    fullConfig,
    hooks,
    players,
    1.23456,
    7.89012,
    '{"gameType":"test"}',
  );
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
});

// ─── RelayRoom ──────────────────────────────────────────────

describe('RelayRoom', () => {
  it('should create room with correct state', () => {
    const room = createTestRoom();
    expect(room.isDisposed).toBe(false);
    expect(room.matchId).toBe('test-match-id');
    expect(room.tick).toBeGreaterThanOrEqual(0);
  });

  it('should call onRoomCreated hook', () => {
    const onRoomCreated = vi.fn();
    createTestRoom({}, { onRoomCreated });
    expect(onRoomCreated).toHaveBeenCalledOnce();
  });

  it('should handle player connect', async () => {
    const onPlayerJoin = vi.fn();
    const room = createTestRoom({}, { onPlayerJoin });

    const ws = createMockWs();
    const success = await room.handlePlayerConnect('player-0', ws);

    expect(success).toBe(true);
    expect(onPlayerJoin).toHaveBeenCalledOnce();
    expect(onPlayerJoin.mock.calls[0][1].playerId).toBe('player-0');
    // Should have received ServerHello
    expect(ws.sent.length).toBe(1);
  });

  it('should reject unknown player', async () => {
    const room = createTestRoom();
    const ws = createMockWs();
    const success = await room.handlePlayerConnect('unknown-player', ws);
    expect(success).toBe(false);
  });

  it('should reject duplicate connection', async () => {
    const room = createTestRoom();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    await room.handlePlayerConnect('player-0', ws1);
    const success = await room.handlePlayerConnect('player-0', ws2);
    expect(success).toBe(false);
  });

  it('should handle player disconnect', async () => {
    const onPlayerLeave = vi.fn();
    const room = createTestRoom({}, { onPlayerLeave });

    const ws = createMockWs();
    await room.handlePlayerConnect('player-0', ws);

    room.handlePlayerDisconnect('player-0');
    expect(onPlayerLeave).toHaveBeenCalledOnce();
    expect(onPlayerLeave.mock.calls[0][2]).toBe(LeaveReason.Disconnected);
  });

  it('should call onMatchEnd when all humans disconnect', async () => {
    const onMatchEnd = vi.fn();
    const room = createTestRoom({}, { onMatchEnd });

    const ws0 = createMockWs();
    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws0);
    await room.handlePlayerConnect('player-1', ws1);

    room.handlePlayerDisconnect('player-0');
    expect(onMatchEnd).not.toHaveBeenCalled();

    room.handlePlayerDisconnect('player-1');
    // endMatch is async — give it a microtask to complete
    await vi.waitFor(() => {
      expect(onMatchEnd).toHaveBeenCalledOnce();
      expect(room.isDisposed).toBe(true);
    });
  });

  it('should allow reconnect when configured', async () => {
    const room = createTestRoom({ reconnectTimeoutMs: 5000 });
    const ws1 = createMockWs();
    await room.handlePlayerConnect('player-0', ws1);
    room.handlePlayerDisconnect('player-0');

    const ws2 = createMockWs();
    const success = await room.handlePlayerConnect('player-0', ws2);
    expect(success).toBe(true);
    // ServerHello sent on reconnect
    expect(ws2.sent.length).toBeGreaterThanOrEqual(1);
  });

  it('should dispose cleanly', async () => {
    const onRoomDisposed = vi.fn();
    const room = createTestRoom({}, { onRoomDisposed });
    await room.dispose();

    expect(room.isDisposed).toBe(true);
    expect(onRoomDisposed).toHaveBeenCalledOnce();

    // Double dispose should be no-op
    await room.dispose();
    expect(onRoomDisposed).toHaveBeenCalledOnce();
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

  it('should create rooms', () => {
    const room = registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [
        { playerId: 'p1', isBot: false, metadata: {} },
        { playerId: 'p2', isBot: true, metadata: {} },
      ],
    }, 1.0, 2.0);

    expect(room.matchId).toBe('match-1');
    expect(registry.roomCount).toBe(1);
    expect(registry.getRoom('match-1')).toBe(room);
  });

  it('should throw on duplicate match ID', () => {
    registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [{ playerId: 'p1', isBot: false, metadata: {} }],
    }, 0, 0);

    expect(() => registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [{ playerId: 'p2', isBot: false, metadata: {} }],
    }, 0, 0)).toThrow(/already exists/);
  });

  it('should throw for unknown room type', () => {
    expect(() => registry.createRoom({
      matchId: 'match-1',
      roomType: 'unknown',
      players: [],
    }, 0, 0)).toThrow(/Unknown room type/);
  });

  it('should dispose all rooms', async () => {
    registry.createRoom({
      matchId: 'match-1',
      roomType: 'test-game',
      players: [{ playerId: 'p1', isBot: false, metadata: {} }],
    }, 0, 0);

    registry.createRoom({
      matchId: 'match-2',
      roomType: 'test-game',
      players: [{ playerId: 'p2', isBot: false, metadata: {} }],
    }, 0, 0);

    expect(registry.roomCount).toBe(2);
    await registry.dispose();
    expect(registry.roomCount).toBe(0);
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
