import type { RoomTypeConfig, RoomHooks, InputRegistry } from '@lagless/relay-server';
import type { ScopeConfig } from '@lagless/matchmaking';

/** Result of a successful matchmaking authentication. */
export interface MatchmakingAuthResult {
  /** Verified player identity. */
  readonly playerId: string;
  /** Extra data merged into the matchmaking queue entry (auth takes precedence over client join metadata). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RelayGameServerConfig {
  port: number;
  loggerName: string;
  roomType: {
    name: string;
    config: RoomTypeConfig;
    hooks: RoomHooks<unknown>;
    inputRegistry: InputRegistry;
  };
  matchmaking: {
    scope: string;
    config: ScopeConfig;
    fillBots?: boolean;
    checkIntervalMs?: number;
    /**
     * Authenticate a player during WebSocket upgrade for matchmaking.
     * Receives the raw HTTP request — extract credentials however you like
     * (query params, headers, cookies) and return the verified playerId.
     *
     * Return `null` to reject the connection (401).
     * When omitted, falls back to `?playerId=` query param (no auth).
     *
     * Returned `metadata` is merged (auth-first) with metadata from the
     * client's `join` message before the player enters the matchmaking queue.
     */
    authenticatePlayer?: (req: Request) => MatchmakingAuthResult | Promise<MatchmakingAuthResult | null> | null;
  };
  initialLatency?: { delayMs: number; jitterMs: number; packetLossPercent: number } | null;
  /** Enable SO_REUSEPORT — allows multiple processes to bind the same port (Linux). Required for PM2/cluster multi-instance. */
  reusePort?: boolean;
  authResponseCustomizer?: (playerId: string) => Record<string, unknown>;
  customRoutes?: RouteHandler[];
}

export interface RouteHelpers {
  corsHeaders(): Record<string, string>;
  corsJson(data: unknown, status?: number): Response;
}

export type RouteHandler = (req: Request, url: URL, helpers: RouteHelpers) => Response | Promise<Response> | null;
