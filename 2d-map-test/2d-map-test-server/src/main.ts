import 'reflect-metadata';
import { RelayGameServer } from '@lagless/relay-game-server';
import { setupDevTools } from '@lagless/dev-tools';
import { MapTestInputRegistry } from '@lagless/2d-map-test-simulation';
import { mapTestHooks } from './map-test-hooks.js';

const server = new RelayGameServer({
  port: Number(process.env.PORT ?? 3336),
  loggerName: 'MapTestServer',
  roomType: {
    name: '2d-map-test',
    config: {
      maxPlayers: 4,
      tickRateHz: 60,
      maxFutureTicks: 20,
      lateJoinEnabled: true,
      reconnectTimeoutMs: 30_000,
      stateTransferTimeoutMs: 5_000,
    },
    hooks: mapTestHooks,
    inputRegistry: MapTestInputRegistry,
  },
  matchmaking: {
    scope: '2d-map-test',
    config: { minPlayersToStart: 1, maxPlayers: 4, waitTimeoutMs: 2_000 },
  },
});

setupDevTools(server);
server.start();
