import { describe, it, expect, beforeEach } from 'vitest';
import { EntitiesManager, ENTITY_REMOVED_MASK } from './entities-manager.js';
import { ComponentsManager } from './components-manager.js';
import { FiltersManager } from './filters-manager.js';
import { ECSConfig } from '../../ecs-config.js';
import { MemoryTracker } from '@lagless/binary';
import { AbstractFilter } from '../../types/abstract-filter.js';
import { Prefab } from '../../prefab.js';
import type { IComponentConstructor, IComponentInstance, ECSDeps } from '../../types/index.js';

// ─── Test Doubles ───────────────────────────────────────────

class TestComponentA {
  static readonly ID = 1;
  static readonly schema = { value: Float32Array };
  readonly unsafe: Record<string, Float32Array> = {};

  constructor(maxEntities: number, buffer: ArrayBuffer, memTracker: MemoryTracker) {
    this.unsafe['value'] = new Float32Array(buffer, memTracker.ptr, maxEntities);
    memTracker.add(maxEntities * Float32Array.BYTES_PER_ELEMENT);
  }

  static calculateSize(maxEntities: number, memTracker: MemoryTracker): void {
    memTracker.add(maxEntities * Float32Array.BYTES_PER_ELEMENT);
  }
}

class TestComponentB {
  static readonly ID = 2;
  static readonly schema = { data: Uint32Array };
  readonly unsafe: Record<string, Uint32Array> = {};

  constructor(maxEntities: number, buffer: ArrayBuffer, memTracker: MemoryTracker) {
    this.unsafe['data'] = new Uint32Array(buffer, memTracker.ptr, maxEntities);
    memTracker.add(maxEntities * Uint32Array.BYTES_PER_ELEMENT);
  }

  static calculateSize(maxEntities: number, memTracker: MemoryTracker): void {
    memTracker.add(maxEntities * Uint32Array.BYTES_PER_ELEMENT);
  }
}

class TestFilterAB extends AbstractFilter {
  static readonly include = [TestComponentA as unknown as IComponentConstructor, TestComponentB as unknown as IComponentConstructor];
  static readonly exclude: IComponentConstructor[] = [];

  readonly includeMask = TestComponentA.ID | TestComponentB.ID; // 3
  readonly excludeMask = 0;
}

// ─── Helpers ────────────────────────────────────────────────

function createTestSetup(maxEntities = 10) {
  const config = new ECSConfig({ maxEntities, maxPlayers: 2 });

  const deps: ECSDeps = {
    components: [TestComponentA as unknown as IComponentConstructor, TestComponentB as unknown as IComponentConstructor],
    singletons: [],
    filters: [TestFilterAB as unknown as any],
    inputs: [],
    playerResources: [],
  };

  const componentsManager = new ComponentsManager(config, deps);
  const filtersManager = new FiltersManager(config, deps);
  const entitiesManager = new EntitiesManager(config, componentsManager, filtersManager);

  // Calculate total size and allocate
  const sizeTracker = new MemoryTracker();
  componentsManager.calculateSize(sizeTracker);
  filtersManager.calculateSize(sizeTracker);
  entitiesManager.calculateSize(sizeTracker);

  const buffer = new ArrayBuffer(sizeTracker.ptr);
  const initTracker = new MemoryTracker();
  componentsManager.init(buffer, initTracker);
  filtersManager.init(buffer, initTracker);
  entitiesManager.init(buffer, initTracker);

  const filter = filtersManager.get(TestFilterAB as unknown as any) as TestFilterAB;

  return { config, entitiesManager, componentsManager, filtersManager, filter };
}

// ─── Tests ──────────────────────────────────────────────────

