import { describe, it, expect, beforeEach } from 'vitest';
import { RPCHistory } from './rpc-history.js';
import { RPC } from './rpc.js';
import type { IAbstractInputConstructor, InputMeta } from '../types/index.js';

// ─── Test helpers ───────────────────────────────────────────

function makeRPC(
  tick: number,
  playerSlot: number,
  ordinal: number,
  inputId = 1,
  seq = 1,
): RPC {
  const meta: InputMeta = { tick, seq, ordinal, playerSlot };
  return new RPC(inputId, meta, {});
}

const InputA = { id: 1 } as unknown as IAbstractInputConstructor;

// ─── Tests ──────────────────────────────────────────────────

describe('RPCHistory', () => {
  let history: RPCHistory;

  beforeEach(() => {
    history = new RPCHistory();
  });

  describe('addRPC', () => {
    it('should add and retrieve RPC by tick and input type', () => {
      const rpc = makeRPC(10, 0, 1, 1);
      history.addRPC(rpc);

      const result = history.getTickRPCs(10, InputA);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(rpc);
    });

    it('should return empty for non-existent tick', () => {
      const result = history.getTickRPCs(999, InputA);
      expect(result.length).toBe(0);
    });

    it('should filter by input type', () => {
      history.addRPC(makeRPC(10, 0, 1, 1)); // InputA
      history.addRPC(makeRPC(10, 0, 2, 2)); // InputB

      const resultA = history.getTickRPCs(10, InputA);
      expect(resultA.length).toBe(1);
      expect(resultA[0].inputId).toBe(1);
    });
  });

  describe('deterministic ordering', () => {
    it('should order by playerSlot first', () => {
      history.addRPC(makeRPC(10, 2, 1));
      history.addRPC(makeRPC(10, 0, 1));
      history.addRPC(makeRPC(10, 1, 1));

      const result = history.getTickRPCs(10, InputA);
      expect(result.length).toBe(3);
      expect(result[0].meta.playerSlot).toBe(0);
      expect(result[1].meta.playerSlot).toBe(1);
      expect(result[2].meta.playerSlot).toBe(2);
    });

    it('should order by ordinal within same playerSlot', () => {
      history.addRPC(makeRPC(10, 0, 3));
      history.addRPC(makeRPC(10, 0, 1));
      history.addRPC(makeRPC(10, 0, 2));

      const result = history.getTickRPCs(10, InputA);
      expect(result.length).toBe(3);
      expect(result[0].meta.ordinal).toBe(1);
      expect(result[1].meta.ordinal).toBe(2);
      expect(result[2].meta.ordinal).toBe(3);
    });

    it('should maintain order with interleaved adds', () => {
      // Simulate network arrival: remote before local
      history.addRPC(makeRPC(10, 1, 1)); // remote
      history.addRPC(makeRPC(10, 0, 1)); // local (lower slot, should come first)

      const result = history.getTickRPCs(10, InputA);
      expect(result[0].meta.playerSlot).toBe(0);
      expect(result[1].meta.playerSlot).toBe(1);
    });
  });

  describe('addBatch', () => {
    it('should add multiple RPCs efficiently', () => {
      const rpcs = [
        makeRPC(10, 2, 1),
        makeRPC(10, 0, 1),
        makeRPC(11, 0, 1),
      ];
      history.addBatch(rpcs);

      expect(history.getTickRPCs(10, InputA).length).toBe(2);
      expect(history.getTickRPCs(11, InputA).length).toBe(1);

      // Should be sorted within tick 10
      const tick10 = history.getTickRPCs(10, InputA);
      expect(tick10[0].meta.playerSlot).toBe(0);
      expect(tick10[1].meta.playerSlot).toBe(2);
    });
  });

  describe('removePlayerInputsAtTick', () => {
    it('should remove specific player inputs at tick', () => {
      history.addRPC(makeRPC(10, 0, 1, 1, 5));
      history.addRPC(makeRPC(10, 1, 1, 1, 5));
      history.addRPC(makeRPC(10, 0, 2, 1, 5));

      history.removePlayerInputsAtTick(0, 10, 5);

      const result = history.getTickRPCs(10, InputA);
      expect(result.length).toBe(1);
      expect(result[0].meta.playerSlot).toBe(1);
    });

    it('should delete tick entry when all RPCs removed', () => {
      history.addRPC(makeRPC(10, 0, 1, 1, 5));
      history.removePlayerInputsAtTick(0, 10, 5);

      expect(history.size).toBe(0);
    });

    it('should no-op for non-existent tick', () => {
      history.removePlayerInputsAtTick(0, 999, 1);
      expect(history.size).toBe(0);
    });
  });

  describe('getTickRPCs shared buffer', () => {
    it('should reuse the same internal buffer across calls', () => {
      history.addRPC(makeRPC(10, 0, 1, 1));
      history.addRPC(makeRPC(11, 0, 1, 1));

      const result1 = history.getTickRPCs(10, InputA);
      expect(result1.length).toBe(1);

      // Second call clears the buffer
      const result2 = history.getTickRPCs(11, InputA);
      expect(result2.length).toBe(1);

      // result1 reference now points to the reused buffer which has been overwritten
      // This is expected behavior — documented as ephemeral
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      history.addRPC(makeRPC(10, 0, 1));
      history.addRPC(makeRPC(11, 0, 1));

      history.clear();
      expect(history.size).toBe(0);
      expect(history.totalRPCCount).toBe(0);
    });
  });

  describe('size and totalRPCCount', () => {
    it('should track unique ticks and total RPCs', () => {
      history.addRPC(makeRPC(10, 0, 1));
      history.addRPC(makeRPC(10, 1, 1));
      history.addRPC(makeRPC(11, 0, 1));

      expect(history.size).toBe(2);        // 2 unique ticks
      expect(history.totalRPCCount).toBe(3); // 3 total RPCs
    });
  });

  describe('filterLocalRPCs', () => {
    it('should filter out local player RPCs', () => {
      const rpcs = [
        makeRPC(10, 0, 1),
        makeRPC(10, 1, 1),
        makeRPC(10, 2, 1),
      ];
      const filtered = RPCHistory.filterLocalRPCs(rpcs, 0);
      expect(filtered.length).toBe(2);
      expect(filtered.every(r => r.meta.playerSlot !== 0)).toBe(true);
    });
  });

  // ─── Determinism tests ──────────────────────────────────

  describe('determinism', () => {
    it('addRPC and addBatch should produce identical ordering', () => {
      const h1 = new RPCHistory();
      const h2 = new RPCHistory();

      const rpcs = [
        makeRPC(10, 2, 1, 1, 3),
        makeRPC(10, 0, 2, 1, 1),
        makeRPC(10, 0, 1, 1, 1),
        makeRPC(10, 1, 1, 1, 2),
      ];

      // Add one-by-one
      for (const rpc of rpcs) h1.addRPC(rpc);

      // Add as batch
      h2.addBatch(rpcs);

      // Both should have identical ordering
      const r1 = h1.getTickRPCs(10, InputA);
      const r2 = h2.getTickRPCs(10, InputA);

      expect(r1.length).toBe(r2.length);
      for (let i = 0; i < r1.length; i++) {
        expect(r1[i].meta.playerSlot).toBe(r2[i].meta.playerSlot);
        expect(r1[i].meta.ordinal).toBe(r2[i].meta.ordinal);
        expect(r1[i].meta.seq).toBe(r2[i].meta.seq);
      }
    });

    it('insertion order should not affect final order', () => {
      const h1 = new RPCHistory();
      const h2 = new RPCHistory();

      // Same RPCs, different insertion order
      h1.addRPC(makeRPC(10, 0, 1, 1, 1));
      h1.addRPC(makeRPC(10, 1, 1, 1, 1));
      h1.addRPC(makeRPC(10, 2, 1, 1, 1));

      h2.addRPC(makeRPC(10, 2, 1, 1, 1));
      h2.addRPC(makeRPC(10, 0, 1, 1, 1));
      h2.addRPC(makeRPC(10, 1, 1, 1, 1));

      const r1 = h1.getTickRPCs(10, InputA);
      const r2 = h2.getTickRPCs(10, InputA);

      expect(r1.length).toBe(3);
      for (let i = 0; i < r1.length; i++) {
        expect(r1[i].meta.playerSlot).toBe(r2[i].meta.playerSlot);
      }

      // Must be sorted by slot: 0, 1, 2
      expect(r1[0].meta.playerSlot).toBe(0);
      expect(r1[1].meta.playerSlot).toBe(1);
      expect(r1[2].meta.playerSlot).toBe(2);
    });

    it('seq should break ties when playerSlot and ordinal are equal', () => {
      // Edge case: shouldn't happen in practice, but sort must be total
      const h = new RPCHistory();
      h.addRPC(makeRPC(10, 0, 1, 1, 5));
      h.addRPC(makeRPC(10, 0, 1, 1, 3));
      h.addRPC(makeRPC(10, 0, 1, 1, 1));

      const result = h.getTickRPCs(10, InputA);
      expect(result.length).toBe(3);
      expect(result[0].meta.seq).toBe(1);
      expect(result[1].meta.seq).toBe(3);
      expect(result[2].meta.seq).toBe(5);
    });

    it('multiple inputs per frame from one player maintain ordinal order', () => {
      // Simulates: player presses Move + LookAt in same frame
      const h = new RPCHistory();

      // Same tick, same slot, same seq, different ordinals
      h.addRPC(makeRPC(10, 0, 2, 2, 1)); // LookAt (ordinal=2)
      h.addRPC(makeRPC(10, 0, 1, 1, 1)); // Move (ordinal=1)

      const InputAll = { id: 1 } as unknown as IAbstractInputConstructor;
      const InputAll2 = { id: 2 } as unknown as IAbstractInputConstructor;

      const moves = h.getTickRPCs(10, InputAll);
      expect(moves.length).toBe(1);
      expect(moves[0].meta.ordinal).toBe(1);

      const looks = h.getTickRPCs(10, InputAll2);
      expect(looks.length).toBe(1);
      expect(looks[0].meta.ordinal).toBe(2);
    });

    it('remote + local RPCs interleave deterministically', () => {
      // Simulates: local player=0 adds input, then remote player=1 arrives
      const h = new RPCHistory();

      h.addRPC(makeRPC(10, 0, 1, 1, 1)); // local
      h.addRPC(makeRPC(10, 1, 1, 1, 5)); // remote (different seq, same ordinal)

      const result = h.getTickRPCs(10, InputA);
      expect(result.length).toBe(2);

      // slot 0 before slot 1
      expect(result[0].meta.playerSlot).toBe(0);
      expect(result[1].meta.playerSlot).toBe(1);
    });
  });
});
