import { CircleSumoInputRegistry } from '@lagless/circle-sumo-simulation';
import { AbstractInputProvider, ECSConfig } from '@lagless/core';
import {
  MultiplayerClient,
  MultiplayerSession,
  ConnectionState,
} from '@lagless/relay-input-provider';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthTokenStore } from '@lagless/react';
import { useNavigate } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Provider Store (global singleton for passing provider to game view)
// ─────────────────────────────────────────────────────────────────────────────

export class ProviderStore {
  private static readonly _listeners = new Set<() => void>();
  private static _provider: AbstractInputProvider | undefined;
  private static _session: MultiplayerSession | undefined;

  public static onProvider(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  public static set(provider: AbstractInputProvider, session?: MultiplayerSession) {
    this._provider = provider;
    this._session = session;
    for (const listener of this._listeners) {
      listener();
    }
  }

  public static getInvalidate(): AbstractInputProvider | undefined {
    const provider = this._provider;
    this._provider = undefined;
    return provider;
  }

  public static getSession(): MultiplayerSession | undefined {
    return this._session;
  }

  public static clearSession(): void {
    this._session = undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multiplayer Client singleton
// ─────────────────────────────────────────────────────────────────────────────

let multiplayerClientInstance: MultiplayerClient | null = null;

function getMultiplayerClient(): MultiplayerClient | null {
  const token = AuthTokenStore.get();
  if (!token) return null;

  if (!multiplayerClientInstance) {
    multiplayerClientInstance = new MultiplayerClient({
      relayUrl: import.meta.env.VITE_RELAY_URL,
      authToken: token,
      ecsConfig: new ECSConfig({ fps: 60 }),
      inputRegistry: CircleSumoInputRegistry,
    });
  }

  return multiplayerClientInstance;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UseStartMatchResult {
  /** Whether a connection operation is in progress */
  isBusy: boolean;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Error message if connection failed */
  error: string | null;
  /** Room code after creating a room */
  roomCode: string | null;

  /** Start a quick match */
  startQuickMatch: () => Promise<void>;
  /** Create a private room with room code */
  createRoom: (maxPlayers?: number) => Promise<void>;
  /** Join a room by code */
  joinByCode: (code: string) => Promise<void>;
  /** Leave current session */
  leave: () => Promise<void>;
}

export const useStartMatch = (): UseStartMatchResult => {
  const [isBusy, setIsBusy] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const navigate = useNavigate();

  // Get or create multiplayer client
  const client = useMemo(() => getMultiplayerClient(), []);

  // Subscribe to connection state changes
  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.on('onStateChange', (event) => {
      setConnectionState(event.to);
    });

    return unsubscribe;
  }, [client]);

  // Quick match
  const startQuickMatch = useCallback(async () => {
    if (isBusy || !client) return;

    setIsBusy(true);
    setError(null);
    setRoomCode(null);

    try {
      const session = await client.connect({ mode: 'quick' });

      ProviderStore.set(session.inputProvider, session);
      navigate('/game');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start match');
      console.error('[useStartMatch] Quick match error:', err);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, client, navigate]);

  // Create room with code
  const createRoom = useCallback(async (maxPlayers = 6) => {
    if (isBusy || !client) return;

    setIsBusy(true);
    setError(null);
    setRoomCode(null);

    try {
      const session = await client.connect({ mode: 'create', maxPlayers });

      setRoomCode(session.roomCode || null);
      ProviderStore.set(session.inputProvider, session);
      navigate('/game');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
      console.error('[useStartMatch] Create room error:', err);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, client, navigate]);

  // Join by code
  const joinByCode = useCallback(async (code: string) => {
    if (isBusy || !client) return;

    setIsBusy(true);
    setError(null);
    setRoomCode(null);

    try {
      const session = await client.connect({ mode: 'join', code });

      setRoomCode(code.toUpperCase());
      ProviderStore.set(session.inputProvider, session);
      navigate('/game');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
      console.error('[useStartMatch] Join by code error:', err);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, client, navigate]);

  // Leave session
  const leave = useCallback(async () => {
    if (!client) return;

    try {
      await client.leave('User requested');
      setRoomCode(null);
      ProviderStore.clearSession();
    } catch (err) {
      console.error('[useStartMatch] Leave error:', err);
    }
  }, [client]);

  return {
    isBusy,
    connectionState,
    error,
    roomCode,
    startQuickMatch,
    createRoom,
    joinByCode,
    leave,
  };
};
