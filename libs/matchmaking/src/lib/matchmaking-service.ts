import { createLogger } from '@lagless/misc';
import { tryFormMatch } from './match-formation.js';
import type {
  QueueEntry, QueueStore, ScopeConfig,
  FormedMatch, OnMatchFormedFn, PlayerNotifyFn,
} from './types.js';

const log = createLogger('Matchmaking');

// ─── Player Registration ────────────────────────────────────

interface RegisteredPlayer {
  readonly playerId: string;
  readonly scope: string;
  readonly notify: PlayerNotifyFn;
}

// ─── MatchmakingService ─────────────────────────────────────

/**
 * Coordinates matchmaking: queue management, periodic match formation, player notifications.
 *
 * Usage:
 * 1. Register scope configs via `registerScope()`
 * 2. Set `onMatchFormed` callback
 * 3. Call `start()` to begin periodic match checking
 * 4. Call `addPlayer()` / `removePlayer()` as players connect/disconnect
 */
export class MatchmakingService {
  private readonly _scopeConfigs = new Map<string, ScopeConfig>();
  private readonly _players = new Map<string, RegisteredPlayer>();
  private _checkInterval: ReturnType<typeof setInterval> | null = null;
  private _checkIntervalMs = 500;
  private _onMatchFormed: OnMatchFormedFn | null = null;

  constructor(
    private readonly _store: QueueStore,
  ) {}

  // ─── Configuration ──────────────────────────────────────

  public registerScope(scope: string, config: ScopeConfig): void {
    if (this._scopeConfigs.has(scope)) {
      throw new Error(`Scope "${scope}" already registered`);
    }
    this._scopeConfigs.set(scope, config);
    log.info(`Registered scope "${scope}" (min=${config.minPlayersToStart}, max=${config.maxPlayers}, timeout=${config.waitTimeoutMs}ms)`);
  }

  public setOnMatchFormed(fn: OnMatchFormedFn): void {
    this._onMatchFormed = fn;
  }

  public setCheckInterval(ms: number): void {
    this._checkIntervalMs = ms;
  }

  // ─── Lifecycle ──────────────────────────────────────────

  public start(): void {
    if (this._checkInterval) return;

    this._checkInterval = setInterval(
      () => { this.checkAllScopes(); },
      this._checkIntervalMs,
    );

    log.info(`Started matchmaking (interval=${this._checkIntervalMs}ms, scopes=${this._scopeConfigs.size})`);
  }

  public stop(): void {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
    log.info('Stopped matchmaking');
  }

  public dispose(): void {
    this.stop();
    this._players.clear();
    this._store.clear();
    this._scopeConfigs.clear();
  }

  // ─── Player Management ──────────────────────────────────

  /**
   * Add a player to the matchmaking queue.
   * @param notify - callback to send messages to this player (e.g. via WebSocket)
   */
  public addPlayer(
    playerId: string,
    scope: string,
    mmr: number,
    metadata: Record<string, unknown>,
    notify: PlayerNotifyFn,
  ): boolean {
    // Validate scope
    if (!this._scopeConfigs.has(scope)) {
      notify({ type: 'error', message: `Unknown scope "${scope}"` });
      return false;
    }

    // Prevent duplicate registration
    if (this._players.has(playerId)) {
      notify({ type: 'error', message: 'Already in queue' });
      return false;
    }

    // Check if already in store (stale entry from crashed connection)
    if (this._store.has(scope, playerId)) {
      this._store.remove(scope, playerId);
    }

    const entry: QueueEntry = {
      playerId,
      mmr,
      metadata: Object.freeze({ ...metadata }),
      joinedAt: performance.now(),
    };

    this._store.add(scope, entry);
    this._players.set(playerId, { playerId, scope, notify });

    const queueCount = this._store.getCount(scope);
    log.info(`Player ${playerId} joined scope "${scope}" (queue: ${queueCount})`);

    // Notify position
    this.notifyQueuePosition(scope);

    return true;
  }

