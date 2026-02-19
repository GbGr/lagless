import type { ServerWebSocket } from 'bun';
import { createLogger } from '@lagless/misc';
import type { RoomRegistry } from '@lagless/relay-server';
import type { MatchmakingService } from '@lagless/matchmaking';

const log = createLogger('WsRouter');

// ─── Connection Data ────────────────────────────────────────

export type WsData =
  | { readonly type: 'matchmaking'; playerId: string; scope: string | null }
  | { readonly type: 'match'; matchId: string; playerId: string; playerSlot: number };

// ─── Token Validation ───────────────────────────────────────

export interface MatchTokenPayload {
  playerId: string;
  matchId: string;
  playerSlot: number;
}

export type ValidateMatchToken = (token: string) => MatchTokenPayload | null;

// ─── WS Router ──────────────────────────────────────────────

/**
 * Creates Bun WebSocket handlers that multiplex between
 * matchmaking and relay connections based on ws.data.type.
 */
export function createWsRouter(
  roomRegistry: RoomRegistry,
  matchmaking: MatchmakingService,
  validateMatchToken: ValidateMatchToken,
) {
  return {
    /**
     * Handle HTTP upgrade requests for WebSocket connections.
     * Returns Response if handled, undefined if not a WS route.
     */
    handleUpgrade(
      req: Request,
      server: { upgrade: (req: Request, opts: { data: WsData }) => boolean },
    ): Response | undefined {
      const url = new URL(req.url);

      // Matchmaking WebSocket: /matchmaking?playerId=...
      if (url.pathname === '/matchmaking') {
        const playerId = url.searchParams.get('playerId');
        if (!playerId) {
          return new Response('Missing playerId', { status: 400 });
        }

        const upgraded = server.upgrade(req, {
          data: { type: 'matchmaking', playerId, scope: null },
        });

        return upgraded ? undefined : new Response('Upgrade failed', { status: 500 });
      }

      // Relay match WebSocket: /match/:matchId?token=...
      const matchRoute = url.pathname.match(/^\/match\/([a-f0-9-]+)$/);
      if (matchRoute) {
        const matchId = matchRoute[1];
        const token = url.searchParams.get('token');
        if (!token) {
          return new Response('Missing token', { status: 401 });
        }

        const payload = validateMatchToken(token);
        if (!payload || payload.matchId !== matchId) {
          return new Response('Invalid token', { status: 403 });
        }

        const room = roomRegistry.getRoom(matchId);
        if (!room) {
          return new Response('Room not found', { status: 404 });
        }

        const upgraded = server.upgrade(req, {
          data: {
            type: 'match',
            matchId,
            playerId: payload.playerId,
            playerSlot: payload.playerSlot,
          },
        });

        return upgraded ? undefined : new Response('Upgrade failed', { status: 500 });
      }

      return undefined; // Not a WS route
    },

    /**
     * Bun WebSocket handler object.
     */
    websocket: {
      open(ws: ServerWebSocket<WsData>) {
        const { data } = ws;

        if (data.type === 'match') {
          const room = roomRegistry.getRoom(data.matchId);
          if (room) {
            room.handlePlayerConnect(data.playerId, {
              sendBinary: (msg: Uint8Array) => ws.sendBinary(msg),
              close: () => ws.close(),
            });
          }
        }

        // Matchmaking: nothing to do on open — client sends join message
      },

      message(ws: ServerWebSocket<WsData>, message: string | ArrayBuffer) {
        const { data } = ws;

        if (data.type === 'match' && message instanceof ArrayBuffer) {
          const room = roomRegistry.getRoom(data.matchId);
          room?.handleMessage(data.playerId, message);
          return;
        }

        if (data.type === 'matchmaking' && typeof message === 'string') {
          handleMatchmakingMessage(ws, data, message, matchmaking);
          return;
        }
      },

      close(ws: ServerWebSocket<WsData>) {
        const { data } = ws;

        if (data.type === 'match') {
          const room = roomRegistry.getRoom(data.matchId);
          room?.handlePlayerDisconnect(data.playerId);
        }

        if (data.type === 'matchmaking') {
          matchmaking.removePlayer(data.playerId);
        }
      },
    },
  };
}

// ─── Matchmaking Message Handler ────────────────────────────

interface JoinMessage {
  type: 'join';
  scope: string;
  mmr?: number;
  metadata?: Record<string, unknown>;
}

function handleMatchmakingMessage(
  ws: ServerWebSocket<WsData>,
  data: WsData & { type: 'matchmaking' },
  raw: string,
  matchmaking: MatchmakingService,
): void {
  let msg: JoinMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    return;
  }

  if (msg.type === 'join') {
    data.scope = msg.scope;

    matchmaking.addPlayer(
      data.playerId,
      msg.scope,
      msg.mmr ?? 1000,
      msg.metadata ?? {},
      (notification) => {
        ws.send(JSON.stringify(notification));
      },
    );
  }
}