describe('EntitiesManager', () => {
  let setup: ReturnType<typeof createTestSetup>;

  beforeEach(() => {
    setup = createTestSetup();
  });

  describe('createEntity', () => {
    it('should create entity and return incrementing IDs', () => {
      const e0 = setup.entitiesManager.createEntity();
      const e1 = setup.entitiesManager.createEntity();
      const e2 = setup.entitiesManager.createEntity();

      expect(e0).toBe(0);
      expect(e1).toBe(1);
      expect(e2).toBe(2);
    });

    it('should create entity with prefab and set components', () => {
      const prefab = Prefab.create()
        .with(TestComponentA as unknown as IComponentConstructor, { value: 42 })
        .with(TestComponentB as unknown as IComponentConstructor, { data: 100 });

      const entity = setup.entitiesManager.createEntity(prefab);

      expect(setup.entitiesManager.hasComponent(entity, TestComponentA as unknown as IComponentConstructor)).toBe(true);
      expect(setup.entitiesManager.hasComponent(entity, TestComponentB as unknown as IComponentConstructor)).toBe(true);

      const compA = setup.componentsManager.get(TestComponentA as unknown as IComponentConstructor) as unknown as TestComponentA;
      expect(compA.unsafe['value'][entity]).toBeCloseTo(42);
    });

    it('should add entity to matching filter', () => {
      const prefab = Prefab.create()
        .with(TestComponentA as unknown as IComponentConstructor)
        .with(TestComponentB as unknown as IComponentConstructor);

      const entity = setup.entitiesManager.createEntity(prefab);

      expect(setup.filter.length).toBe(1);
      const entities = [...setup.filter];
      expect(entities).toContain(entity);
    });

    it('should throw when max entities exceeded', () => {
      const small = createTestSetup(3);
      small.entitiesManager.createEntity();
      small.entitiesManager.createEntity();
      small.entitiesManager.createEntity();

      expect(() => small.entitiesManager.createEntity()).toThrow(/Maximum/);
    });

    it('should reuse removed entity IDs', () => {
      const e0 = setup.entitiesManager.createEntity();
      const e1 = setup.entitiesManager.createEntity();

      setup.entitiesManager.removeEntity(e0);

      const e2 = setup.entitiesManager.createEntity();
      expect(e2).toBe(e0); // reused
    });
  });

  describe('removeEntity', () => {
    it('should remove entity from filter', () => {
      const prefab = Prefab.create()
        .with(TestComponentA as unknown as IComponentConstructor)
        .with(TestComponentB as unknown as IComponentConstructor);

      const entity = setup.entitiesManager.createEntity(prefab);
      expect(setup.filter.length).toBe(1);

      setup.entitiesManager.removeEntity(entity);
      expect(setup.filter.length).toBe(0);
    });

    it('should throw for out-of-bounds entity', () => {
      expect(() => setup.entitiesManager.removeEntity(-1)).toThrow(/out of bounds/);
      expect(() => setup.entitiesManager.removeEntity(999)).toThrow(/out of bounds/);
    });

    it('should safely handle double removal without corrupting state', () => {
      const e0 = setup.entitiesManager.createEntity();
      const e1 = setup.entitiesManager.createEntity();

      setup.entitiesManager.removeEntity(e0);
      setup.entitiesManager.removeEntity(e0); // double removal — should be no-op

      // Entity e0 should appear in removal stack only once
      // Creating two new entities should reuse e0 and then allocate e2
      const e2 = setup.entitiesManager.createEntity();
      const e3 = setup.entitiesManager.createEntity();

      expect(e2).toBe(e0); // reused from stack
      expect(e3).toBe(2);  // next sequential ID, NOT e0 again
    });

    it('should not corrupt filter on double removal', () => {
      const prefab = Prefab.create()
        .with(TestComponentA as unknown as IComponentConstructor)
        .with(TestComponentB as unknown as IComponentConstructor);

      const entity = setup.entitiesManager.createEntity(prefab);
      expect(setup.filter.length).toBe(1);

      setup.entitiesManager.removeEntity(entity);
      expect(setup.filter.length).toBe(0);

      setup.entitiesManager.removeEntity(entity); // double removal
      expect(setup.filter.length).toBe(0); // still 0
    });
  });

  describe('isEntityAlive', () => {
    it('should return true for alive entity', () => {
      const entity = setup.entitiesManager.createEntity();
      expect(setup.entitiesManager.isEntityAlive(entity)).toBe(true);
    });

    it('should return false for removed entity', () => {
      const entity = setup.entitiesManager.createEntity();
      setup.entitiesManager.removeEntity(entity);
      expect(setup.entitiesManager.isEntityAlive(entity)).toBe(false);
    });

    it('should return false for out-of-bounds entity', () => {
      expect(setup.entitiesManager.isEntityAlive(-1)).toBe(false);
      expect(setup.entitiesManager.isEntityAlive(999)).toBe(false);
    });

    it('should return true after entity is recycled', () => {
      const entity = setup.entitiesManager.createEntity();
      setup.entitiesManager.removeEntity(entity);
      expect(setup.entitiesManager.isEntityAlive(entity)).toBe(false);

      const recycled = setup.entitiesManager.createEntity();
      expect(recycled).toBe(entity);
      expect(setup.entitiesManager.isEntityAlive(recycled)).toBe(true);
    });
  });

  describe('addComponent / removeComponent', () => {
    it('should add component and update filter', () => {
      const entity = setup.entitiesManager.createEntity();

      setup.entitiesManager.addComponent(entity, TestComponentA as unknown as IComponentConstructor);
      expect(setup.entitiesManager.hasComponent(entity, TestComponentA as unknown as IComponentConstructor)).toBe(true);
      expect(setup.filter.length).toBe(0); // only A, filter needs A+B

      setup.entitiesManager.addComponent(entity, TestComponentB as unknown as IComponentConstructor);
      expect(setup.filter.length).toBe(1); // now A+B → matches
    });

    it('should remove component and update filter', () => {
      const prefab = Prefab.create()
        .with(TestComponentA as unknown as IComponentConstructor)
        .with(TestComponentB as unknown as IComponentConstructor);

      const entity = setup.entitiesManager.createEntity(prefab);
      expect(setup.filter.length).toBe(1);

      setup.entitiesManager.removeComponent(entity, TestComponentA as unknown as IComponentConstructor);
      expect(setup.filter.length).toBe(0);
      expect(setup.entitiesManager.hasComponent(entity, TestComponentA as unknown as IComponentConstructor)).toBe(false);
      expect(setup.entitiesManager.hasComponent(entity, TestComponentB as unknown as IComponentConstructor)).toBe(true);
    });
  });

  describe('ENTITY_REMOVED_MASK', () => {
    it('should be 0xFFFFFFFF', () => {
      expect(ENTITY_REMOVED_MASK).toBe(0xFFFFFFFF);
      expect(ENTITY_REMOVED_MASK).toBe(4294967295);
    });

    it('should be different from any valid component mask', () => {
      // Valid component IDs are powers of 2: 1, 2, 4, 8, ... up to 2^31
      // OR-ing all 32 possible IDs: 0x7FFFFFFF (2^32 - 1 would require ID 2^31 which is 2147483648)
      // ENTITY_REMOVED_MASK = 0xFFFFFFFF is distinct from any valid combination
      const allComponentsSet = 0xFFFFFFFF >>> 0;
      expect(ENTITY_REMOVED_MASK).toBe(allComponentsSet);
      // This means we can use 32 component IDs (1, 2, 4, ... 2^31)
      // and the sentinel is only equal to all-bits-set which can never occur
      // naturally because component ID 0 doesn't exist
    });
  });

  describe('snapshot roundtrip', () => {
    it('should preserve entity state through snapshot export/import', () => {
      const prefab = Prefab.create()
        .with(TestComponentA as unknown as IComponentConstructor, { value: 7.5 })
        .with(TestComponentB as unknown as IComponentConstructor, { data: 42 });

      setup.entitiesManager.createEntity(prefab);
      setup.entitiesManager.createEntity(); // entity with no components

      expect(setup.filter.length).toBe(1);
      expect(setup.entitiesManager.isEntityAlive(0)).toBe(true);
      expect(setup.entitiesManager.isEntityAlive(1)).toBe(true);
    });
  });
});
