import { useCallback } from 'react';

function wsToHttp(wsUrl: string): string {
  return wsUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
}

export function useLatencyControl(serverUrl: string) {
  const httpUrl = wsToHttp(serverUrl);

  const setGlobalLatency = useCallback(async (delayMs: number, jitterMs: number, packetLossPercent: number) => {
    await fetch(`${httpUrl}/api/latency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delayMs, jitterMs, packetLossPercent }),
    });
  }, [httpUrl]);

  const setPlayerLatency = useCallback(async (slot: number, delayMs: number, jitterMs: number, packetLossPercent: number) => {
    await fetch(`${httpUrl}/api/dev/latency/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, delayMs, jitterMs, packetLossPercent }),
    });
  }, [httpUrl]);

  const clearPlayerLatency = useCallback(async () => {
    await fetch(`${httpUrl}/api/dev/latency/player`, { method: 'DELETE' });
  }, [httpUrl]);

  return { setGlobalLatency, setPlayerLatency, clearPlayerLatency };
}
