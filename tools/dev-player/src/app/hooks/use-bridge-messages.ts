import { useEffect, useRef, type Dispatch } from 'react';
import type { DevPlayerAction, InstanceStats } from '../types';

export function useBridgeMessages(running: boolean, dispatch: Dispatch<DevPlayerAction>) {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    if (!running) return;

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data.type !== 'string' || !data.type.startsWith('dev-bridge:')) return;

      switch (data.type) {
        case 'dev-bridge:ready':
          dispatchRef.current({ type: 'INSTANCE_READY', instanceId: data.instanceId });
          break;
        case 'dev-bridge:stats':
          dispatchRef.current({
            type: 'INSTANCE_STATS',
            instanceId: data.instanceId,
            stats: {
              tick: data.tick,
              hash: data.hash,
              rtt: data.rtt,
              jitter: data.jitter,
              inputDelay: data.inputDelay,
              rollbacks: data.rollbacks,
              fps: data.fps,
              verifiedTick: data.verifiedTick ?? data.tick,
              playerSlot: data.playerSlot,
              connected: data.connected,
              clockReady: data.clockReady,
              lastUpdate: Date.now(),
              verifiedHashTick: data.verifiedHashTick,
              verifiedHash: data.verifiedHash,
            } satisfies InstanceStats,
          });
          break;
        case 'dev-bridge:match-state':
          dispatchRef.current({
            type: 'INSTANCE_MATCH_STATE',
            instanceId: data.instanceId,
            state: data.state,
            error: data.error,
          });
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [running]);
}
