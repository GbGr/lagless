import 'reflect-metadata';
import { RelayGameServer, type RouteHandler } from '@lagless/relay-game-server';
import { setupDevTools } from '@lagless/dev-tools';
import { CircleSumoInputRegistry } from '@lagless/circle-sumo-simulation';
import { circleSumoHooks } from './circle-sumo-hooks.js';

// ─── Custom Routes (login, me) ──────────────────────────────

const loginRoute: RouteHandler = (req, url, helpers) => {
  if (url.pathname === '/api/player/login' && req.method === 'POST') {
    const authHeader = req.headers.get('Authorization');
    const bearerToken = authHeader?.replace('Bearer ', '') ?? '';
    try {
      const payload = JSON.parse(atob(bearerToken));
      if (payload.exp < Date.now()) return helpers.corsJson({ error: 'expired' }, 401);
      return helpers.corsJson({
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
      return helpers.corsJson({ error: 'invalid' }, 401);
    }
  }
  return null;
};

const meRoute: RouteHandler = (req, url, helpers) => {
  if (url.pathname === '/api/player/me' && req.method === 'GET') {
    const authHeader = req.headers.get('Authorization');
    const bearerToken = authHeader?.replace('Bearer ', '') ?? '';
    try {
      const payload = JSON.parse(atob(bearerToken));
      return helpers.corsJson({
        player: {
          id: payload.playerId,
          username: `Player-${payload.playerId.slice(0, 4)}`,
          score: 100,
          data: { selectedSkinId: 0 },
          ownedSkins: [0, 1, 2],
        },
      });
    } catch {
      return helpers.corsJson({ error: 'unauthorized' }, 401);
    }
  }
  return null;
};

// ─── Server ─────────────────────────────────────────────────

const server = new RelayGameServer({
  port: Number(process.env.PORT ?? 3333),
  loggerName: 'CircleSumoServer',
  roomType: {
    name: 'circle-sumo',
    config: {
      maxPlayers: 4,
      tickRateHz: 60,
      maxFutureTicks: 20,
      lateJoinEnabled: true,
      reconnectTimeoutMs: 15_000,
      stateTransferTimeoutMs: 5_000,
    },
    hooks: circleSumoHooks,
    inputRegistry: CircleSumoInputRegistry,
  },
  matchmaking: {
    scope: 'circle-sumo',
    config: { minPlayersToStart: 1, maxPlayers: 4, waitTimeoutMs: 7_000 },
    fillBots: true,
  },
  initialLatency: { delayMs: 200, jitterMs: 50, packetLossPercent: 0 },
  authResponseCustomizer: () => ({
    data: { selectedSkinId: Math.floor(Math.random() * 27) },
    ownedSkins: [0, 1, 2],
  }),
  customRoutes: [loginRoute, meRoute],
});

setupDevTools(server);
server.start();
