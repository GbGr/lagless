import type { RoomTypeConfig, RoomHooks, InputRegistry } from '@lagless/relay-server';
import type { ScopeConfig } from '@lagless/matchmaking';

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
  };
  initialLatency?: { delayMs: number; jitterMs: number; packetLossPercent: number } | null;
  authResponseCustomizer?: (playerId: string) => Record<string, unknown>;
  customRoutes?: RouteHandler[];
}

export interface RouteHelpers {
  corsHeaders(): Record<string, string>;
  corsJson(data: unknown, status?: number): Response;
}

export type RouteHandler = (req: Request, url: URL, helpers: RouteHelpers) => Response | Promise<Response> | null;
