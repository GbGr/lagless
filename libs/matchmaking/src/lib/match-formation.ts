import type { QueueEntry, ScopeConfig } from './types.js';

export interface FormationCandidate {
  readonly players: QueueEntry[];
  readonly botsNeeded: number;
}

/**
 * Determines whether a match can be formed from current queue entries.
 * Pure function — no side effects.
 *
 * Rules:
 * 1. If enough players (>= maxPlayers) → form immediately, pick by MMR proximity
 * 2. If timeout reached and enough for min → form with available, fill bots
 * 3. Otherwise → null (keep waiting)
 */
export function tryFormMatch(
  entries: ReadonlyArray<QueueEntry>,
  config: ScopeConfig,
  nowMs: number,
): FormationCandidate | null {
  if (entries.length === 0) return null;

  // Case 1: Enough players for a full match
  if (entries.length >= config.maxPlayers) {
    const players = pickByMmrProximity(entries, config.maxPlayers);
    return { players, botsNeeded: 0 };
  }

  // Case 2: Timeout reached, check minimum
  const oldestEntry = entries[0]; // sorted by joinedAt (FIFO)
  const waitTime = nowMs - oldestEntry.joinedAt;

  if (waitTime >= config.waitTimeoutMs && entries.length >= config.minPlayersToStart) {
    const players = [...entries].slice(0, config.maxPlayers);
    const botsNeeded = config.maxPlayers - players.length;
    return { players, botsNeeded };
  }

  return null;
}

/**
 * Select players closest in MMR to the longest-waiting player.
 * Always includes the longest-waiting player (FIFO guarantee).
 */
function pickByMmrProximity(
  entries: ReadonlyArray<QueueEntry>,
  count: number,
): QueueEntry[] {
  if (entries.length <= count) return [...entries];

  // The longest-waiting player anchors the selection
  const anchor = entries[0];
  const targetMmr = anchor.mmr;

  // Sort remaining by MMR distance to anchor
  const rest = entries.slice(1);
  const sorted = [...rest].sort(
    (a, b) => Math.abs(a.mmr - targetMmr) - Math.abs(b.mmr - targetMmr),
  );

  return [anchor, ...sorted.slice(0, count - 1)];
}
