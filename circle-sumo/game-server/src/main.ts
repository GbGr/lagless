import 'reflect-metadata';
import { RoomRegistry, LatencySimulator, type RoomTypeConfig } from '@lagless/relay-server';
import {
  MatchmakingService,
  InMemoryQueueStore,
  type FormedMatch,
  type MatchFoundPlayerData,
} from '@lagless/matchmaking';
import { createLogger, setLogLevel, LogLevel, UUID } from '@lagless/misc';
import { CircleSumoInputRegistry } from '@lagless/circle-sumo-simulation';
import { circleSumoHooks } from './circle-sumo-hooks.js';
import { createWsRouter, type MatchTokenPayload } from './ws-router.js';
import { pack128BufferTo2x64 } from '@lagless/core';

setLogLevel(LogLevel.Debug);

const log = createLogger('GameServer');

// ─── CORS helpers ───────────────────────────────────────────

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

// ─── Configuration ──────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3333);
const INSTANCE_ID = crypto.randomUUID().slice(0, 8);

const CIRCLE_SUMO_CONFIG: RoomTypeConfig = {
  maxPlayers: 4,
  tickRateHz: 60,
  maxFutureTicks: 20,
  lateJoinEnabled: true,
  reconnectTimeoutMs: 15_000,
  stateTransferTimeoutMs: 5_000,
};

// ─── Room Registry ──────────────────────────────────────────

const roomRegistry = new RoomRegistry();
roomRegistry.registerRoomType('circle-sumo', CIRCLE_SUMO_CONFIG, circleSumoHooks, CircleSumoInputRegistry);

// ─── Token (simplified — use JWT in production) ─────────────

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

// ─── Matchmaking ────────────────────────────────────────────

const matchmaking = new MatchmakingService(new InMemoryQueueStore());

matchmaking.registerScope('circle-sumo', {
  minPlayersToStart: 1, // allow solo play (filled with bots)
  maxPlayers: 4,
  waitTimeoutMs: 7_000,
});

matchmaking.setOnMatchFormed(async (match: FormedMatch) => {
  const { matchId, scope, players, botsNeeded } = match;
  log.info(`Match formed: ${matchId} (${players.length}P + ${botsNeeded}B)`);

  // Build player list
  const allPlayers = [
    ...players.map((p) => ({
      playerId: p.playerId,
      isBot: false,
      metadata: p.metadata as Record<string, unknown>,
    })),
    ...Array.from({ length: botsNeeded }, () => ({
      playerId: crypto.randomUUID(),
      isBot: true,
      metadata: {},
    })),
  ];

  // Seed from match UUID
  const { seed0, seed1 } = pack128BufferTo2x64(UUID.fromString(matchId).asUint8());

  // Create room
  roomRegistry.createRoom(
    { matchId, roomType: scope, players: allPlayers },
    seed0,
    seed1,
    JSON.stringify({ gameType: scope })
  );

  // Return per-player data with tokens
  const result = new Map<string, MatchFoundPlayerData>();
  let slot = 0;
  for (const p of allPlayers) {
    if (!p.isBot) {
      result.set(p.playerId, {
        playerSlot: slot,
        token: generateToken(p.playerId, matchId, slot),
        serverUrl: `ws://localhost:${PORT}`,
      });
    }
    slot++;
  }

  return result;
});

matchmaking.setCheckInterval(500);
matchmaking.start();

// ─── Latency Simulator ───────────────────────────────────────

let latencySimulator: LatencySimulator | null = new LatencySimulator({ delayMs: 200, jitterMs: 50, packetLossPercent: 0 });

function applySimulatorToAllRooms(sim: LatencySimulator | null): void {
  roomRegistry.forEachRoom((room) => {
    room.latencySimulator = sim;
  });
}

// Hook into room creation so new rooms get the simulator too
const _origCreateRoom = roomRegistry.createRoom.bind(roomRegistry);
roomRegistry.createRoom = (...args: Parameters<typeof roomRegistry.createRoom>) => {
  const room = _origCreateRoom(...args);
  room.latencySimulator = latencySimulator;
  return room;
};

// ─── WebSocket + HTTP ───────────────────────────────────────

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
        queue: matchmaking.getQueueCount('circle-sumo'),
      });
    }

    // ─── Mock Player Auth (for dev/testing) ─────────────
    if (url.pathname === '/api/player/auth/instant' && req.method === 'POST') {
      const playerId = crypto.randomUUID();
      const token = btoa(JSON.stringify({ playerId, exp: Date.now() + 86_400_000 }));
      return corsJson({
        token,
        player: {
          id: playerId,
          username: `Player-${playerId.slice(0, 4)}`,
          score: 0,
          data: { selectedSkinId: Math.floor(Math.random() * 27) },
          ownedSkins: [0, 1, 2],
        },
      });
    }

    if (url.pathname === '/api/player/login' && req.method === 'POST') {
      // Re-validate existing token from header
      const authHeader = req.headers.get('Authorization');
      const bearerToken = authHeader?.replace('Bearer ', '') ?? '';
      try {
        const payload = JSON.parse(atob(bearerToken));
        if (payload.exp < Date.now()) return corsJson({ error: 'expired' }, 401);
        return corsJson({
          token: bearerToken,
          player: {
            id: payload.playerId,
            username: `Player-${payload.playerId.slice(0, 4)}`,
            score: 100,
            data: { selectedSkinId: 0 },
            ownedSkins: [0, 1, 2],
          },
        });
      } catch {
        return corsJson({ error: 'invalid' }, 401);
      }
    }

    if (url.pathname === '/api/player/me' && req.method === 'GET') {
      const authHeader = req.headers.get('Authorization');
      const bearerToken = authHeader?.replace('Bearer ', '') ?? '';
      try {
        const payload = JSON.parse(atob(bearerToken));
        return corsJson({
          player: {
            id: payload.playerId,
            username: `Player-${payload.playerId.slice(0, 4)}`,
            score: 100,
            data: { selectedSkinId: 0 },
            ownedSkins: [0, 1, 2],
          },
        });
      } catch {
        return corsJson({ error: 'unauthorized' }, 401);
      }
    }

    // CORS preflight for all /api routes
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname === '/api/latency') {
      if (req.method === 'GET') {
        return Response.json(latencySimulator?.config ?? { delayMs: 0, jitterMs: 0, packetLossPercent: 0 });
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

        return Response.json(latencySimulator?.config ?? { delayMs: 0, jitterMs: 0, packetLossPercent: 0 });
      }
    }

    return new Response('Not found', { status: 404 });
  },

  websocket: wsRouter.websocket,
});

log.info(`Circle Sumo Server on http://localhost:${PORT} [${INSTANCE_ID}]`);
