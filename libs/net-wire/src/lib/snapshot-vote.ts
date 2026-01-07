// libs/net-wire/src/lib/snapshot-vote.ts

/**
 * Snapshot voting logic for late-join majority consensus
 * Pure functions - no side effects, easily testable
 */

/**
 * A single vote from a connected client
 */
export interface SnapshotVote {
  readonly playerSlot: number;
  readonly tick: number;
  readonly hash32: number;
  readonly snapshotBytes: ArrayBuffer;
  readonly receivedAt: number;
}

/**
 * Result of majority vote calculation
 */
export interface VoteResult {
  readonly success: boolean;
  readonly winner?: {
    readonly tick: number;
    readonly hash32: number;
    readonly snapshot: ArrayBuffer;
  };
  readonly offenderSlots: number[];
}

/**
 * Group key for votes (tick:hash)
 */
function getVoteGroupKey(tick: number, hash32: number): string {
  return `${tick}:${hash32}`;
}

/**
 * Calculate majority vote from collected snapshot responses
 *
 * @param votes - Array of received votes
 * @param eligibleCount - Total number of eligible voters (connected players)
 * @param minVotes - Minimum votes required for consensus (default: 2)
 * @returns VoteResult with winner if majority found, offender slots for mismatched votes
 *
 * Majority threshold: floor(eligibleCount / 2) + 1, but at least minVotes
 *
 * Tie-breaker rules (if multiple groups reach threshold):
 * 1. Prefer higher tick (more recent state)
 * 2. Prefer earlier arrival time
 * 3. Prefer lower hash (deterministic fallback)
 */
export function calculateMajorityVote(
  votes: ReadonlyArray<SnapshotVote>,
  eligibleCount: number,
  minVotes = 2
): VoteResult {
  if (votes.length === 0) {
    return { success: false, offenderSlots: [] };
  }

  // Group votes by (tick, hash)
  const groups = new Map<string, SnapshotVote[]>();

  for (const vote of votes) {
    const key = getVoteGroupKey(vote.tick, vote.hash32);
    const group = groups.get(key) ?? [];
    group.push(vote);
    groups.set(key, group);
  }

  // Calculate threshold: floor(N/2) + 1, minimum of minVotes
  const threshold = Math.max(Math.floor(eligibleCount / 2) + 1, minVotes);

  // Find all groups that meet threshold
  const validGroups: Array<{ key: string; votes: SnapshotVote[] }> = [];

  for (const [key, groupVotes] of groups) {
    if (groupVotes.length >= threshold) {
      validGroups.push({ key, votes: groupVotes });
    }
  }

  // No majority found
  if (validGroups.length === 0) {
    return { success: false, offenderSlots: [] };
  }

  // Sort valid groups by tie-breaker rules
  validGroups.sort((a, b) => {
    const aVote = a.votes[0];
    const bVote = b.votes[0];

    // 1. Prefer higher tick (more recent)
    if (aVote.tick !== bVote.tick) {
      return bVote.tick - aVote.tick;
    }

    // 2. Prefer earlier arrival (first to arrive wins)
    const aMinTime = Math.min(...a.votes.map((v) => v.receivedAt));
    const bMinTime = Math.min(...b.votes.map((v) => v.receivedAt));
    if (aMinTime !== bMinTime) {
      return aMinTime - bMinTime;
    }

    // 3. Deterministic fallback: lower hash
    return aVote.hash32 - bVote.hash32;
  });

  const winningGroup = validGroups[0];
  const winningVote = winningGroup.votes[0];

  // Identify offenders: players who voted for something else
  const winningKey = winningGroup.key;
  const offenderSlots: number[] = [];

  for (const vote of votes) {
    const voteKey = getVoteGroupKey(vote.tick, vote.hash32);
    if (voteKey !== winningKey) {
      offenderSlots.push(vote.playerSlot);
    }
  }

  return {
    success: true,
    winner: {
      tick: winningVote.tick,
      hash32: winningVote.hash32,
      snapshot: winningVote.snapshotBytes,
    },
    offenderSlots,
  };
}

/**
 * Check if we have enough votes to potentially reach majority
 * Useful for early termination when all possible voters have responded
 */
export function canReachMajority(
  currentVotes: number,
  remainingVoters: number,
  eligibleCount: number,
  minVotes = 2
): boolean {
  const threshold = Math.max(Math.floor(eligibleCount / 2) + 1, minVotes);
  return currentVotes + remainingVoters >= threshold;
}

/**
 * Check if a specific group has reached majority
 */
export function hasReachedMajority(
  groupSize: number,
  eligibleCount: number,
  minVotes = 2
): boolean {
  const threshold = Math.max(Math.floor(eligibleCount / 2) + 1, minVotes);
  return groupSize >= threshold;
}

/**
 * Get the majority threshold for a given eligible count
 */
export function getMajorityThreshold(eligibleCount: number, minVotes = 2): number {
  return Math.max(Math.floor(eligibleCount / 2) + 1, minVotes);
}
