import { useEffect, useRef, type Dispatch } from 'react';
import type { DevPlayerAction, InstanceStats } from '../types';

export function useBridgeMessages(running: boolean, diagnosticsEnabled: boolean, dispatch: Dispatch<DevPlayerAction>) {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const diagnosticsRef = useRef(diagnosticsEnabled);
  diagnosticsRef.current = diagnosticsEnabled;

  useEffect(() => {
    if (!running) return;

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data.type !== 'string' || !data.type.startsWith('dev-bridge:')) return;

      switch (data.type) {
        case 'dev-bridge:ready': {
          dispatchRef.current({ type: 'INSTANCE_READY', instanceId: data.instanceId });
          // Send current diagnostics state to the newly-ready iframe
          const iframe = document.querySelector<HTMLIFrameElement>(`iframe[data-instance-id="${data.instanceId}"]`);
          iframe?.contentWindow?.postMessage({ type: 'dev-bridge:set-diagnostics', enabled: diagnosticsRef.current }, '*');
          break;
        }
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
        case 'dev-bridge:diagnostics-summary':
          dispatchRef.current({
            type: 'INSTANCE_DIAGNOSTICS_SUMMARY',
            instanceId: data.instanceId,
            summary: {
              rollbackCount: data.rollbackCount,
              lastRollbackTick: data.lastRollbackTick,
              verifiedTickGapCount: data.verifiedTickGapCount,
              ticksRecorded: data.ticksRecorded,
              latestHash: data.latestHash,
              latestPhysicsHash: data.latestPhysicsHash ?? 0,
              latestVelocityHash: data.latestVelocityHash ?? 0,
            },
          });
          break;
        case 'dev-bridge:performance-stats':
          dispatchRef.current({
            type: 'INSTANCE_PERFORMANCE_STATS',
            instanceId: data.instanceId,
            performanceStats: {
              tickTime: data.tickTime,
              snapshotTime: data.snapshotTime ?? null,
              overheadTime: data.overheadTime ?? null,
              systems: data.systems,
            },
          });
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [running]);
}
