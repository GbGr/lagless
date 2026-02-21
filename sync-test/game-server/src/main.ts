import 'reflect-metadata';
import { RoomRegistry, LatencySimulator, type RoomTypeConfig } from '@lagless/relay-server';
import {
  MatchmakingService,
  InMemoryQueueStore,
  type FormedMatch,
  type MatchFoundPlayerData,
} from '@lagless/matchmaking';
import { createLogger, setLogLevel, LogLevel, UUID } from '@lagless/misc';
import { SyncTestInputRegistry } from '@lagless/sync-test-simulation';
import { syncTestHooks } from './sync-test-hooks.js';
import { createWsRouter, type MatchTokenPayload } from './ws-router.js';
import { pack128BufferTo2x64 } from '@lagless/core';

setLogLevel(LogLevel.Debug);

const log = createLogger('SyncTestServer');

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function corsJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

const PORT = Number(process.env.PORT ?? 3334);
const INSTANCE_ID = crypto.randomUUID().slice(0, 8);

const SYNC_TEST_CONFIG: RoomTypeConfig = {
  maxPlayers: 4,
  tickRateHz: 60,
  maxFutureTicks: 20,
  lateJoinEnabled: true,
  reconnectTimeoutMs: 30_000,
  stateTransferTimeoutMs: 5_000,
};

const roomRegistry = new RoomRegistry();
roomRegistry.registerRoomType('sync-test', SYNC_TEST_CONFIG, syncTestHooks, SyncTestInputRegistry);

function generateToken(playerId: string, matchId: string, playerSlot: number): string {
  return btoa(JSON.stringify({ playerId, matchId, playerSlot, exp: Date.now() + 60_000 }));
}

function validateToken(token: string): MatchTokenPayload | null {
  try {
    const p = JSON.parse(atob(token));
    if (typeof p.exp === 'number' && p.exp < Date.now()) return null;
    return { playerId: p.playerId, matchId: p.matchId, playerSlot: p.playerSlot };
  } catch {
    return null;
  }
}

const matchmaking = new MatchmakingService(new InMemoryQueueStore());

matchmaking.registerScope('sync-test', {
  minPlayersToStart: 1,
  maxPlayers: 4,
  waitTimeoutMs: 2_000,
});

matchmaking.setOnMatchFormed(async (match: FormedMatch) => {
  const { matchId, scope, players } = match;
  log.info(`Match formed: ${matchId} (${players.length}P, no bots)`);

  const allPlayers = players.map((p) => ({
    playerId: p.playerId,
    isBot: false,
    metadata: p.metadata as Record<string, unknown>,
  }));

  const { seed0, seed1 } = pack128BufferTo2x64(UUID.fromString(matchId).asUint8());

  await roomRegistry.createRoom(
    { matchId, roomType: scope, players: allPlayers },
    seed0,
    seed1,
    JSON.stringify({ gameType: scope }),
  );

  const result = new Map<string, MatchFoundPlayerData>();
  let slot = 0;
  for (const p of allPlayers) {
    result.set(p.playerId, {
      playerSlot: slot,
      token: generateToken(p.playerId, matchId, slot),
      serverUrl: `ws://localhost:${PORT}`,
    });
    slot++;
  }

  return result;
});

matchmaking.setTryLateJoin((playerId, scope, metadata) => {
  const room = roomRegistry.findRoomForLateJoin(scope);
  if (!room) return null;

  const playerInfo = room.addPlayer(playerId, false, metadata);
  if (!playerInfo) return null;

  return {
    matchId: room.matchId,
    playerData: {
      playerSlot: playerInfo.slot,
      token: generateToken(playerId, room.matchId, playerInfo.slot),
      serverUrl: `ws://localhost:${PORT}`,
    },
  };
});

matchmaking.setCheckInterval(500);
matchmaking.start();

let latencySimulator: LatencySimulator | null = null;

function applySimulatorToAllRooms(sim: LatencySimulator | null): void {
  roomRegistry.forEachRoom((room) => {
    room.latencySimulator = sim;
  });
}

const _origCreateRoom = roomRegistry.createRoom.bind(roomRegistry);
roomRegistry.createRoom = async (...args: Parameters<typeof roomRegistry.createRoom>) => {
  const room = await _origCreateRoom(...args);
  room.latencySimulator = latencySimulator;
  return room;
};

const wsRouter = createWsRouter(roomRegistry, matchmaking, validateToken);

Bun.serve({
  port: PORT,

  async fetch(req, server) {
    const wsResp = wsRouter.handleUpgrade(req, server);
    if (wsResp !== undefined) return wsResp;

    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        instance: INSTANCE_ID,
        rooms: roomRegistry.roomCount,
        queue: matchmaking.getQueueCount('sync-test'),
      });
    }

    if (url.pathname === '/api/player/auth/instant' && req.method === 'POST') {
      const playerId = crypto.randomUUID();
      const token = btoa(JSON.stringify({ playerId, exp: Date.now() + 86_400_000 }));
      return corsJson({
        token,
        player: {
          id: playerId,
          username: `Player-${playerId.slice(0, 4)}`,
          score: 0,
          data: {},
        },
      });
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/api/latency') {
      if (req.method === 'GET') {
        return Response.json(
          latencySimulator?.config ?? { delayMs: 0, jitterMs: 0, packetLossPercent: 0 },
        );
      }

      if (req.method === 'POST') {
        const body = (await req.json()) as Record<string, unknown>;
        const delayMs = Number(body.delayMs ?? 0);
        const jitterMs = Number(body.jitterMs ?? 0);
        const packetLossPercent = Number(body.packetLossPercent ?? 0);

        if (delayMs === 0 && jitterMs === 0 && packetLossPercent === 0) {
          latencySimulator = null;
          applySimulatorToAllRooms(null);
          log.info('Latency simulator disabled');
        } else {
          if (latencySimulator) {
            latencySimulator.setDelay(delayMs);
            latencySimulator.setJitter(jitterMs);
            latencySimulator.setPacketLoss(packetLossPercent);
          } else {
            latencySimulator = new LatencySimulator({ delayMs, jitterMs, packetLossPercent });
          }
          applySimulatorToAllRooms(latencySimulator);
          log.info(`Latency simulator: delay=${delayMs}ms jitter=${jitterMs}ms loss=${packetLossPercent}%`);
        }

        return Response.json(
          latencySimulator?.config ?? { delayMs: 0, jitterMs: 0, packetLossPercent: 0 },
        );
      }
    }

    return new Response('Not found', { status: 404 });
  },

  websocket: wsRouter.websocket,
});

log.info(`Sync Test Server on http://localhost:${PORT} [${INSTANCE_ID}]`);
