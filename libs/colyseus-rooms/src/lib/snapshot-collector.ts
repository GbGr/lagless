// libs/colyseus-rooms/src/lib/snapshot-collector.ts

import {
  type SnapshotVote,
  calculateMajorityVote,
  getMajorityThreshold,
  hasReachedMajority,
} from '@lagless/net-wire';

/**
 * Configuration for snapshot collection
 */
export interface SnapshotCollectorConfig {
  /** Timeout for collecting snapshots (ms) */
  readonly timeoutMs: number;
  /** Number of retry attempts before failure */
  readonly retryCount: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_SNAPSHOT_COLLECTOR_CONFIG: SnapshotCollectorConfig = {
  timeoutMs: 3000,
  retryCount: 1,
};

/**
 * A pending snapshot request tracking all votes
 */
export interface PendingSnapshotRequest {
  readonly requestId: number;
  readonly lateJoinerSessionId: string;
  readonly lateJoinerSlot: number;
  readonly targetTickMin: number;
  readonly targetTickMax: number;
  readonly eligiblePlayerSlots: ReadonlySet<number>;
  readonly votes: Map<number, SnapshotVote>;
  readonly createdAt: number;
  retryAttempt: number;
}

/**
 * Result of a successful snapshot collection
 */
export interface SnapshotCollectionSuccess {
  readonly requestId: number;
  readonly lateJoinerSessionId: string;
  readonly lateJoinerSlot: number;
  readonly snapshot: ArrayBuffer;
  readonly tick: number;
  readonly hash32: number;
  readonly offenderSlots: number[];
}

/**
 * Result of a failed snapshot collection
 */
export interface SnapshotCollectionFailure {
  readonly requestId: number;
  readonly lateJoinerSessionId: string;
  readonly lateJoinerSlot: number;
  readonly reason: 'timeout' | 'no_majority' | 'cancelled';
  readonly canRetry: boolean;
}

/**
 * Callback types for snapshot collection events
 */
export type OnSnapshotSuccess = (result: SnapshotCollectionSuccess) => void;
export type OnSnapshotFailure = (result: SnapshotCollectionFailure) => void;
export type OnRequestSnapshot = (
  requestId: number,
  targetTickMin: number,
  targetTickMax: number,
  eligibleSlots: ReadonlySet<number>
) => void;

/**
 * Manages snapshot request lifecycle for late-join voting
 *
 * Flow:
 * 1. initiateRequest() - Start collecting snapshots for a late joiner
 * 2. handleResponse() - Process incoming snapshot responses
 * 3. tick() - Check for timeouts and trigger retries/failures
 */
export class SnapshotCollector {
  private readonly _config: SnapshotCollectorConfig;
  private readonly _pendingRequests = new Map<number, PendingSnapshotRequest>();
  private _nextRequestId = 1;

  private readonly _onSuccess: OnSnapshotSuccess;
  private readonly _onFailure: OnSnapshotFailure;
  private readonly _onRequestSnapshot: OnRequestSnapshot;

  constructor(
    config: Partial<SnapshotCollectorConfig>,
    onSuccess: OnSnapshotSuccess,
    onFailure: OnSnapshotFailure,
    onRequestSnapshot: OnRequestSnapshot
  ) {
    this._config = { ...DEFAULT_SNAPSHOT_COLLECTOR_CONFIG, ...config };
    this._onSuccess = onSuccess;
    this._onFailure = onFailure;
    this._onRequestSnapshot = onRequestSnapshot;
  }

  /**
   * Start a snapshot collection request for a late joiner
   *
   * @param lateJoinerSessionId - Session ID of the late joiner
   * @param lateJoinerSlot - Player slot of the late joiner
   * @param targetTickMin - Minimum acceptable snapshot tick
   * @param targetTickMax - Maximum acceptable snapshot tick
   * @param eligiblePlayerSlots - Set of player slots that can provide snapshots
   * @returns Request ID
   */
  public initiateRequest(
    lateJoinerSessionId: string,
    lateJoinerSlot: number,
    targetTickMin: number,
    targetTickMax: number,
    eligiblePlayerSlots: ReadonlySet<number>
  ): number {
    const requestId = this._nextRequestId++;

    const request: PendingSnapshotRequest = {
      requestId,
      lateJoinerSessionId,
      lateJoinerSlot,
      targetTickMin,
      targetTickMax,
      eligiblePlayerSlots,
      votes: new Map(),
      createdAt: Date.now(),
      retryAttempt: 0,
    };

    this._pendingRequests.set(requestId, request);

    // Trigger snapshot request broadcast
    this._onRequestSnapshot(requestId, targetTickMin, targetTickMax, eligiblePlayerSlots);

    return requestId;
  }

  /**
   * Handle an incoming snapshot response from a client
   *
   * @param playerSlot - Slot of the player sending the response
   * @param requestId - Request ID this responds to
   * @param tick - Snapshot tick
   * @param hash32 - Snapshot hash
   * @param snapshotBytes - Snapshot data
   */
  public handleResponse(
    playerSlot: number,
    requestId: number,
    tick: number,
    hash32: number,
    snapshotBytes: ArrayBuffer
  ): void {
    const request = this._pendingRequests.get(requestId);
    if (!request) {
      // Request already completed or doesn't exist
      return;
    }

    // Validate player is eligible
    if (!request.eligiblePlayerSlots.has(playerSlot)) {
      console.warn(`[SnapshotCollector] Ignoring response from ineligible slot ${playerSlot}`);
      return;
    }

    // Validate tick is in range
    if (tick < request.targetTickMin || tick > request.targetTickMax) {
      console.warn(
        `[SnapshotCollector] Ignoring response with tick ${tick} outside range [${request.targetTickMin}, ${request.targetTickMax}]`
      );
      return;
    }

    // Already have a vote from this player
    if (request.votes.has(playerSlot)) {
      return;
    }

    // Record vote
    const vote: SnapshotVote = {
      playerSlot,
      tick,
      hash32,
      snapshotBytes,
      receivedAt: Date.now(),
    };
    request.votes.set(playerSlot, vote);

    // Check for early majority
    this.checkForMajority(request);
  }