  /**
   * Remove a player from the matchmaking queue.
   * Called on disconnect or explicit cancel.
   */
  public removePlayer(playerId: string, reason: 'disconnected' | 'cancelled' = 'disconnected'): boolean {
    const registration = this._players.get(playerId);
    if (!registration) return false;

    this._store.remove(registration.scope, playerId);
    this._players.delete(playerId);

    log.info(`Player ${playerId} removed from scope "${registration.scope}" (${reason})`);

    // Notify remaining players about updated positions
    this.notifyQueuePosition(registration.scope);

    return true;
  }

  /**
   * Check if a player is currently in a queue.
   */
  public isPlayerQueued(playerId: string): boolean {
    return this._players.has(playerId);
  }

  /**
   * Get count of players in a specific scope queue.
   */
  public getQueueCount(scope: string): number {
    return this._store.getCount(scope);
  }

  // ─── Match Formation (periodic) ─────────────────────────

  /**
   * Check all scopes for possible match formation.
   * Called automatically by the interval, but can also be called manually.
   */
  public checkAllScopes(): void {
    for (const scope of this._scopeConfigs.keys()) {
      this.checkScope(scope);
    }
  }

  private checkScope(scope: string): void {
    const config = this._scopeConfigs.get(scope);
    if (!config) return;

    const entries = this._store.getAll(scope);
    const candidate = tryFormMatch(entries, config, performance.now());

    if (candidate) {
      this.formMatch(scope, candidate.players, candidate.botsNeeded);
    }
  }

  private async formMatch(
    scope: string,
    players: ReadonlyArray<QueueEntry>,
    botsNeeded: number,
  ): Promise<void> {
    const matchId = crypto.randomUUID();

    // Remove matched players from queue
    for (const player of players) {
      this._store.remove(scope, player.playerId);
    }

    const formedMatch: FormedMatch = {
      matchId,
      scope,
      players,
      botsNeeded,
    };

    log.info(
      `Match formed: ${matchId} scope="${scope}" players=${players.length} bots=${botsNeeded}`
    );

    if (!this._onMatchFormed) {
      log.warn('No onMatchFormed callback registered — match will be lost');
      // Put players back? No — that would cause loops. Just notify error.
      for (const player of players) {
        const reg = this._players.get(player.playerId);
        if (reg) {
          reg.notify({ type: 'error', message: 'Match formation failed: no handler' });
          this._players.delete(player.playerId);
        }
      }
      return;
    }

    try {
      // Game server creates room, generates tokens, returns per-player data
      const playerDataMap = await this._onMatchFormed(formedMatch);

      // Notify matched players
      for (const player of players) {
        const reg = this._players.get(player.playerId);
        if (!reg) continue;

        const data = playerDataMap.get(player.playerId);
        if (data) {
          reg.notify({
            ...data,
            type: 'match_found',
            matchId,
          });
        } else {
          reg.notify({ type: 'error', message: 'Match formed but no slot assigned' });
        }

        // Player is done with matchmaking
        this._players.delete(player.playerId);
      }
    } catch (err) {
      log.error(`onMatchFormed callback failed: ${err}`);

      // Notify players of failure
      for (const player of players) {
        const reg = this._players.get(player.playerId);
        if (reg) {
          reg.notify({ type: 'error', message: 'Match formation failed' });
          this._players.delete(player.playerId);
        }
      }
    }

    // Notify remaining queue about updated positions
    this.notifyQueuePosition(scope);
  }

  // ─── Notifications ──────────────────────────────────────

  private notifyQueuePosition(scope: string): void {
    const entries = this._store.getAll(scope);
    const total = entries.length;

    for (let i = 0; i < entries.length; i++) {
      const reg = this._players.get(entries[i].playerId);
      if (reg) {
        reg.notify({ type: 'queued', position: i + 1, total });
      }
    }
  }
}
