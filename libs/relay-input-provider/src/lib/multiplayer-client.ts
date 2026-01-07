// libs/relay-input-provider/src/lib/multiplayer-client.ts

import { ECSConfig, InputRegistry } from '@lagless/core';
import { Client, Room, SeatReservation } from 'colyseus.js';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  type MatchmakerState,
  type RoomCreatedResponse,
  type RoomJoinedResponse,
  type RoomErrorResponse,
} from '@lagless/colyseus-rooms';
import {
  ConnectionState,
  ConnectionStateMachine,
  ConnectionStateConfig,
  StateChangeEvent,
} from './connection-state.js';
import {
  RelayInputProviderV2,
  RelayInputProviderV2Config,
  RelayConnectionResultV2,
  RoomClosingEvent,
} from './relay-input-provider-v2.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for MultiplayerClient
 */
export interface MultiplayerClientConfig {
  /** URL of the relay server */
  readonly relayUrl: string;
  /** Authentication token */
  readonly authToken: string;
  /** ECS configuration */
  readonly ecsConfig: ECSConfig;
  /** Input registry for the game */
  readonly inputRegistry: InputRegistry;
  /** Optional game version for filtering */
  readonly version?: string;
  /** Optional relay input provider configuration */
  readonly providerConfig?: Partial<RelayInputProviderV2Config>;
  /** Optional connection state configuration */
  readonly connectionConfig?: Partial<ConnectionStateConfig>;
  /** Timeout for matchmaking in ms (default: 30000) */
  readonly matchmakingTimeoutMs?: number;
  /** Timeout for room creation in ms (default: 10000) */
  readonly roomCreationTimeoutMs?: number;
}

/**
 * Match request types
 */
export type MatchRequest =
  | { mode: 'quick'; filters?: Record<string, unknown> }
  | { mode: 'create'; maxPlayers: number; filters?: Record<string, unknown> }
  | { mode: 'join'; code: string };

/**
 * Result of a successful connection
 */
export interface MultiplayerSession {
  /** Assigned player slot */
  readonly playerSlot: number;
  /** Server tick at connection time */
  readonly serverTick: number;
  /** Maximum players in the room */
  readonly maxPlayers: number;
  /** Room code (if created via room codes) */
  readonly roomCode?: string;
  /** Input provider for the session */
  readonly inputProvider: RelayInputProviderV2;
  /** ECS configuration with server-provided seed */
  readonly ecsConfig: ECSConfig;
  /** Whether this is a late-join */
  readonly isLateJoin: boolean;
}

/**
 * Events emitted by MultiplayerClient
 */
export interface MultiplayerClientEvents {
  /** Connection state changed */
  onStateChange: (event: StateChangeEvent) => void;
  /** Disconnected from room */
  onDisconnect: (reason: string) => void;
  /** Attempting to reconnect */
  onReconnecting: (attempt: number, maxAttempts: number, delayMs: number) => void;
  /** Room is closing */
  onRoomClosing: (event: RoomClosingEvent) => void;
  /** Reconnection successful */
  onReconnected: () => void;
  /** Reconnection failed after all attempts */
  onReconnectFailed: () => void;
}

type EventHandler<K extends keyof MultiplayerClientEvents> = MultiplayerClientEvents[K];

// ─────────────────────────────────────────────────────────────────────────────
// MultiplayerClient
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-level multiplayer client that handles:
 * - Quick matchmaking
 * - Room code creation/joining
 * - Reconnection with exponential backoff
 * - Connection state management
 *
 * Example usage:
 * ```typescript
 * const client = new MultiplayerClient({
 *   relayUrl: 'wss://game.example.com',
 *   authToken: 'player-auth-token',
 *   ecsConfig: new ECSConfig({ fps: 60, maxPlayers: 2 }),
 *   inputRegistry: gameInputRegistry,
 * });
 *
 * // Quick match
 * const session = await client.connect({ mode: 'quick' });
 *
 * // Create room with code
 * const session = await client.connect({ mode: 'create', maxPlayers: 4 });
 * console.log('Room code:', session.roomCode);
 *
 * // Join by code
 * const session = await client.connect({ mode: 'join', code: 'ABC123' });
 *
 * // Use session
 * simulation.inputProvider = session.inputProvider;
 * ```
 */
export class MultiplayerClient {
  private readonly _config: MultiplayerClientConfig;
  private readonly _stateMachine: ConnectionStateMachine;
  private readonly _eventHandlers = new Map<keyof MultiplayerClientEvents, Set<EventHandler<any>>>();

