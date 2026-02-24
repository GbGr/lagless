import 'reflect-metadata';
import { RelayGameServer } from '@lagless/relay-game-server';
import { GravityPongInputRegistry } from '@lagless/gravity-pong-simulation';
import { gravityPongHooks } from './gravity-pong-hooks.js';

const server = new RelayGameServer({
  port: Number(process.env.PORT ?? 3335),
  loggerName: 'GravityPongServer',
  roomType: {
    name: 'gravity-pong',
    config: {
      maxPlayers: 2,
      tickRateHz: 60,
      maxFutureTicks: 20,
      lateJoinEnabled: false,
      reconnectTimeoutMs: 30_000,
      stateTransferTimeoutMs: 5_000,
    },
    hooks: gravityPongHooks,
    inputRegistry: GravityPongInputRegistry,
  },
  matchmaking: {
    scope: 'gravity-pong',
    config: { minPlayersToStart: 1, maxPlayers: 2, waitTimeoutMs: 5_000 },
  },
});

server.start();
