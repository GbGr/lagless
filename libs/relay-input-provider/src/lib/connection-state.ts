// libs/relay-input-provider/src/lib/connection-state.ts

/**
 * Possible connection states for multiplayer client
 */
export type ConnectionState =
  | 'idle'        // Not connected, ready to start
  | 'matchmaking' // In matchmaking queue
  | 'connecting'  // Connecting to relay room
  | 'connected'   // Connected and playing
  | 'rejoining'   // Attempting to rejoin after disconnect
  | 'closed';     // Connection closed, can reset to idle

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  idle: ['matchmaking', 'connecting'],
  matchmaking: ['connecting', 'closed', 'idle'],
  connecting: ['connected', 'closed', 'idle'],
  connected: ['rejoining', 'closed'],
  rejoining: ['connected', 'closed'],
  closed: ['idle'],
};

/**
 * State change event
 */
export interface StateChangeEvent {
  readonly from: ConnectionState;
  readonly to: ConnectionState;
  readonly timestamp: number;
}

/**
 * Listener for state changes
 */
export type StateChangeListener = (event: StateChangeEvent) => void;

/**
 * Configuration for connection state machine
 */
export interface ConnectionStateConfig {
  /** Initial reconnection delay in ms (default: 1000) */
  readonly reconnectDelayMs: number;
  /** Maximum reconnection attempts (default: 3) */
  readonly maxReconnectAttempts: number;
  /** Timeout for rejoin attempts in ms (default: 30000) */
  readonly rejoinTimeoutMs: number;
  /** Backoff multiplier for reconnection (default: 1.5) */
  readonly reconnectBackoffMultiplier: number;
}

/**
 * Default configuration
 */
export const DEFAULT_CONNECTION_STATE_CONFIG: ConnectionStateConfig = {
  reconnectDelayMs: 1000,
  maxReconnectAttempts: 3,
  rejoinTimeoutMs: 30000,
  reconnectBackoffMultiplier: 1.5,
};

/**
 * Connection state machine for multiplayer client
 *
 * Manages state transitions and notifies listeners
 *
 * State diagram:
 * ```
 *                    +--------+
 *                    |  idle  |<--------+
 *                    +--------+         |
 *                        |              |
 *            connect()   |              | reset()
 *                        v              |
 *                 +-------------+       |
 *        +------->| matchmaking |-------+
 *        |        +-------------+       |
 *        |              |               |
 *        |  found       |               |
 *        |              v               |
 *        |        +------------+        |
 *        +--------| connecting |--------+
 *                 +------------+        |
 *                       |               |
 *           success     |               |
 *                       v               |
 *                 +-----------+         |
 *                 | connected |         |
 *                 +-----------+         |
 *                       |               |
 *        disconnect     |               |
 *        (abnormal)     v               |
 *                 +-----------+         |
 *                 | rejoining |---------+
 *                 +-----------+    timeout/
 *                       |          failure
 *           success     |
 *                       v
 *                 +-----------+
 *                 |  closed   |
 *                 +-----------+
 * ```
 */
export class ConnectionStateMachine {
  private _state: ConnectionState = 'idle';
  private readonly _config: ConnectionStateConfig;
  private readonly _listeners = new Set<StateChangeListener>();
  private _reconnectAttempts = 0;
  private _stateHistory: StateChangeEvent[] = [];
  private readonly _maxHistorySize = 20;

  constructor(config: Partial<ConnectionStateConfig> = {}) {
    this._config = { ...DEFAULT_CONNECTION_STATE_CONFIG, ...config };
  }

  /**
   * Get current state
   */
  public get state(): ConnectionState {
    return this._state;
  }

  /**
   * Get current reconnect attempt count
   */
  public get reconnectAttempts(): number {
    return this._reconnectAttempts;
  }

  /**
   * Get configuration
   */
  public get config(): Readonly<ConnectionStateConfig> {
    return this._config;
  }

  /**
   * Check if a transition is valid
   */
  public canTransition(to: ConnectionState): boolean {
    return VALID_TRANSITIONS[this._state].includes(to);
  }

  /**
   * Attempt to transition to a new state
   *
   * @param to - Target state
   * @returns true if transition was successful, false otherwise
   */
  public transition(to: ConnectionState): boolean {
    if (!this.canTransition(to)) {
      console.warn(
        `[ConnectionState] Invalid transition: ${this._state} -> ${to}`
      );
      return false;
    }

    const from = this._state;
    this._state = to;

    // Track reconnect attempts
    if (to === 'rejoining') {
      this._reconnectAttempts++;
    } else if (to === 'connected' || to === 'idle') {
      this._reconnectAttempts = 0;
    }

    // Record in history
    const event: StateChangeEvent = {
      from,
      to,
      timestamp: Date.now(),
    };

    this._stateHistory.push(event);
    if (this._stateHistory.length > this._maxHistorySize) {
      this._stateHistory.shift();
    }

    // Notify listeners
    this._notifyListeners(event);

    return true;
  }

  /**
   * Subscribe to state changes
   *
   * @param listener - Callback for state changes
   * @returns Unsubscribe function
   */
  public onStateChange(listener: StateChangeListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Get computed reconnection delay with exponential backoff
   */
  public getReconnectDelay(): number {
    const { reconnectDelayMs, reconnectBackoffMultiplier } = this._config;
    return reconnectDelayMs * Math.pow(reconnectBackoffMultiplier, this._reconnectAttempts - 1);
  }

  /**
   * Check if more reconnect attempts are available
   */
  public canRetryReconnect(): boolean {
    return this._reconnectAttempts < this._config.maxReconnectAttempts;
  }

  /**
   * Reset state machine to idle
   */
  public reset(): void {
    if (this._state !== 'idle') {
      this.transition('closed');
      this.transition('idle');
    }
    this._reconnectAttempts = 0;
  }

  /**
   * Get state history (most recent last)
   */
  public getHistory(): ReadonlyArray<StateChangeEvent> {
    return [...this._stateHistory];
  }

  /**
   * Check if currently in a connected state (connected or rejoining)
   */
  public isActive(): boolean {
    return this._state === 'connected' || this._state === 'rejoining';
  }

  /**
   * Check if connection process is in progress
   */
  public isConnecting(): boolean {
    return this._state === 'matchmaking' || this._state === 'connecting';
  }

  private _notifyListeners(event: StateChangeEvent): void {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ConnectionState] Listener error:', err);
      }
    }
  }
}
