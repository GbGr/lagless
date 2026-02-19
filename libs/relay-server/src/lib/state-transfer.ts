import { createLogger } from '@lagless/misc';
import { packStateRequest } from '@lagless/net-wire';
import type { PlayerConnection } from './player-connection.js';
import type { PlayerSlot } from './types.js';

const log = createLogger('StateTransfer');

// ─── Types ──────────────────────────────────────────────────

export interface StateResponse {
  readonly playerSlot: PlayerSlot;
  readonly tick: number;
  readonly hash: number;
  readonly state: ArrayBuffer;
}

export interface StateTransferResult {
  readonly state: ArrayBuffer;
  readonly tick: number;
  readonly hash: number;
  readonly votedBy: number;
  readonly totalResponses: number;
}

interface PendingRequest {
  readonly requestId: number;
  readonly respondents: Set<PlayerSlot>;
  readonly responses: StateResponse[];
  resolve: (result: StateTransferResult | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── StateTransfer ──────────────────────────────────────────

/**
 * Handles state transfer for late-join and reconnect.
 *
 * Flow:
 * 1. New player connects to an active match
 * 2. Server sends StateRequest to all connected clients
 * 3. Clients respond with their snapshot + tick + hash
 * 4. Majority vote selects the correct state
 * 5. Server sends selected state to the new player
 */
export class StateTransfer {
  private _nextRequestId = 1;
  private readonly _pendingRequests = new Map<number, PendingRequest>();

  constructor(
    private readonly _timeoutMs: number,
  ) {}

  /**
   * Request state from connected clients and resolve via majority vote.
   */
  public requestState(
    connections: ReadonlyMap<PlayerSlot, PlayerConnection>,
    excludeSlot?: PlayerSlot,
  ): Promise<StateTransferResult | null> {
    const respondents = this.getEligibleRespondents(connections, excludeSlot);
    if (respondents.length === 0) {
      log.warn('No eligible respondents for state transfer');
      return Promise.resolve(null);
    }

    const requestId = this._nextRequestId++;
    const requestMessage = packStateRequest(requestId);

    const respondentSlots = new Set<PlayerSlot>();
    for (const conn of respondents) {
      conn.send(requestMessage);
      respondentSlots.add(conn.slot);
    }

    log.info(`State request #${requestId} sent to ${respondents.length} clients`);

    return new Promise<StateTransferResult | null>((resolve) => {
      const timer = setTimeout(() => {
        this.resolveRequest(requestId);
      }, this._timeoutMs);

      this._pendingRequests.set(requestId, {
        requestId,
        respondents: respondentSlots,
        responses: [],
        resolve,
        timer,
      });
    });
  }

  /**
   * Called when a StateResponse message arrives from a client.
   */
  public receiveResponse(
    playerSlot: PlayerSlot,
    requestId: number,
    tick: number,
    hash: number,
    state: ArrayBuffer,
  ): void {
    const pending = this._pendingRequests.get(requestId);
    if (!pending) {
      log.warn(`StateResponse for unknown request #${requestId}`);
      return;
    }

    if (!pending.respondents.has(playerSlot)) {
      log.warn(`Unexpected respondent slot=${playerSlot} for request #${requestId}`);
      return;
    }

    pending.responses.push({ playerSlot, tick, hash, state });

    // Check if all respondents have replied
    if (pending.responses.length >= pending.respondents.size) {
      this.resolveRequest(requestId);
    }
  }

  /**
   * Cancel all pending requests (e.g. on room disposal).
   */
  public dispose(): void {
    for (const [, pending] of this._pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve(null);
    }
    this._pendingRequests.clear();
  }

  // ─── Private ────────────────────────────────────────────

  private resolveRequest(requestId: number): void {
    const pending = this._pendingRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this._pendingRequests.delete(requestId);

    if (pending.responses.length === 0) {
      log.warn(`State request #${requestId} timed out with no responses`);
      pending.resolve(null);
      return;
    }

    const result = this.majorityVote(pending.responses);
    log.info(
      `State request #${requestId} resolved: tick=${result.tick}, ` +
      `hash=0x${result.hash.toString(16)}, voted=${result.votedBy}/${result.totalResponses}`
    );
    pending.resolve(result);
  }

  private majorityVote(responses: StateResponse[]): StateTransferResult {
    // Group by hash
    const groups = new Map<number, StateResponse[]>();
    for (const resp of responses) {
      let group = groups.get(resp.hash);
      if (!group) {
        group = [];
        groups.set(resp.hash, group);
      }
      group.push(resp);
    }

    // Find largest group
    let bestGroup: StateResponse[] = responses.slice(0, 1);
    for (const group of groups.values()) {
      if (group.length > bestGroup.length) {
        bestGroup = group;
      }
    }

    const winner = bestGroup[0];
    return {
      state: winner.state,
      tick: winner.tick,
      hash: winner.hash,
      votedBy: bestGroup.length,
      totalResponses: responses.length,
    };
  }

  private getEligibleRespondents(
    connections: ReadonlyMap<PlayerSlot, PlayerConnection>,
    excludeSlot?: PlayerSlot,
  ): PlayerConnection[] {
    const result: PlayerConnection[] = [];
    for (const conn of connections.values()) {
      if (conn.isConnected && !conn.isBot && conn.slot !== excludeSlot) {
        result.push(conn);
      }
    }
    return result;
  }
}
