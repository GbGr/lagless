import type { RelayGameServer } from '@lagless/relay-game-server';
import { createPerPlayerLatencyRoute } from './per-player-latency.js';

export function setupDevTools(server: RelayGameServer): void {
  // Register per-player latency API route (creates perPlayerLatency map lazily on first use)
  server.addCustomRoute(createPerPlayerLatencyRoute(server.roomRegistry));
}
