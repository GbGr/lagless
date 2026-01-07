import { describe, expect, it } from 'vitest';
import { LateJoinVote } from './late-join-vote.js';

describe('LateJoinVote', () => {
  it('resolves once a candidate reaches majority threshold', () => {
    const vote = new LateJoinVote(2, 1);
    const bytes = new Uint8Array([1, 2, 3]);

    expect(vote.addVote(1, 10, 111, bytes, 100)).toBeNull();
    const winner = vote.addVote(2, 10, 111, bytes, 110);

    expect(winner).not.toBeNull();
    expect(winner?.tick).toBe(10);
    expect(winner?.hash32).toBe(111);
  });

  it('prefers higher tick, then earliest completion, then lowest hash', () => {
    const vote = new LateJoinVote(2, 1);
    const bytes = new Uint8Array([1]);

    vote.addVote(1, 5, 20, bytes, 200);
    vote.addVote(2, 6, 30, bytes, 150);
    const winnerHigherTick = vote.addVote(3, 6, 30, bytes, 160);
    expect(winnerHigherTick?.tick).toBe(6);

    const voteTie = new LateJoinVote(2, 1);
    voteTie.addVote(1, 7, 50, bytes, 200);
    voteTie.addVote(2, 7, 40, bytes, 150);
    voteTie.addVote(3, 7, 50, bytes, 210);
    const winnerEarlier = voteTie.addVote(4, 7, 40, bytes, 160);
    expect(winnerEarlier?.hash32).toBe(40);
  });

  it('ignores duplicate sender votes', () => {
    const vote = new LateJoinVote(2, 1);
    const bytes = new Uint8Array([1]);

    vote.addVote(1, 3, 10, bytes, 100);
    const winner = vote.addVote(1, 3, 10, bytes, 110);

    expect(winner).toBeNull();
  });
});