  /**
   * Cancel a pending request (e.g., late joiner disconnected)
   */
  public cancelRequest(requestId: number): void {
    const request = this._pendingRequests.get(requestId);
    if (!request) {
      return;
    }

    this._pendingRequests.delete(requestId);
    this._onFailure({
      requestId,
      lateJoinerSessionId: request.lateJoinerSessionId,
      lateJoinerSlot: request.lateJoinerSlot,
      reason: 'cancelled',
      canRetry: false,
    });
  }

  /**
   * Cancel all requests for a specific late joiner
   */
  public cancelRequestsForSession(sessionId: string): void {
    for (const [requestId, request] of this._pendingRequests) {
      if (request.lateJoinerSessionId === sessionId) {
        this.cancelRequest(requestId);
      }
    }
  }

  /**
   * Check for timeouts and process pending requests
   * Should be called periodically (e.g., every tick)
   */
  public tick(now: number): void {
    for (const [requestId, request] of this._pendingRequests) {
      const elapsed = now - request.createdAt;

      if (elapsed >= this._config.timeoutMs) {
        this.handleTimeout(request);
      }
    }
  }

  /**
   * Get count of pending requests
   */
  public get pendingCount(): number {
    return this._pendingRequests.size;
  }

  /**
   * Check if there's a pending request for a session
   */
  public hasPendingRequest(sessionId: string): boolean {
    for (const request of this._pendingRequests.values()) {
      if (request.lateJoinerSessionId === sessionId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if we've reached majority and complete the request
   */
  private checkForMajority(request: PendingSnapshotRequest): void {
    const votes = Array.from(request.votes.values());
    const eligibleCount = request.eligiblePlayerSlots.size;

    // Try to calculate majority
    const result = calculateMajorityVote(votes, eligibleCount);

    if (result.success && result.winner) {
      // Success! Complete the request
      this._pendingRequests.delete(request.requestId);
      this._onSuccess({
        requestId: request.requestId,
        lateJoinerSessionId: request.lateJoinerSessionId,
        lateJoinerSlot: request.lateJoinerSlot,
        snapshot: result.winner.snapshot,
        tick: result.winner.tick,
        hash32: result.winner.hash32,
        offenderSlots: result.offenderSlots,
      });
      return;
    }

    // Check if all eligible players have voted (no more votes coming)
    if (votes.length >= eligibleCount) {
      // All votes are in but no majority - fail
      this.handleNoMajority(request);
    }
  }

  /**
   * Handle timeout for a request
   */
  private handleTimeout(request: PendingSnapshotRequest): void {
    const votes = Array.from(request.votes.values());
    const eligibleCount = request.eligiblePlayerSlots.size;

    // Try one last majority calculation with what we have
    const result = calculateMajorityVote(votes, eligibleCount);

    if (result.success && result.winner) {
      this._pendingRequests.delete(request.requestId);
      this._onSuccess({
        requestId: request.requestId,
        lateJoinerSessionId: request.lateJoinerSessionId,
        lateJoinerSlot: request.lateJoinerSlot,
        snapshot: result.winner.snapshot,
        tick: result.winner.tick,
        hash32: result.winner.hash32,
        offenderSlots: result.offenderSlots,
      });
      return;
    }

    // Check if we can retry
    if (request.retryAttempt < this._config.retryCount) {
      this.retryRequest(request);
      return;
    }

    // Final failure
    this._pendingRequests.delete(request.requestId);
    this._onFailure({
      requestId: request.requestId,
      lateJoinerSessionId: request.lateJoinerSessionId,
      lateJoinerSlot: request.lateJoinerSlot,
      reason: 'timeout',
      canRetry: false,
    });
  }

  /**
   * Handle case where all votes are in but no majority
   */
  private handleNoMajority(request: PendingSnapshotRequest): void {
    // Check if we can retry
    if (request.retryAttempt < this._config.retryCount) {
      this.retryRequest(request);
      return;
    }

    this._pendingRequests.delete(request.requestId);
    this._onFailure({
      requestId: request.requestId,
      lateJoinerSessionId: request.lateJoinerSessionId,
      lateJoinerSlot: request.lateJoinerSlot,
      reason: 'no_majority',
      canRetry: false,
    });
  }

  /**
   * Retry a request with fresh state
   */
  private retryRequest(request: PendingSnapshotRequest): void {
    // Clear votes and reset timer
    request.votes.clear();
    request.retryAttempt++;
    // Update createdAt to reset timeout
    (request as { createdAt: number }).createdAt = Date.now();

    console.log(
      `[SnapshotCollector] Retrying request ${request.requestId} (attempt ${request.retryAttempt + 1})`
    );

    // Re-broadcast snapshot request
    this._onRequestSnapshot(
      request.requestId,
      request.targetTickMin,
      request.targetTickMax,
      request.eligiblePlayerSlots
    );
  }
}
