export interface StartDelayConfig {
  readonly default: number;
  readonly [humans: number]: number; // delay in ms for given human count
}

/**
 * Pure matchmaking configuration, game-agnostic.
 */
export interface MatchmakingConfig {
  // Total number of “slots” in the match (humans + bots).
  readonly virtualCapacity: number;

  // Maximum real human players in this room (e.g. Colyseus maxClients).
  readonly maxHumans: number;

  // For Quick Play: desirable and hard minimum human counts.
  readonly softMinHumans: number;
  readonly hardMinHumans: number;

  // Start delays depending on how many humans are in the group.
  readonly startDelayByHumans: StartDelayConfig;

  // MMR + ping window configuration (difference windows).
  readonly baseMmrWindow: number;
  readonly maxMmrWindow: number;

  readonly baseMaxPing: number;
  readonly maxMaxPing: number;

  // Queue size at which we treat matchmaking as “fully loaded”.
  readonly loadTargetQueueSize: number;
}

/**
 * Single ticket in matchmaking queue.
 */
export interface MatchTicket<TSession> {
  readonly id: string;
  readonly session: TSession;

  readonly userId: string;
  readonly displayName: string;
  readonly mmr: number;
  readonly pingMs: number;

  readonly createdAt: number; // timestamp in ms
}

/**
 * Resulting group when a match is found.
 */
export interface MatchGroup<TSession> {
  readonly tickets: ReadonlyArray<MatchTicket<TSession>>;
}

/**
 * Callback invoked when a match is found.
 */
export type MatchFoundHandler<TSession> =
  (group: MatchGroup<TSession>) => Promise<void>;
