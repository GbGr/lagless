import 'reflect-metadata';
import { RelayGameServer } from '@lagless/relay-game-server';
import { RobloxLikeInputRegistry } from '@lagless/roblox-like-simulation';
import { robloxLikeHooks } from './roblox-like-hooks.js';

const server = new RelayGameServer({
  port: Number(process.env.PORT ?? 3335),
  loggerName: 'RobloxLikeServer',
  roomType: {
    name: 'roblox-like',
    config: {
      maxPlayers: 4,
      tickRateHz: 60,
      maxFutureTicks: 20,
      lateJoinEnabled: true,
      reconnectTimeoutMs: 30_000,
      stateTransferTimeoutMs: 5_000,
    },
    hooks: robloxLikeHooks,
    inputRegistry: RobloxLikeInputRegistry,
  },
  matchmaking: {
    scope: 'roblox-like',
    config: { minPlayersToStart: 1, maxPlayers: 4, waitTimeoutMs: 2_000 },
  },
});

server.start();
