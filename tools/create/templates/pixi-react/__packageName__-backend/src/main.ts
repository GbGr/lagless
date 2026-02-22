import 'reflect-metadata';
import { RelayGameServer } from '@lagless/relay-game-server';
import { <%= projectName %>InputRegistry } from '<%= packageName %>-simulation';
import { gameHooks } from './game-hooks.js';

const server = new RelayGameServer({
  port: Number(process.env.PORT ?? <%= serverPort %>),
  loggerName: '<%= projectName %>Server',
  roomType: {
    name: '<%= packageName %>',
    config: {
      maxPlayers: 4,
      tickRateHz: 60,
      maxFutureTicks: 20,
      lateJoinEnabled: true,
      reconnectTimeoutMs: 30_000,
      stateTransferTimeoutMs: 5_000,
    },
    hooks: gameHooks,
    inputRegistry: <%= projectName %>InputRegistry,
  },
  matchmaking: {
    scope: '<%= packageName %>',
    config: { minPlayersToStart: 1, maxPlayers: 4, waitTimeoutMs: 2_000 },
  },
});

server.start();
