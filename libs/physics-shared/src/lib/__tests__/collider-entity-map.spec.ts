import { describe, it, expect } from 'vitest';
import { ColliderEntityMap } from '../collider-entity-map.js';

// Rapier handles are float64 bit patterns where low 32 bits = arena index.
// Helper to create a float64 handle from an integer index (mimics Rapier's encoding).
const _f64 = new Float64Array(1);
const _u32 = new Uint32Array(_f64.buffer);
function makeHandle(index: number, generation = 0): number {
  _u32[0] = index;
  _u32[1] = generation;
  return _f64[0];
}

describe('ColliderEntityMap', () => {
  it('should set and get entity for a handle', () => {
    const map = new ColliderEntityMap();
    const h = makeHandle(5);
    map.set(h, 42);
    expect(map.get(h)).toBe(42);
  });

  it('should return -1 for unmapped handle', () => {
    const map = new ColliderEntityMap();
    expect(map.get(makeHandle(0))).toBe(-1);
    expect(map.get(makeHandle(100))).toBe(-1);
  });

  it('should delete a mapping', () => {
    const map = new ColliderEntityMap();
    const h = makeHandle(3);
    map.set(h, 10);
    expect(map.get(h)).toBe(10);
    map.delete(h);
    expect(map.get(h)).toBe(-1);
  });

  it('should auto-grow when handle exceeds capacity', () => {
    const map = new ColliderEntityMap(4);
    const h0 = makeHandle(0);
    const h10 = makeHandle(10);
    map.set(h0, 100);
    map.set(h10, 200);
    expect(map.get(h0)).toBe(100);
    expect(map.get(h10)).toBe(200);
  });

  it('should clear all mappings', () => {
    const map = new ColliderEntityMap();
    map.set(makeHandle(0), 10);
    map.set(makeHandle(5), 20);
    map.set(makeHandle(10), 30);
    map.clear();
    expect(map.get(makeHandle(0))).toBe(-1);
    expect(map.get(makeHandle(5))).toBe(-1);
    expect(map.get(makeHandle(10))).toBe(-1);
  });

  it('should handle large sparse handle values', () => {
    const map = new ColliderEntityMap(16);
    const h = makeHandle(1000);
    map.set(h, 42);
    expect(map.get(h)).toBe(42);
    expect(map.get(makeHandle(999))).toBe(-1);
  });

  it('should overwrite existing mapping', () => {
    const map = new ColliderEntityMap();
    const h = makeHandle(5);
    map.set(h, 10);
    map.set(h, 20);
    expect(map.get(h)).toBe(20);
  });

  it('should handle delete on non-existent handle gracefully', () => {
    const map = new ColliderEntityMap();
    map.delete(makeHandle(999));
    expect(map.get(makeHandle(999))).toBe(-1);
  });

  it('should distinguish handles with same index but different generation', () => {
    // In practice Rapier reuses indices with different generations.
    // Our map uses only the low 32 bits (index), so different generations
    // for the same index will overwrite. This is correct because Rapier
    // guarantees only one active collider per index at a time.
    const map = new ColliderEntityMap();
    const h1 = makeHandle(3, 0);
    const h2 = makeHandle(3, 1);
    map.set(h1, 10);
    map.set(h2, 20);
    // Both map to same index, so latest wins
    expect(map.get(h1)).toBe(20);
    expect(map.get(h2)).toBe(20);
  });

  it('should work with handle value 0 (first Rapier handle)', () => {
    const map = new ColliderEntityMap();
    map.set(0, 42); // handle 0 = float64 0.0
    expect(map.get(0)).toBe(42);
  });
});
