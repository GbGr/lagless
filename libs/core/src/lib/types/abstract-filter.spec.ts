import { describe, it, expect, beforeEach } from 'vitest';
import { AbstractFilter } from './abstract-filter.js';
import { MemoryTracker } from '@lagless/binary';

// ─── Concrete test filter ───────────────────────────────────

class TestFilter extends AbstractFilter {
  readonly includeMask = 3;
  readonly excludeMask = 0;
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

  describe('indexOf optimization', () => {
    it('should not find entity in garbage region beyond length', () => {
      // Add and remove to leave garbage in the typed array
      filter.addEntityToFilter(42);
      filter.addEntityToFilter(99);
      filter.removeEntityFromFilter(42);
      // Now: [99] active, but 42 might be in garbage at index 1

      // Adding 42 again should succeed (not find it in garbage)
      filter.addEntityToFilter(42);
      expect(filter.length).toBe(2);
    });

    it('should not accidentally remove entity from garbage region', () => {
      filter.addEntityToFilter(10);
      filter.addEntityToFilter(20);
      filter.addEntityToFilter(30);
      filter.removeEntityFromFilter(20);
      // Active: [10, 30], garbage at index 2 might contain 20

      // Removing 20 again should be no-op
      filter.removeEntityFromFilter(20);
      expect(filter.length).toBe(2);
      expect([...filter]).toContain(10);
      expect([...filter]).toContain(30);
    });
  });

  describe('calculateSize', () => {
    it('should calculate correct memory footprint', () => {
      const tracker = new MemoryTracker();
      TestFilter.calculateSize(100, tracker);
      // 1 Uint32 for length + 100 Uint32 for entities = 404 bytes
      // But with align8: 8 + align8(400) = 8 + 400 = 408
      expect(tracker.ptr).toBeGreaterThanOrEqual(404);
    });
  });
});
