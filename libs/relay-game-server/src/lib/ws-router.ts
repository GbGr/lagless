import type { ServerWebSocket } from 'bun';
import { createLogger } from '@lagless/misc';
import type { RoomRegistry } from '@lagless/relay-server';
import type { MatchmakingService } from '@lagless/matchmaking';
import type { MatchmakingAuthResult } from './types.js';

const log = createLogger('WsRouter');

// ─── Connection Data ────────────────────────────────────────

export type WsData =
  | { readonly type: 'matchmaking'; playerId: string; scope: string | null; authMetadata?: Readonly<Record<string, unknown>> }
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
export type AuthenticatePlayer = (req: Request) => MatchmakingAuthResult | Promise<MatchmakingAuthResult | null> | null;

export function createWsRouter(
  roomRegistry: RoomRegistry,
  matchmaking: MatchmakingService,
  validateMatchToken: ValidateMatchToken,
  authenticatePlayer?: AuthenticatePlayer,
) {
  return {
    /**
     * Handle HTTP upgrade requests for WebSocket connections.
     * Returns Response if handled, undefined if not a WS route.
     */
    async handleUpgrade(
      req: Request,
      server: { upgrade: (req: Request, opts: { data: WsData }) => boolean }
    ): Promise<Response | undefined> {
      const url = new URL(req.url);

      // Matchmaking WebSocket
      if (url.pathname === '/matchmaking') {
        let playerId: string;
        let authMetadata: Readonly<Record<string, unknown>> | undefined;

        if (authenticatePlayer) {
          const result = await authenticatePlayer(req);
          if (!result) {
            return new Response('Unauthorized', { status: 401 });
          }
          playerId = result.playerId;
          authMetadata = result.metadata;
        } else {
          // Fallback: trust ?playerId= query param (dev / no-auth mode)
          const qsPlayerId = url.searchParams.get('playerId');
          if (!qsPlayerId) {
            return new Response('Missing playerId', { status: 400 });
          }
          playerId = qsPlayerId;
        }

        const upgraded = server.upgrade(req, {
          data: { type: 'matchmaking', playerId, scope: null, authMetadata },
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
          // Bun delivers binary as Buffer by default. Switch to ArrayBuffer
          // so `message instanceof ArrayBuffer` works in the message handler.
          ws.binaryType = 'arraybuffer';

          const room = roomRegistry.getRoom(data.matchId);
          if (!room) {
            log.warn(`open: room ${data.matchId} not found for player ${data.playerId}`);
            ws.close();
            return;
          }

          log.info(`open: player=${data.playerId} slot=${data.playerSlot} match=${data.matchId}`);

          room
            .handlePlayerConnect(data.playerId, {
              sendBinary: (msg: Uint8Array) => ws.sendBinary(msg),
              close: () => ws.close(),
            })
            .catch((err) => log.error(`handlePlayerConnect error: ${err}`));
        }

        // Matchmaking: nothing to do on open — client sends join message
      },

      message(ws: ServerWebSocket<WsData>, message: string | Buffer<ArrayBuffer>) {
        const { data } = ws;

        if (data.type === 'match') {
          const room = roomRegistry.getRoom(data.matchId);
          if (!room) {
            log.warn(`message: room ${data.matchId} gone`);
            return;
          }

          const messageArrayBuffer: ArrayBuffer | null = message instanceof ArrayBuffer
              ? message
              : null;

          if (messageArrayBuffer === null) {
            log.warn(`message: expected binary message for match ${data.matchId}, got text`);
            return;
          }

          room.handleMessage(data.playerId, messageArrayBuffer);
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
          log.info(`close: player=${data.playerId} match=${data.matchId}`);
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

    // Auth metadata (server-verified) takes precedence over client join metadata
    const metadata = data.authMetadata
      ? { ...(msg.metadata ?? {}), ...data.authMetadata }
      : (msg.metadata ?? {});

    matchmaking.addPlayer(
      data.playerId,
      msg.scope,
      msg.mmr ?? 1000,
      metadata,
      (notification) => {
        ws.send(JSON.stringify(notification));
      },
    );
  }
}
