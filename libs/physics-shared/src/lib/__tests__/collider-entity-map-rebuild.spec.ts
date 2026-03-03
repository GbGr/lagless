import { describe, it, expect } from 'vitest';
import { ColliderEntityMap, UNMAPPED_ENTITY } from '../collider-entity-map.js';

// Rapier handles are float64 bit patterns where low 32 bits = arena index.
const _f64 = new Float64Array(1);
const _u32 = new Uint32Array(_f64.buffer);
function makeHandle(index: number, generation = 0): number {
  _u32[0] = index;
  _u32[1] = generation;
  return _f64[0];
}

/**
 * Simulates the rebuild callback that PhysicsRunner wires up.
 * Iterates a filter's entity list and reads colliderHandle from the ECS typed array.
 */
function createRebuildFn(
  entityMap: ColliderEntityMap,
  colliderHandles: Float64Array,
  filterEntities: () => number[],
): () => void {
  return () => {
    entityMap.clear();
    for (const entity of filterEntities()) {
      entityMap.set(colliderHandles[entity], entity);
    }
  };
}

describe('ColliderEntityMap rebuild from ECS state', () => {
  it('should restore mappings after simulated rollback', () => {
    const entityMap = new ColliderEntityMap();
    const maxEntities = 64;
    const colliderHandles = new Float64Array(maxEntities);

    // Simulate ECS state: entities 0, 1, 2 have colliders with handles 10, 20, 30
    const h0 = makeHandle(10);
    const h1 = makeHandle(20);
    const h2 = makeHandle(30);
    colliderHandles[0] = h0;
    colliderHandles[1] = h1;
    colliderHandles[2] = h2;

    // The "filter" tracks which entities are in the physics filter.
    // After rollback, this comes from the restored ArrayBuffer.
    const activeEntities = [0, 1, 2];

    const rebuild = createRebuildFn(entityMap, colliderHandles, () => activeEntities);

    // Initial state: all three entities mapped
    entityMap.set(h0, 0);
    entityMap.set(h1, 1);
    entityMap.set(h2, 2);

    expect(entityMap.get(h0)).toBe(0);
    expect(entityMap.get(h1)).toBe(1);
    expect(entityMap.get(h2)).toBe(2);

    // --- Simulate prediction: entity 2's collider is destroyed ---
    entityMap.delete(h2);
    expect(entityMap.get(h2)).toBe(UNMAPPED_ENTITY);

    // --- Simulate rollback: ECS ArrayBuffer restored ---
    // After rollback, entity 2 is alive again in the filter and colliderHandles are valid.
    // But ColliderEntityMap is still stale (entity 2 missing).

    // Call rebuild (what happens after rollback)
    rebuild();

    // All three entities should be mapped again
    expect(entityMap.get(h0)).toBe(0);
    expect(entityMap.get(h1)).toBe(1);
    expect(entityMap.get(h2)).toBe(2);
  });

  it('should handle entity set changing across rollback', () => {
    const entityMap = new ColliderEntityMap();
    const maxEntities = 64;
    const colliderHandles = new Float64Array(maxEntities);

    const h0 = makeHandle(10);
    const h1 = makeHandle(20);
    const h3 = makeHandle(40);
    colliderHandles[0] = h0;
    colliderHandles[1] = h1;
    colliderHandles[3] = h3;

    // Current (prediction) state: entities 0, 1, 3
    let activeEntities = [0, 1, 3];
    entityMap.set(h0, 0);
    entityMap.set(h1, 1);
    entityMap.set(h3, 3);

    const rebuild = createRebuildFn(entityMap, colliderHandles, () => activeEntities);

    // After rollback, only entities 0 and 1 exist (entity 3 was created in prediction)
    activeEntities = [0, 1];

    rebuild();

    expect(entityMap.get(h0)).toBe(0);
    expect(entityMap.get(h1)).toBe(1);
    // Entity 3's handle should no longer be mapped
    expect(entityMap.get(h3)).toBe(UNMAPPED_ENTITY);
  });

  it('should produce empty map when no entities exist after state transfer', () => {
    const entityMap = new ColliderEntityMap();
    const maxEntities = 64;
    const colliderHandles = new Float64Array(maxEntities);

    const h0 = makeHandle(5);
    colliderHandles[0] = h0;
    entityMap.set(h0, 0);

    const activeEntities: number[] = [];

    const rebuild = createRebuildFn(entityMap, colliderHandles, () => activeEntities);
    rebuild();

    expect(entityMap.get(h0)).toBe(UNMAPPED_ENTITY);
  });

  it('should correctly rebuild with many entities', () => {
    const entityMap = new ColliderEntityMap();
    const count = 100;
    const maxEntities = 128;
    const colliderHandles = new Float64Array(maxEntities);
    const activeEntities: number[] = [];

    for (let i = 0; i < count; i++) {
      const h = makeHandle(i + 100);
      colliderHandles[i] = h;
      activeEntities.push(i);
      entityMap.set(h, i);
    }

    // Delete half from entityMap (simulate prediction removes)
    for (let i = 0; i < count; i += 2) {
      entityMap.delete(makeHandle(i + 100));
    }

    const rebuild = createRebuildFn(entityMap, colliderHandles, () => activeEntities);
    rebuild();

    // All should be restored
    for (let i = 0; i < count; i++) {
      expect(entityMap.get(makeHandle(i + 100))).toBe(i);
    }
  });
});
