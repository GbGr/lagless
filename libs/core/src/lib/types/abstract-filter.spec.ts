import { describe, it, expect, beforeEach } from 'vitest';
import { AbstractFilter } from './abstract-filter.js';
import { MemoryTracker } from '@lagless/binary';

// ─── Concrete test filter ───────────────────────────────────

class TestFilter extends AbstractFilter {
  readonly includeMask = [3];
  readonly excludeMask = [0];
}

// ─── Helpers ────────────────────────────────────────────────

function createFilter(maxEntities = 100): TestFilter {
  const tracker = new MemoryTracker();
  TestFilter.calculateSize(maxEntities, tracker);
  const buffer = new ArrayBuffer(tracker.ptr);
  const initTracker = new MemoryTracker();
  return new TestFilter(maxEntities, buffer, initTracker);
}

// ─── Tests ──────────────────────────────────────────────────

describe('AbstractFilter', () => {
  let filter: TestFilter;

  beforeEach(() => {
    filter = createFilter();
  });

  describe('addEntityToFilter', () => {
    it('should add entity and increment length', () => {
      filter.addEntityToFilter(5);
      expect(filter.length).toBe(1);

      filter.addEntityToFilter(10);
      expect(filter.length).toBe(2);
    });

    it('should not add duplicate entity', () => {
      filter.addEntityToFilter(5);
      filter.addEntityToFilter(5);
      expect(filter.length).toBe(1);
    });

    it('should iterate added entities', () => {
      filter.addEntityToFilter(3);
      filter.addEntityToFilter(7);

      const entities = [...filter];
      expect(entities).toContain(3);
      expect(entities).toContain(7);
      expect(entities.length).toBe(2);
    });
  });

  describe('removeEntityFromFilter', () => {
    it('should remove entity and decrement length', () => {
      filter.addEntityToFilter(5);
      filter.addEntityToFilter(10);

      filter.removeEntityFromFilter(5);
      expect(filter.length).toBe(1);
      expect([...filter]).toEqual([10]);
    });

    it('should handle removing last entity', () => {
      filter.addEntityToFilter(5);
      filter.removeEntityFromFilter(5);
      expect(filter.length).toBe(0);
      expect([...filter]).toEqual([]);
    });

    it('should no-op when removing non-existent entity', () => {
      filter.addEntityToFilter(5);
      filter.removeEntityFromFilter(999);
      expect(filter.length).toBe(1);
    });

    it('should use swap-back-last for O(1) removal', () => {
      filter.addEntityToFilter(1);
      filter.addEntityToFilter(2);
      filter.addEntityToFilter(3);

      // Remove middle element — last element (3) should take its place
      filter.removeEntityFromFilter(2);
      expect(filter.length).toBe(2);

      const entities = [...filter];
      expect(entities).toContain(1);
      expect(entities).toContain(3);
    });
  });

  describe('reverse index consistency', () => {
    it('should not find entity in garbage region beyond length', () => {
      filter.addEntityToFilter(42);
      filter.addEntityToFilter(99);
      filter.removeEntityFromFilter(42);
      // [99] active, reverse index for 42 is cleared

      // Adding 42 again should succeed
      filter.addEntityToFilter(42);
      expect(filter.length).toBe(2);
    });

    it('should not accidentally remove entity from garbage region', () => {
      filter.addEntityToFilter(10);
      filter.addEntityToFilter(20);
      filter.addEntityToFilter(30);
      filter.removeEntityFromFilter(20);
      // Active: [10, 30], reverse index for 20 is cleared

      // Removing 20 again should be no-op
      filter.removeEntityFromFilter(20);
      expect(filter.length).toBe(2);
      expect([...filter]).toContain(10);
      expect([...filter]).toContain(30);
    });

    it('should maintain correct state through add-remove-add cycle', () => {
      filter.addEntityToFilter(1);
      filter.addEntityToFilter(2);
      filter.addEntityToFilter(3);

      filter.removeEntityFromFilter(2);
      expect(filter.length).toBe(2);

      // Re-add 2
      filter.addEntityToFilter(2);
      expect(filter.length).toBe(3);
      expect([...filter]).toContain(1);
      expect([...filter]).toContain(2);
      expect([...filter]).toContain(3);
    });

    it('should handle remove-all-then-re-add correctly', () => {
      filter.addEntityToFilter(5);
      filter.addEntityToFilter(10);
      filter.addEntityToFilter(15);

      filter.removeEntityFromFilter(5);
      filter.removeEntityFromFilter(10);
      filter.removeEntityFromFilter(15);
      expect(filter.length).toBe(0);

      // Re-add all
      filter.addEntityToFilter(15);
      filter.addEntityToFilter(5);
      filter.addEntityToFilter(10);
      expect(filter.length).toBe(3);
      expect([...filter]).toContain(5);
      expect([...filter]).toContain(10);
      expect([...filter]).toContain(15);
    });

    it('should handle interleaved add and remove operations', () => {
      filter.addEntityToFilter(0);
      filter.addEntityToFilter(1);
      filter.removeEntityFromFilter(0);
      filter.addEntityToFilter(2);
      filter.removeEntityFromFilter(1);
      filter.addEntityToFilter(3);
      filter.addEntityToFilter(0);

      expect(filter.length).toBe(3);
      expect([...filter]).toContain(0);
      expect([...filter]).toContain(2);
      expect([...filter]).toContain(3);
    });
  });

  describe('stress test', () => {
    it('should handle 1000 entities add/remove correctly', () => {
      const large = createFilter(1000);

      // Add all 1000
      for (let i = 0; i < 1000; i++) {
        large.addEntityToFilter(i);
      }
      expect(large.length).toBe(1000);

      // Remove even entities
      for (let i = 0; i < 1000; i += 2) {
        large.removeEntityFromFilter(i);
      }
      expect(large.length).toBe(500);

      // All odd entities present, no even
      const entities = new Set([...large]);
      for (let i = 0; i < 1000; i++) {
        if (i % 2 === 0) {
          expect(entities.has(i)).toBe(false);
        } else {
          expect(entities.has(i)).toBe(true);
        }
      }

      // Re-add even entities
      for (let i = 0; i < 1000; i += 2) {
        large.addEntityToFilter(i);
      }
      expect(large.length).toBe(1000);

      // All 1000 present
      const allEntities = new Set([...large]);
      for (let i = 0; i < 1000; i++) {
        expect(allEntities.has(i)).toBe(true);
      }
    });

    it('should handle repeated add/remove of same entity', () => {
      for (let round = 0; round < 100; round++) {
        filter.addEntityToFilter(42);
        expect(filter.length).toBe(1);
        filter.removeEntityFromFilter(42);
        expect(filter.length).toBe(0);
      }
    });
  });

  describe('snapshot roundtrip', () => {
    it('should preserve reverse index through buffer snapshot/restore', () => {
      const tracker = new MemoryTracker();
      TestFilter.calculateSize(100, tracker);
      const buffer = new ArrayBuffer(tracker.ptr);
      const initTracker = new MemoryTracker();
      const f = new TestFilter(100, buffer, initTracker);

      f.addEntityToFilter(10);
      f.addEntityToFilter(20);
      f.addEntityToFilter(30);

      // Snapshot
      const snapshot = buffer.slice(0);

      // Modify: remove 20
      f.removeEntityFromFilter(20);
      expect(f.length).toBe(2);
      expect([...f]).not.toContain(20);

      // Restore snapshot
      new Uint8Array(buffer).set(new Uint8Array(snapshot));

      // All three should be back — and operations should still work correctly
      expect(f.length).toBe(3);
      expect([...f]).toContain(10);
      expect([...f]).toContain(20);
      expect([...f]).toContain(30);

      // Verify add/remove still works after restore
      f.removeEntityFromFilter(20);
      expect(f.length).toBe(2);
      expect([...f]).not.toContain(20);

      f.addEntityToFilter(20);
      expect(f.length).toBe(3);
      expect([...f]).toContain(20);
    });
  });

  describe('calculateSize', () => {
    it('should calculate correct memory footprint', () => {
      const tracker = new MemoryTracker();
      TestFilter.calculateSize(100, tracker);
      // length (4→align8=8) + entities (400→400) + entityToIndex (400→400) = 808
      expect(tracker.ptr).toBe(808);
    });
  });
});
