import { LatencySimulator } from '@lagless/relay-server';
import type { RoomRegistry } from '@lagless/relay-server';
import type { Logger } from '@lagless/misc';

export interface LatencyState {
  simulator: LatencySimulator | null;
}

export function setupLatencySimulator(
  roomRegistry: RoomRegistry,
  state: LatencyState,
): void {
  const _origCreateRoom = roomRegistry.createRoom.bind(roomRegistry);
  roomRegistry.createRoom = async (...args: Parameters<typeof roomRegistry.createRoom>) => {
    const room = await _origCreateRoom(...args);
    room.latencySimulator = state.simulator;
    return room;
  };
}

function applySimulatorToAllRooms(roomRegistry: RoomRegistry, sim: LatencySimulator | null): void {
  roomRegistry.forEachRoom((room) => {
    room.latencySimulator = sim;
  });
}

export function handleLatencyEndpoint(
  req: Request,
  roomRegistry: RoomRegistry,
  state: LatencyState,
  log: Logger,
): Response | Promise<Response> | null {
  if (req.method === 'GET') {
    return Response.json(state.simulator?.config ?? { delayMs: 0, jitterMs: 0, packetLossPercent: 0 });
  }

  if (req.method === 'POST') {
    return (async () => {
      const body = (await req.json()) as Record<string, unknown>;
      const delayMs = Number(body.delayMs ?? 0);
      const jitterMs = Number(body.jitterMs ?? 0);
      const packetLossPercent = Number(body.packetLossPercent ?? 0);

      if (delayMs === 0 && jitterMs === 0 && packetLossPercent === 0) {
        state.simulator = null;
        applySimulatorToAllRooms(roomRegistry, null);
        log.info('Latency simulator disabled');
      } else {
        if (state.simulator) {
          state.simulator.setDelay(delayMs);
          state.simulator.setJitter(jitterMs);
          state.simulator.setPacketLoss(packetLossPercent);
        } else {
          state.simulator = new LatencySimulator({ delayMs, jitterMs, packetLossPercent });
        }
        applySimulatorToAllRooms(roomRegistry, state.simulator);
        log.info(`Latency simulator: delay=${delayMs}ms jitter=${jitterMs}ms loss=${packetLossPercent}%`);
      }

      return Response.json(state.simulator?.config ?? { delayMs: 0, jitterMs: 0, packetLossPercent: 0 });
    })();
  }

  return null;
}
