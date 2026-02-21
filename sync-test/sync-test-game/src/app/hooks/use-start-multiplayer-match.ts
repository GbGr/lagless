import { SyncTestInputRegistry } from '@lagless/sync-test-simulation';
import { ECSConfig } from '@lagless/core';
import { RelayInputProvider } from '@lagless/relay-client';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProviderStore } from './use-start-match';

const SERVER_URL = import.meta.env.VITE_RELAY_URL || 'ws://localhost:3334';

export type MatchmakingState = 'idle' | 'queuing' | 'connecting' | 'error';

interface MatchFoundData {
  type: 'match_found';
  matchId: string;
  playerSlot: number;
  token: string;
  serverUrl: string;
}

export const useStartMultiplayerMatch = () => {
  const [state, setState] = useState<MatchmakingState>('idle');
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const navigate = useNavigate();

  const cancel = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState('idle');
    setQueuePosition(null);
    setError(null);
  }, []);

  const startMatch = useCallback(() => {
    if (state !== 'idle') return;

    setState('queuing');
    setError(null);

    const playerId = crypto.randomUUID();
    const ws = new WebSocket(`${SERVER_URL}/matchmaking?playerId=${playerId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'join',
          scope: 'sync-test',
        }),
      );
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'queued':
          setQueuePosition(msg.position);
          break;

        case 'match_found': {
          ws.close();
          wsRef.current = null;
          setState('connecting');
          handleMatchFound(msg as MatchFoundData, playerId);
          break;
        }

        case 'error':
          setState('error');
          setError(msg.message);
          ws.close();
          wsRef.current = null;
          break;
      }
    };

    ws.onerror = () => {
      setState('error');
      setError('Connection failed');
      wsRef.current = null;
    };

    ws.onclose = () => {
      if (state === 'queuing') {
        setState('idle');
      }
    };
  }, [state]);

  const handleMatchFound = useCallback(
    (data: MatchFoundData, playerId: string) => {
      const ecsConfig = new ECSConfig({
        fps: 60,
        maxPlayers: 4,
      });

      const inputProvider = new RelayInputProvider(data.playerSlot, ecsConfig, SyncTestInputRegistry);

      (inputProvider as RelayInputProviderWithMatchInfo)._matchInfo = {
        matchId: data.matchId,
        token: data.token,
        serverUrl: data.serverUrl,
        playerId,
      };

      ProviderStore.set(inputProvider);
      navigate('/game');
    },
    [navigate],
  );

  return {
    state,
    queuePosition,
    error,
    startMatch,
    cancel,
  };
};

export interface MatchInfo {
  matchId: string;
  token: string;
  serverUrl: string;
  playerId: string;
}

interface RelayInputProviderWithMatchInfo extends RelayInputProvider {
  _matchInfo?: MatchInfo;
}

export function getMatchInfo(provider: RelayInputProvider): MatchInfo | undefined {
  return (provider as RelayInputProviderWithMatchInfo)._matchInfo;
}
