// ─── Queue Entry ────────────────────────────────────────────

export interface QueueEntry {
  readonly playerId: string;
  readonly mmr: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly joinedAt: number; // performance.now()
}

// ─── Scope Configuration ────────────────────────────────────

export interface ScopeConfig {
  readonly minPlayersToStart: number;
  readonly maxPlayers: number;
  readonly waitTimeoutMs: number;
}

// ─── Formed Match ───────────────────────────────────────────

export interface FormedMatch {
  readonly matchId: string;
  readonly scope: string;
  readonly players: ReadonlyArray<QueueEntry>;
  readonly botsNeeded: number;
}

// ─── Player Notification ────────────────────────────────────

export type PlayerNotifyFn = (message: MatchmakingMessage) => void;

export type MatchmakingMessage =
  | { readonly type: 'queued'; readonly position: number; readonly total: number }
  | MatchFoundMessage
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'removed'; readonly reason: 'disconnected' | 'cancelled' | 'timeout' };

export interface MatchFoundMessage {
  readonly type: 'match_found';
  readonly matchId: string;
  readonly playerSlot: number;
  readonly [key: string]: unknown;
}

// ─── Callbacks ──────────────────────────────────────────────

/**
 * Called when a match is formed. Game server should:
 * 1. Create a RelayRoom via RoomRegistry
 * 2. Generate tokens for each player
 * 3. Notify players with match_found (including token/serverUrl)
 *
 * @returns Map of playerId → additional match_found data (token, serverUrl, etc.)
 * The service will merge this into match_found messages and send to players.
 */
export type OnMatchFormedFn = (
  match: FormedMatch,
) => Promise<ReadonlyMap<string, MatchFoundPlayerData>> | ReadonlyMap<string, MatchFoundPlayerData>;

export interface MatchFoundPlayerData {
  readonly playerSlot: number;
  readonly token: string;
  readonly serverUrl?: string;
  readonly [key: string]: unknown;
}

// ─── Late-Join ──────────────────────────────────────────────

export type TryLateJoinFn = (
  playerId: string,
  scope: string,
  metadata: Readonly<Record<string, unknown>>,
) => LateJoinResult | null;

export interface LateJoinResult {
  readonly matchId: string;
  readonly playerData: MatchFoundPlayerData;
}

// ─── Queue Store ────────────────────────────────────────────

export interface QueueStore {
  add(scope: string, entry: QueueEntry): void;
  remove(scope: string, playerId: string): boolean;
  getAll(scope: string): ReadonlyArray<QueueEntry>;
  getCount(scope: string): number;
  getActiveScopes(): ReadonlyArray<string>;
  has(scope: string, playerId: string): boolean;
  clear(): void;
}
