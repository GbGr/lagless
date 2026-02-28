import { LatencySimulator, type RoomRegistry } from '@lagless/relay-server';
import type { RouteHandler, RouteHelpers } from '@lagless/relay-game-server';
import { createLogger } from '@lagless/misc';

const log = createLogger('DevTools:PerPlayerLatency');

function getFirstRoom(registry: RoomRegistry) {
  let room: ReturnType<RoomRegistry['forEachRoom']> extends void ? undefined : never;
  registry.forEachRoom((r) => {
    if (!room) room = r as never;
  });
  return room as import('@lagless/relay-server').RelayRoom | undefined;
}

export function createPerPlayerLatencyRoute(registry: RoomRegistry): RouteHandler {
  return (req: Request, url: URL, helpers: RouteHelpers) => {
    if (url.pathname !== '/api/dev/latency/player') return null;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: helpers.corsHeaders() });
    }

    if (req.method === 'GET') {
      const room = getFirstRoom(registry);
      if (!room || !room.perPlayerLatency) {
        return helpers.corsJson({});
      }
      const result: Record<number, { delayMs: number; jitterMs: number; packetLossPercent: number }> = {};
      for (const [slot, sim] of room.perPlayerLatency) {
        result[slot] = sim.config;
      }
      return helpers.corsJson(result);
    }

    if (req.method === 'POST') {
      return (async () => {
        const body = (await req.json()) as Record<string, unknown>;
        const slot = Number(body.slot);
        const delayMs = Number(body.delayMs ?? 0);
        const jitterMs = Number(body.jitterMs ?? 0);
        const packetLossPercent = Number(body.packetLossPercent ?? 0);

        if (!Number.isFinite(slot) || slot < 0) {
          return helpers.corsJson({ error: 'invalid slot' }, 400);
        }

        registry.forEachRoom((room) => {
          if (!room.perPlayerLatency) room.perPlayerLatency = new Map();

          if (delayMs === 0 && jitterMs === 0 && packetLossPercent === 0) {
            room.perPlayerLatency.delete(slot);
          } else {
            const existing = room.perPlayerLatency.get(slot);
            if (existing) {
              existing.setDelay(delayMs);
              existing.setJitter(jitterMs);
              existing.setPacketLoss(packetLossPercent);
            } else {
              room.perPlayerLatency.set(slot, new LatencySimulator({ delayMs, jitterMs, packetLossPercent }));
            }
          }
        });

        log.info(`Per-player latency slot=${slot}: delay=${delayMs}ms jitter=${jitterMs}ms loss=${packetLossPercent}%`);
        return helpers.corsJson({ slot, delayMs, jitterMs, packetLossPercent });
      })();
    }

    if (req.method === 'DELETE') {
      registry.forEachRoom((room) => {
        room.perPlayerLatency = null;
      });
      log.info('Per-player latency cleared');
      return helpers.corsJson({ cleared: true });
    }

    return null;
  };
}
