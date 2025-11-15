import { MatchmakingConfig, MatchTicket, MatchGroup, MatchFoundHandler } from './matchmaking.types.js';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface DynamicLimits {
  readonly mmrWindow: number;
  readonly maxPing: number;
}

/**
 * Pure matchmaking logic for Quick Play.
 * Only one queue, no requestedPlayers, game-agnostic.
 */
export class MatchmakingService<TSession> {
  private readonly _config: MatchmakingConfig;
  private readonly _onMatchFound: MatchFoundHandler<TSession>;

  private _queue: MatchTicket<TSession>[] = [];
  private _ticketSeq = 0;

  public constructor(config: MatchmakingConfig, onMatchFound: MatchFoundHandler<TSession>) {
    this._config = config;
    this._onMatchFound = onMatchFound;
  }

  public enqueue(
    session: TSession,
    params: {
      userId: string;
      displayName: string;
      mmr: number;
      pingMs: number;
      matchmakingSessionId?: string;
    }
  ): MatchTicket<TSession> {
    const ticket: MatchTicket<TSession> = {
      id: `${Date.now()}-${this._ticketSeq++}`,
      session,
      playerId: params.userId,
      displayName: params.displayName,
      mmr: params.mmr,
      pingMs: params.pingMs,
      createdAt: Date.now(),
      matchmakingSessionId: params.matchmakingSessionId,
    };

    this._queue.push(ticket);
    return ticket;
  }

  public cancel(ticketId: string): void {
    const index = this._queue.findIndex((t) => t.id === ticketId);
    if (index !== -1) {
      this._queue.splice(index, 1);
    }
  }

  /**
   * Main matchmaking tick. Call this periodically (e.g. every 200–500ms).
   */
  public async tick(now: number): Promise<void> {
    if (this._queue.length === 0) {
      return;
    }

    const totalQueueSize = this._queue.length;
    const loadFactor = Math.min(totalQueueSize / this._config.loadTargetQueueSize, 1);

    // Oldest tickets first.
    this._queue.sort((a, b) => a.createdAt - b.createdAt);

    const used = new Set<string>();
    const matches: MatchGroup<TSession>[] = [];

    for (let i = 0; i < this._queue.length; i += 1) {
      const anchor = this._queue[i];
      if (!anchor || used.has(anchor.id)) {
        continue;
      }

      const group = this._buildGroup(anchor, this._queue, loadFactor, now, used);
      if (!group) {
        continue;
      }

      if (this._shouldStartMatch(group, now)) {
        for (const ticket of group.tickets) {
          used.add(ticket.id);
        }
        matches.push(group);
      }
    }

    console.log(`[${now}] Matchmaking: ${matches.length} matches found.`);

    if (used.size > 0) {
      const remaining = this._queue.filter((t) => !used.has(t.id));
      this._queue.length = 0;
      this._queue.push(...remaining);
    }

    for (const match of matches) {
      await this._onMatchFound(match);
    }
  }

  /**
   * Simple snapshot for debugging / tests.
   */
  public getQueueSize(): number {
    return this._queue.length;
  }

  private _getDynamicLimits(ticket: MatchTicket<TSession>, loadFactor: number, now: number): DynamicLimits {
    const WAIT_FULL_RELAX_MS = 20_000;
    const waitMs = now - ticket.createdAt;
    const waitT = Math.min(waitMs / WAIT_FULL_RELAX_MS, 1); // 0..1

    const loadClamp = Math.min(Math.max(loadFactor, 0), 1);

    const mmrWindow = lerp(this._config.baseMmrWindow, this._config.maxMmrWindow, (1 - loadClamp) * waitT);

    const maxPing = lerp(this._config.baseMaxPing, this._config.maxMaxPing, waitT * (1 - loadClamp));

    return { mmrWindow, maxPing };
  }

  private _buildGroup(
    anchor: MatchTicket<TSession>,
    queue: MatchTicket<TSession>[],
    loadFactor: number,
    now: number,
    used: Set<string>
  ): MatchGroup<TSession> | null {
    const { mmrWindow, maxPing } = this._getDynamicLimits(anchor, loadFactor, now);

    const group: MatchTicket<TSession>[] = [anchor];

    // Target human count for Quick Play.
    const targetHumans = Math.min(this._config.virtualCapacity, this._config.maxHumans);

    for (const candidate of queue) {
      if (candidate.id === anchor.id) {
        continue;
      }
      if (used.has(candidate.id)) {
        continue;
      }
      if (group.length >= targetHumans) {
        break;
      }

      const mmrDiff = Math.abs(candidate.mmr - anchor.mmr);
      if (mmrDiff > mmrWindow) {
        continue;
      }

      const pingDiff = Math.abs(candidate.pingMs - anchor.pingMs);
      if (pingDiff > maxPing) {
        continue;
      }

      group.push(candidate);
    }

    return { tickets: group };
  }

  private _shouldStartMatch(group: MatchGroup<TSession>, now: number): boolean {
    const humans = group.tickets.length;
    const oldestEnqueueAt = Math.min(...group.tickets.map((t) => t.createdAt));
    const waitMs = now - oldestEnqueueAt;
    const cfg = this._config;

    if (humans < cfg.hardMinHumans) {
      return false;
    }

    const delay = cfg.startDelayByHumans[humans] ?? cfg.startDelayByHumans.default;

    if (humans >= cfg.softMinHumans && waitMs >= delay * 0.5) {
      return true;
    }

    return waitMs >= delay;
  }
}
