import { RoomRegistry, LatencySimulator } from '@lagless/relay-server';
import {
  MatchmakingService,
  InMemoryQueueStore,
  type FormedMatch,
  type MatchFoundPlayerData,
} from '@lagless/matchmaking';
import { createLogger, setLogLevel, LogLevel, UUID } from '@lagless/misc';
import { createWsRouter } from './ws-router.js';
import { generateToken, validateToken } from './token.js';
import { corsHeaders, corsJson } from './cors.js';
import { setupLatencySimulator, handleLatencyEndpoint, type LatencyState } from './latency-setup.js';
import type { RelayGameServerConfig, RouteHelpers } from './types.js';

export class RelayGameServer {
  private readonly _config: RelayGameServerConfig;
  private readonly _roomRegistry: RoomRegistry;
  private readonly _matchmaking: MatchmakingService;
  private readonly _latencyState: LatencyState;

  constructor(config: RelayGameServerConfig) {
    this._config = config;

    setLogLevel(LogLevel.Debug);

    const log = createLogger(config.loggerName);

    // ─── Room Registry ────────────────────────────────────
    this._roomRegistry = new RoomRegistry();
    this._roomRegistry.registerRoomType(
      config.roomType.name,
      config.roomType.config,
      config.roomType.hooks,
      config.roomType.inputRegistry,
    );

    // ─── Matchmaking ──────────────────────────────────────
    this._matchmaking = new MatchmakingService(new InMemoryQueueStore());

    this._matchmaking.registerScope(config.matchmaking.scope, config.matchmaking.config);

    const port = config.port;
    const roomRegistry = this._roomRegistry;
    const fillBots = config.matchmaking.fillBots ?? false;

    this._matchmaking.setOnMatchFormed(async (match: FormedMatch) => {
      const { matchId, scope, players, botsNeeded } = match;

      const allPlayers = [
        ...players.map((p) => ({
          playerId: p.playerId,
          isBot: false,
          metadata: p.metadata as Record<string, unknown>,
        })),
        ...(fillBots
          ? Array.from({ length: botsNeeded }, () => ({
              playerId: crypto.randomUUID(),
              isBot: true,
              metadata: {},
            }))
          : []),
      ];

      log.info(`Match formed: ${matchId} (${players.length}P${fillBots ? ` + ${botsNeeded}B` : ''})`);

      const seed = UUID.fromString(matchId).asUint8();

      await roomRegistry.createRoom(
        { matchId, roomType: scope, players: allPlayers },
        seed,
        JSON.stringify({ gameType: scope }),
      );

      const result = new Map<string, MatchFoundPlayerData>();
      let slot = 0;
      for (const p of allPlayers) {
        if (!p.isBot) {
          result.set(p.playerId, {
            playerSlot: slot,
            token: generateToken(p.playerId, matchId, slot),
            serverUrl: `ws://localhost:${port}`,
          });
        }
        slot++;
      }

      return result;
    });

    this._matchmaking.setTryLateJoin((playerId, scope, metadata) => {
      const room = roomRegistry.findRoomForLateJoin(scope);
      if (!room) return null;

      const playerInfo = room.addPlayer(playerId, false, metadata);
      if (!playerInfo) return null;

      return {
        matchId: room.matchId,
        playerData: {
          playerSlot: playerInfo.slot,
          token: generateToken(playerId, room.matchId, playerInfo.slot),
          serverUrl: `ws://localhost:${port}`,
        },
      };
    });

    this._matchmaking.setCheckInterval(config.matchmaking.checkIntervalMs ?? 500);

    // ─── Latency Simulator ────────────────────────────────
    this._latencyState = {
      simulator: config.initialLatency
        ? new LatencySimulator(config.initialLatency)
        : null,
    };

    setupLatencySimulator(this._roomRegistry, this._latencyState);
  }

  public start(): void {
    const config = this._config;
    const log = createLogger(config.loggerName);
    const instanceId = crypto.randomUUID().slice(0, 8);
    const roomRegistry = this._roomRegistry;
    const matchmaking = this._matchmaking;
    const latencyState = this._latencyState;
    const customRoutes = config.customRoutes ?? [];
    const authCustomizer = config.authResponseCustomizer;

    const helpers: RouteHelpers = { corsHeaders, corsJson };

    matchmaking.start();

    const wsRouter = createWsRouter(roomRegistry, matchmaking, validateToken);

    Bun.serve({
      port: config.port,

      async fetch(req, server) {
        const wsResp = wsRouter.handleUpgrade(req, server);
        if (wsResp !== undefined) return wsResp;

        const url = new URL(req.url);

        // Health
        if (url.pathname === '/health') {
          return Response.json({
            status: 'ok',
            instance: instanceId,
            rooms: roomRegistry.roomCount,
            queue: matchmaking.getQueueCount(config.matchmaking.scope),
          });
        }

        // Mock Player Auth
        if (url.pathname === '/api/player/auth/instant' && req.method === 'POST') {
          const playerId = crypto.randomUUID();
          const token = btoa(JSON.stringify({ playerId, exp: Date.now() + 86_400_000 }));
          const extra = authCustomizer ? authCustomizer(playerId) : {};
          return corsJson({
            token,
            player: {
              id: playerId,
              username: `Player-${playerId.slice(0, 4)}`,
              score: 0,
              ...extra,
            },
          });
        }

        // CORS preflight
        if (req.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: corsHeaders() });
        }

        // Latency endpoint
        if (url.pathname === '/api/latency') {
          const resp = handleLatencyEndpoint(req, roomRegistry, latencyState, log);
          if (resp) return resp;
        }

        // Custom routes
        for (const handler of customRoutes) {
          const resp = handler(req, url, helpers);
          if (resp) return resp;
        }

        return new Response('Not found', { status: 404 });
      },

      websocket: wsRouter.websocket,
    });

    log.info(`${config.loggerName} on http://localhost:${config.port} [${instanceId}]`);
  }

  public get roomRegistry(): RoomRegistry {
    return this._roomRegistry;
  }

  public get matchmaking(): MatchmakingService {
    return this._matchmaking;
  }
}
