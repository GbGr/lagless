export interface SnapshotVoteCandidate {
  readonly tick: number;
  readonly hash32: number;
  readonly bytes: Uint8Array;
  readonly senders: number[];
  count: number;
  firstCompletedAt: number;
}

export class LateJoinVote {
  private readonly _candidates = new Map<string, SnapshotVoteCandidate>();
  private readonly _senderSlots = new Set<number>();
  private _winner: SnapshotVoteCandidate | null = null;

  constructor(
    private readonly _majorityThreshold: number,
    private readonly _minVotes: number
  ) {
    if (_majorityThreshold <= 0 || _minVotes <= 0) {
      throw new Error('Vote thresholds must be > 0');
    }
  }

  public get winner(): SnapshotVoteCandidate | null {
    return this._winner;
  }

  public addVote(
    senderSlot: number,
    tick: number,
    hash32: number,
    bytes: Uint8Array,
    receivedAt: number
  ): SnapshotVoteCandidate | null {
    if (this._senderSlots.has(senderSlot)) return null;

    this._senderSlots.add(senderSlot);

    const key = `${tick}:${hash32}`;
    let candidate = this._candidates.get(key);
    if (!candidate) {
      candidate = {
        tick,
        hash32,
        bytes,
        senders: [],
        count: 0,
        firstCompletedAt: receivedAt,
      };
      this._candidates.set(key, candidate);
    }

    candidate.count += 1;
    candidate.senders.push(senderSlot);

    this._winner = this.tryResolve();
    return this._winner;
  }

  private tryResolve(): SnapshotVoteCandidate | null {
    const threshold = Math.max(this._minVotes, this._majorityThreshold);

    const eligible = Array.from(this._candidates.values()).filter((candidate) => {
      return candidate.count >= threshold;
    });

    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
      if (a.tick !== b.tick) return b.tick - a.tick;
      if (a.firstCompletedAt !== b.firstCompletedAt) return a.firstCompletedAt - b.firstCompletedAt;
      return a.hash32 - b.hash32;
    });

    return eligible[0];
  }
}
