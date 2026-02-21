import 'reflect-metadata';
import { RelayGameServer } from '@lagless/relay-game-server';
import { SyncTestInputRegistry } from '@lagless/sync-test-simulation';
import { syncTestHooks } from './sync-test-hooks.js';

const server = new RelayGameServer({
  port: Number(process.env.PORT ?? 3334),
  loggerName: 'SyncTestServer',
  roomType: {
    name: 'sync-test',
    config: {
      maxPlayers: 4,
      tickRateHz: 60,
      maxFutureTicks: 20,
      lateJoinEnabled: true,
      reconnectTimeoutMs: 30_000,
      stateTransferTimeoutMs: 5_000,
    },
    hooks: syncTestHooks,
    inputRegistry: SyncTestInputRegistry,
  },
  matchmaking: {
    scope: 'sync-test',
    config: { minPlayersToStart: 1, maxPlayers: 4, waitTimeoutMs: 2_000 },
  },
});

server.start();