  private _client: Client | null = null;
  private _currentSession: MultiplayerSession | null = null;
  private _lastMatchRequest: MatchRequest | null = null;
  private _reconnectTimeoutId: NodeJS.Timeout | null = null;
  private _disposed = false;

  constructor(config: MultiplayerClientConfig) {
    this._config = {
      matchmakingTimeoutMs: 30000,
      roomCreationTimeoutMs: 10000,
      ...config,
    };

    this._stateMachine = new ConnectionStateMachine(config.connectionConfig);

    // Forward state changes to event handlers
    this._stateMachine.onStateChange((event) => {
      this.emit('onStateChange', event);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current connection state
   */
  public get state(): ConnectionState {
    return this._stateMachine.state;
  }

  /**
   * Get current session (if connected)
   */
  public get session(): MultiplayerSession | null {
    return this._currentSession;
  }

  /**
   * Check if currently connected
   */
  public get isConnected(): boolean {
    return this._stateMachine.isActive();
  }

  /**
   * Subscribe to events
   *
   * @param event - Event name
   * @param handler - Event handler
   * @returns Unsubscribe function
   */
  public on<K extends keyof MultiplayerClientEvents>(event: K, handler: MultiplayerClientEvents[K]): () => void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);

    return () => {
      this._eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Connect to a multiplayer session
   *
   * @param request - Match request specifying connection mode
   * @returns Promise resolving to multiplayer session
   */
  public async connect(request: MatchRequest): Promise<MultiplayerSession> {
    if (this._disposed) {
      throw new Error('MultiplayerClient is disposed');
    }

    if (this._stateMachine.isConnecting() || this._stateMachine.isActive()) {
      throw new Error(`Cannot connect: current state is ${this._stateMachine.state}`);
    }

    this._lastMatchRequest = request;

    try {
      let session: MultiplayerSession;

      switch (request.mode) {
        case 'quick':
          session = await this.quickMatch(request.filters);
          break;
        case 'create':
          session = await this.createRoom(request.maxPlayers, request.filters);
          break;
        case 'join':
          session = await this.joinByCode(request.code);
          break;
      }

      this._currentSession = session;
      this._stateMachine.transition('connected');

      // Setup disconnect handling
      this.setupDisconnectHandling(session.inputProvider);

      return session;
    } catch (error) {
      this._stateMachine.transition('closed');
      this._stateMachine.transition('idle');
      throw error;
    }
  }

  /**
   * Leave the current session
   *
   * @param reason - Optional reason for leaving
   */
  public async leave(reason?: string): Promise<void> {
    this.cancelReconnectTimer();

    if (this._currentSession) {
      try {
        this._currentSession.inputProvider.dispose();
      } catch (err) {
        console.warn('[MultiplayerClient] Error disposing input provider:', err);
      }
      this._currentSession = null;
    }

    if (this._client) {
      this._client = null;
    }

    this._stateMachine.reset();

    if (reason) {
      this.emit('onDisconnect', reason);
    }
  }

  /**
   * Signal that the game has ended
   *
   * @param payload - End game payload
   */
  public endGame(payload: { score: number; mmrChange?: number }): void {
    if (!this._currentSession) {
      console.warn('[MultiplayerClient] endGame called without active session');
      return;
    }

    this._currentSession.inputProvider.sendPlayerFinishedGame(payload);
  }

  /**
   * Dispose the client
   */
  public dispose(): void {
    if (this._disposed) return;

    this._disposed = true;
    this.cancelReconnectTimer();

    if (this._currentSession) {
      try {
        this._currentSession.inputProvider.dispose();
      } catch (err) {
        // Ignore
      }
      this._currentSession = null;
    }

    this._client = null;
    this._eventHandlers.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Connection Modes
  // ─────────────────────────────────────────────────────────────────────────────

  private async quickMatch(filters?: Record<string, unknown>): Promise<MultiplayerSession> {
    this._stateMachine.transition('matchmaking');

    // Create Colyseus client
    this._client = new Client(this._config.relayUrl);

    // Join matchmaking room
    const matchmakingRoom: Room<MatchmakerState> = await this._client.joinOrCreate('matchmaking', {
      frameLength: this._config.ecsConfig.frameLength,
      maxPlayers: this._config.ecsConfig.maxPlayers,
      authToken: this._config.authToken,
      version: this._config.version,
      ...filters,
    });

    try {
      // Wait for match to be found
      const seatReservation = await this.waitForMatchFound(matchmakingRoom);

      // Leave matchmaking room
      await matchmakingRoom.leave(true);

      this._stateMachine.transition('connecting');

      // Connect to relay room
      return await this.connectToRelay(seatReservation);
    } catch (error) {
      await matchmakingRoom.leave(true).catch((reason) => console.error(reason));
      throw error;
    }
  }

  private async createRoom(maxPlayers: number, filters?: Record<string, unknown>): Promise<MultiplayerSession> {
    this._stateMachine.transition('matchmaking');

    // Create Colyseus client
    this._client = new Client(this._config.relayUrl);

    // Join room code matchmaking room
    const matchmakingRoom = await this._client.joinOrCreate('room_code_matchmaking', {
      authToken: this._config.authToken,
    });

    try {
      // Request room creation
      const response = await this.requestRoomCreation(matchmakingRoom, maxPlayers, filters);

      // Leave matchmaking room
      await matchmakingRoom.leave(true);

      this._stateMachine.transition('connecting');

      // Connect to relay room
      const session = await this.connectToRelay(response.reservation);

      // Attach room code to session
      return {
        ...session,
        roomCode: response.code,
      };
    } catch (error) {
      await matchmakingRoom.leave(true).catch((error) => {
        console.error(error);
      });
      throw error;
    }
  }

  private async joinByCode(code: string): Promise<MultiplayerSession> {
    this._stateMachine.transition('matchmaking');

    // Create Colyseus client
    this._client = new Client(this._config.relayUrl);

    // Join room code matchmaking room
    const matchmakingRoom = await this._client.joinOrCreate('room_code_matchmaking', {
      authToken: this._config.authToken,
    });

    try {
      // Request to join by code
      const response = await this.requestJoinByCode(matchmakingRoom, code);

      // Leave matchmaking room
      await matchmakingRoom.leave(true);

      this._stateMachine.transition('connecting');

      // Connect to relay room
      const session = await this.connectToRelay(response.reservation);

      // Attach room code to session
      return {
        ...session,
        roomCode: code.toUpperCase(),
      };
    } catch (error) {
      await matchmakingRoom.leave(true).catch((error) => {
        console.error(error);
      });
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Relay Connection
  // ─────────────────────────────────────────────────────────────────────────────

  private async connectToRelay(seatReservation: SeatReservation | RoomJoinedResponse['reservation']): Promise<MultiplayerSession> {
    if (!this._client) {
      throw new Error('Client not initialized');
    }

    const result: RelayConnectionResultV2 = await RelayInputProviderV2.connect(
      this._config.ecsConfig,
      this._config.inputRegistry,
      this._client,
      seatReservation,
      this._config.providerConfig
    );

    // Subscribe to room closing events
    result.provider.on('onRoomClosing', (event) => {
      this.emit('onRoomClosing', event);
    });

    return {
      playerSlot: result.playerSlot,
      serverTick: result.serverTick,
      maxPlayers: result.maxPlayers,
      inputProvider: result.provider,
      ecsConfig: result.ecsConfig,
      isLateJoin: result.isLateJoin,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Matchmaking Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private waitForMatchFound(room: Room<MatchmakerState>): Promise<SeatReservation> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Matchmaking timeout'));
      }, this._config.matchmakingTimeoutMs);

      const cleanup = () => {
        clearTimeout(timeoutId);
        unsubscribe();
      };

      const unsubscribe = room.onMessage('match_found', (seatReservation: SeatReservation) => {
        cleanup();
        resolve(seatReservation);
      });
    });
  }

  private requestRoomCreation(
    room: Room,
    maxPlayers: number,
    filters?: Record<string, unknown>
  ): Promise<RoomCreatedResponse> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Room creation timeout'));
      }, this._config.roomCreationTimeoutMs);

      const cleanup = () => {
        clearTimeout(timeoutId);
        unsubscribeSuccess();
        unsubscribeError();
      };

      const unsubscribeSuccess = room.onMessage('room_created', (response: RoomCreatedResponse) => {
        cleanup();
        resolve(response);
      });

      const unsubscribeError = room.onMessage('room_error', (response: RoomErrorResponse) => {
        cleanup();
        reject(new Error(`Room creation failed: ${response.reason} - ${response.message || ''}`));
      });

      // Send creation request
      room.send('create_room', { maxPlayers, filters });
    });
  }

  private requestJoinByCode(room: Room, code: string): Promise<RoomJoinedResponse> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Join by code timeout'));
      }, this._config.roomCreationTimeoutMs);

      const cleanup = () => {
        clearTimeout(timeoutId);
        unsubscribeSuccess();
        unsubscribeError();
      };

      const unsubscribeSuccess = room.onMessage('room_joined', (response: RoomJoinedResponse) => {
        cleanup();
        resolve(response);
      });

      const unsubscribeError = room.onMessage('room_error', (response: RoomErrorResponse) => {
        cleanup();
        const errorMessages: Record<string, string> = {
          invalid_code: 'Invalid room code',
          room_full: 'Room is full',
          room_expired: 'Room has expired',
          join_failed: 'Failed to join room',
        };
        reject(new Error(errorMessages[response.reason] || response.reason));
      });

      // Send join request
      room.send('join_by_code', { code });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Reconnection
  // ─────────────────────────────────────────────────────────────────────────────

  private setupDisconnectHandling(provider: RelayInputProviderV2): void {
    // Listen for room leave events
    provider.room.onLeave((code) => {
      // Normal leave (code 1000) - don't reconnect
      if (code === 1000) {
        this.handleNormalDisconnect();
        return;
      }

      // Abnormal disconnect - attempt reconnection
      this.handleAbnormalDisconnect(code);
    });
  }

  private handleNormalDisconnect(): void {
    this._currentSession = null;
    this._stateMachine.transition('closed');
    this._stateMachine.transition('idle');
    this.emit('onDisconnect', 'Normal disconnect');
  }

  private handleAbnormalDisconnect(code: number): void {
    console.log(`[MultiplayerClient] Abnormal disconnect: code=${code}`);

    if (!this._stateMachine.canTransition('rejoining')) {
      this.handleNormalDisconnect();
      return;
    }

    this._stateMachine.transition('rejoining');

    // Check if we can retry
    if (!this._stateMachine.canRetryReconnect()) {
      console.log('[MultiplayerClient] Max reconnect attempts reached');
      this.emit('onReconnectFailed');
      this._stateMachine.transition('closed');
      this._stateMachine.transition('idle');
      this.emit('onDisconnect', 'Reconnection failed');
      return;
    }

    // Schedule reconnection attempt
    const delayMs = this._stateMachine.getReconnectDelay();
    const attempt = this._stateMachine.reconnectAttempts;
    const maxAttempts = this._stateMachine.config.maxReconnectAttempts;

    console.log(`[MultiplayerClient] Scheduling reconnect attempt ${attempt}/${maxAttempts} in ${delayMs}ms`);

    this.emit('onReconnecting', attempt, maxAttempts, delayMs);

    this._reconnectTimeoutId = setTimeout(() => this.attemptReconnect(), delayMs);
  }

  private async attemptReconnect(): Promise<void> {
    this._reconnectTimeoutId = null;

    if (this._disposed || !this._lastMatchRequest) {
      return;
    }

    try {
      console.log('[MultiplayerClient] Attempting reconnection...');

      // Dispose old session
      if (this._currentSession) {
        try {
          this._currentSession.inputProvider.dispose();
        } catch (err) {
          // Ignore
        }
        this._currentSession = null;
      }

      // Reset to connecting state
      this._stateMachine.transition('connected'); // First go to connected to allow transition to closed
      this._stateMachine.transition('closed');
      this._stateMachine.transition('idle');

      // Attempt to reconnect
      await this.connect(this._lastMatchRequest);

      console.log('[MultiplayerClient] Reconnection successful');
      this.emit('onReconnected');
    } catch (error) {
      console.error('[MultiplayerClient] Reconnection attempt failed:', error);

      // Will trigger another reconnect attempt via handleAbnormalDisconnect
      // if still in rejoining state and attempts remaining
      if (this._stateMachine.canRetryReconnect()) {
        this.handleAbnormalDisconnect(0);
      } else {
        this.emit('onReconnectFailed');
        this._stateMachine.reset();
        this.emit('onDisconnect', 'Reconnection failed');
      }
    }
  }

  private cancelReconnectTimer(): void {
    if (this._reconnectTimeoutId !== null) {
      clearTimeout(this._reconnectTimeoutId);
      this._reconnectTimeoutId = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Emission
  // ─────────────────────────────────────────────────────────────────────────────

  private emit<K extends keyof MultiplayerClientEvents>(
    event: K,
    ...args: Parameters<MultiplayerClientEvents[K]>
  ): void {
    const handlers = this._eventHandlers.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        (handler as (...args: any[]) => void)(...args);
      } catch (err) {
        console.error(`[MultiplayerClient] Error in ${event} handler:`, err);
      }
    }
  }
}
