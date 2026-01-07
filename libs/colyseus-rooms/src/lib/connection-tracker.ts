// libs/colyseus-rooms/src/lib/connection-tracker.ts

/**
 * Configuration for connection tracking
 */
export interface ConnectionTrackerConfig {
  /** Grace period for reconnection (ms) */
  readonly rejoinGracePeriodMs: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONNECTION_TRACKER_CONFIG: ConnectionTrackerConfig = {
  rejoinGracePeriodMs: 30000, // 30 seconds
};

/**
 * Information about a disconnected player who can rejoin
 */
export interface DisconnectedPlayer {
  readonly playerSlot: number;
  readonly sessionId: string;
  readonly playerId: string;
  readonly displayName?: string;
  readonly disconnectedAt: number;
  readonly canRejoinUntil: number;
}

/**
 * Result of a rejoin attempt
 */
export interface RejoinResult {
  readonly success: boolean;
  readonly playerSlot?: number;
  readonly reason?: 'expired' | 'not_found' | 'already_connected';
}

/**
 * Tracks disconnected players and manages reconnection windows
 *
 * Flow:
 * 1. recordDisconnect() - When a player disconnects, record their info
 * 2. canRejoin() - Check if a player can rejoin
 * 3. confirmRejoin() - Confirm successful rejoin and cleanup
 * 4. tick() - Cleanup expired entries
 */
export class ConnectionTracker {
  private readonly _config: ConnectionTrackerConfig;

  /** Map of playerId -> disconnected player info */
  private readonly _disconnectedPlayers = new Map<string, DisconnectedPlayer>();

  /** Set of currently connected playerIds */
  private readonly _connectedPlayerIds = new Set<string>();

  /** Map of playerSlot -> playerId for slot reservation */
  private readonly _slotReservations = new Map<number, string>();

  constructor(config: Partial<ConnectionTrackerConfig> = {}) {
    this._config = { ...DEFAULT_CONNECTION_TRACKER_CONFIG, ...config };
  }

  /**
   * Record a player connection
   */
  public recordConnect(playerId: string, playerSlot: number): void {
    this._connectedPlayerIds.add(playerId);
    this._slotReservations.set(playerSlot, playerId);

    // Clear any pending disconnect for this player
    this._disconnectedPlayers.delete(playerId);
  }

  /**
   * Record a player disconnect and start rejoin window
   *
   * @param playerSlot - Slot of the disconnecting player
   * @param sessionId - Session ID of the disconnecting player
   * @param playerId - Unique player identifier (e.g., from auth)
   * @param displayName - Optional display name
   */
  public recordDisconnect(
    playerSlot: number,
    sessionId: string,
    playerId: string,
    displayName?: string
  ): void {
    const now = Date.now();

    // Remove from connected set
    this._connectedPlayerIds.delete(playerId);

    // Record disconnect info
    const disconnectedPlayer: DisconnectedPlayer = {
      playerSlot,
      sessionId,
      playerId,
      displayName,
      disconnectedAt: now,
      canRejoinUntil: now + this._config.rejoinGracePeriodMs,
    };

    this._disconnectedPlayers.set(playerId, disconnectedPlayer);

    console.log(
      `[ConnectionTracker] Player ${playerId} (slot ${playerSlot}) disconnected. ` +
      `Can rejoin until ${new Date(disconnectedPlayer.canRejoinUntil).toISOString()}`
    );
  }

  /**
   * Check if a player can rejoin
   *
   * @param playerId - Player ID attempting to rejoin
   * @param now - Current timestamp (default: Date.now())
   * @returns DisconnectedPlayer info if can rejoin, null otherwise
   */
  public canRejoin(playerId: string, now = Date.now()): DisconnectedPlayer | null {
    // Check if already connected
    if (this._connectedPlayerIds.has(playerId)) {
      return null;
    }

    const disconnected = this._disconnectedPlayers.get(playerId);
    if (!disconnected) {
      return null;
    }

    // Check if within grace period
    if (now > disconnected.canRejoinUntil) {
      // Expired, clean up
      this._disconnectedPlayers.delete(playerId);
      this._slotReservations.delete(disconnected.playerSlot);
      return null;
    }

    return disconnected;
  }

  /**
   * Attempt to rejoin a player
   *
   * @param playerId - Player ID attempting to rejoin
   * @param now - Current timestamp
   * @returns RejoinResult with success status and slot if successful
   */
  public attemptRejoin(playerId: string, now = Date.now()): RejoinResult {
    // Check if already connected
    if (this._connectedPlayerIds.has(playerId)) {
      return { success: false, reason: 'already_connected' };
    }

    const disconnected = this._disconnectedPlayers.get(playerId);
    if (!disconnected) {
      return { success: false, reason: 'not_found' };
    }

    // Check if within grace period
    if (now > disconnected.canRejoinUntil) {
      this._disconnectedPlayers.delete(playerId);
      this._slotReservations.delete(disconnected.playerSlot);
      return { success: false, reason: 'expired' };
    }

    return { success: true, playerSlot: disconnected.playerSlot };
  }

  /**
   * Confirm successful rejoin and cleanup
   *
   * @param playerId - Player ID that rejoined
   * @param playerSlot - Slot they rejoined to
   */
  public confirmRejoin(playerId: string, playerSlot: number): void {
    this._connectedPlayerIds.add(playerId);
    this._disconnectedPlayers.delete(playerId);

    // Update slot reservation
    this._slotReservations.set(playerSlot, playerId);

    console.log(`[ConnectionTracker] Player ${playerId} rejoined to slot ${playerSlot}`);
  }

  /**
   * Check if a slot is reserved for a disconnected player
   *
   * @param playerSlot - Slot to check
   * @returns playerId if reserved, undefined otherwise
   */
  public getSlotReservation(playerSlot: number): string | undefined {
    const playerId = this._slotReservations.get(playerSlot);
    if (!playerId) {
      return undefined;
    }

    // Check if still has valid disconnect entry
    const disconnected = this._disconnectedPlayers.get(playerId);
    if (!disconnected) {
      // No longer disconnected (reconnected or expired), clear reservation
      this._slotReservations.delete(playerSlot);
      return undefined;
    }

    return playerId;
  }

  /**
   * Check if a player is currently connected
   */
  public isConnected(playerId: string): boolean {
    return this._connectedPlayerIds.has(playerId);
  }

  /**
   * Cleanup expired disconnect entries
   * Should be called periodically (e.g., every few seconds)
   */
  public tick(now = Date.now()): void {
    const expiredPlayerIds: string[] = [];

    for (const [playerId, disconnected] of this._disconnectedPlayers) {
      if (now > disconnected.canRejoinUntil) {
        expiredPlayerIds.push(playerId);
        this._slotReservations.delete(disconnected.playerSlot);
      }
    }

    for (const playerId of expiredPlayerIds) {
      const disconnected = this._disconnectedPlayers.get(playerId);
      if (disconnected) {
        console.log(
          `[ConnectionTracker] Rejoin window expired for player ${playerId} (slot ${disconnected.playerSlot})`
        );
      }
      this._disconnectedPlayers.delete(playerId);
    }
  }

  /**
   * Force expire a player's rejoin window
   */
  public forceExpire(playerId: string): void {
    const disconnected = this._disconnectedPlayers.get(playerId);
    if (disconnected) {
      this._slotReservations.delete(disconnected.playerSlot);
      this._disconnectedPlayers.delete(playerId);
    }
  }

  /**
   * Get all disconnected players who can still rejoin
   */
  public getDisconnectedPlayers(now = Date.now()): DisconnectedPlayer[] {
    const result: DisconnectedPlayer[] = [];

    for (const disconnected of this._disconnectedPlayers.values()) {
      if (now <= disconnected.canRejoinUntil) {
        result.push(disconnected);
      }
    }

    return result;
  }

  /**
   * Get count of players who can still rejoin
   */
  public get pendingRejoinCount(): number {
    return this._disconnectedPlayers.size;
  }

  /**
   * Get count of connected players
   */
  public get connectedCount(): number {
    return this._connectedPlayerIds.size;
  }

  /**
   * Clear all tracking state
   */
  public clear(): void {
    this._disconnectedPlayers.clear();
    this._connectedPlayerIds.clear();
    this._slotReservations.clear();
  }
}
