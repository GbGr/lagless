import { describe, it, expect, beforeEach } from 'vitest';
import { EntitiesManager, ENTITY_REMOVED_MASK } from './entities-manager.js';
import { ComponentsManager } from './components-manager.js';
import { FiltersManager } from './filters-manager.js';
import { ECSConfig } from '../../ecs-config.js';
import { MemoryTracker } from '@lagless/binary';
import { AbstractFilter } from '../../types/abstract-filter.js';
import { Prefab } from '../../prefab.js';
import type { IComponentConstructor, ECSDeps } from '../../types/index.js';

// ─── Test Doubles (IDs are now bit indices: 0, 1, 2, ...) ──

class TestComponentA {
  static readonly ID = 0; // bit index 0
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
  static readonly ID = 1; // bit index 1
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

// Tag component (no data fields)
class TestTagComponent {
  static readonly ID = 2; // bit index 2
  static readonly IS_TAG = true;
  static readonly schema = {};
  readonly unsafe = {} as Record<string, never>;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor(_maxEntities: number, _buffer: ArrayBuffer, _memTracker: MemoryTracker) {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  static calculateSize(_maxEntities: number, _memTracker: MemoryTracker): void {}
}

class TestFilterAB extends AbstractFilter {
  static readonly include = [TestComponentA as unknown as IComponentConstructor, TestComponentB as unknown as IComponentConstructor];
  static readonly exclude: IComponentConstructor[] = [];

  // Bit index 0 → bit 1 (1 << 0), bit index 1 → bit 2 (1 << 1), combined = 3
  readonly includeMask = [(1 << TestComponentA.ID) | (1 << TestComponentB.ID)]; // [3]
  readonly excludeMask = [0];
}

class TestFilterTag extends AbstractFilter {
  static readonly include = [TestTagComponent as unknown as IComponentConstructor];
  static readonly exclude: IComponentConstructor[] = [];

  readonly includeMask = [1 << TestTagComponent.ID]; // [4]
  readonly excludeMask = [0];
}

class TestFilterExcludeTag extends AbstractFilter {
  static readonly include = [TestComponentA as unknown as IComponentConstructor];
  static readonly exclude = [TestTagComponent as unknown as IComponentConstructor];

  readonly includeMask = [1 << TestComponentA.ID]; // [1]
  readonly excludeMask = [1 << TestTagComponent.ID]; // [4]
}

// ─── Helpers ────────────────────────────────────────────────

function createTestSetup(maxEntities = 10, maskWords: 1 | 2 = 1) {
  const config = new ECSConfig({ maxEntities, maxPlayers: 2 });

  const deps: ECSDeps = {
    components: [
      TestComponentA as unknown as IComponentConstructor,
      TestComponentB as unknown as IComponentConstructor,
      TestTagComponent as unknown as IComponentConstructor,
    ],
    singletons: [],
    filters: [
      TestFilterAB as unknown as any,
      TestFilterTag as unknown as any,
      TestFilterExcludeTag as unknown as any,
    ],
    inputs: [],
    playerResources: [],
  };

  const componentsManager = new ComponentsManager(config, deps);
  const filtersManager = new FiltersManager(config, deps, maskWords);
  const entitiesManager = new EntitiesManager(config, componentsManager, filtersManager, maskWords);

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

  const filterAB = filtersManager.get(TestFilterAB as unknown as any) as TestFilterAB;
  const filterTag = filtersManager.get(TestFilterTag as unknown as any) as TestFilterTag;
  const filterExcludeTag = filtersManager.get(TestFilterExcludeTag as unknown as any) as TestFilterExcludeTag;

  return { config, entitiesManager, componentsManager, filtersManager, filterAB, filterTag, filterExcludeTag, buffer };
}

// ─── Tests (maskWords=1, bit-index IDs) ─────────────────────

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

      expect(setup.filterAB.length).toBe(1);
      const entities = [...setup.filterAB];
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
      setup.entitiesManager.createEntity();

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
      expect(setup.filterAB.length).toBe(1);

      setup.entitiesManager.removeEntity(entity);
      expect(setup.filterAB.length).toBe(0);
    });

    it('should throw for out-of-bounds entity', () => {
      expect(() => setup.entitiesManager.removeEntity(-1)).toThrow(/out of bounds/);
      expect(() => setup.entitiesManager.removeEntity(999)).toThrow(/out of bounds/);
    });

    it('should safely handle double removal without corrupting state', () => {
      const e0 = setup.entitiesManager.createEntity();
      setup.entitiesManager.createEntity();

      setup.entitiesManager.removeEntity(e0);
      setup.entitiesManager.removeEntity(e0); // double removal — should be no-op

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
      expect(setup.filterAB.length).toBe(1);

      setup.entitiesManager.removeEntity(entity);
      expect(setup.filterAB.length).toBe(0);

      setup.entitiesManager.removeEntity(entity); // double removal
      expect(setup.filterAB.length).toBe(0); // still 0
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
      expect(setup.filterAB.length).toBe(0); // only A, filter needs A+B

      setup.entitiesManager.addComponent(entity, TestComponentB as unknown as IComponentConstructor);
      expect(setup.filterAB.length).toBe(1); // now A+B → matches
    });

    it('should remove component and update filter', () => {
      const prefab = Prefab.create()
        .with(TestComponentA as unknown as IComponentConstructor)
        .with(TestComponentB as unknown as IComponentConstructor);

      const entity = setup.entitiesManager.createEntity(prefab);
      expect(setup.filterAB.length).toBe(1);

      setup.entitiesManager.removeComponent(entity, TestComponentA as unknown as IComponentConstructor);
      expect(setup.filterAB.length).toBe(0);
      expect(setup.entitiesManager.hasComponent(entity, TestComponentA as unknown as IComponentConstructor)).toBe(false);
      expect(setup.entitiesManager.hasComponent(entity, TestComponentB as unknown as IComponentConstructor)).toBe(true);
    });
  });

  describe('ENTITY_REMOVED_MASK', () => {
    it('should be 0xFFFFFFFF', () => {
      expect(ENTITY_REMOVED_MASK).toBe(0xFFFFFFFF);
      expect(ENTITY_REMOVED_MASK).toBe(4294967295);
    });
  });

  describe('snapshot roundtrip', () => {
    it('should preserve entity state through snapshot export/import', () => {
      const prefab = Prefab.create()
        .with(TestComponentA as unknown as IComponentConstructor, { value: 7.5 })
        .with(TestComponentB as unknown as IComponentConstructor, { data: 42 });

      setup.entitiesManager.createEntity(prefab);
      setup.entitiesManager.createEntity(); // entity with no components

      expect(setup.filterAB.length).toBe(1);
      expect(setup.entitiesManager.isEntityAlive(0)).toBe(true);
      expect(setup.entitiesManager.isEntityAlive(1)).toBe(true);
    });
  });

  // ─── Tag Component Tests ──────────────────────────────────

  describe('tag components', () => {
    it('should add tag component via addComponent', () => {
      const entity = setup.entitiesManager.createEntity();

      setup.entitiesManager.addComponent(entity, TestTagComponent as unknown as IComponentConstructor);
      expect(setup.entitiesManager.hasComponent(entity, TestTagComponent as unknown as IComponentConstructor)).toBe(true);
    });

    it('should remove tag component', () => {
      const entity = setup.entitiesManager.createEntity();

      setup.entitiesManager.addComponent(entity, TestTagComponent as unknown as IComponentConstructor);
      expect(setup.entitiesManager.hasComponent(entity, TestTagComponent as unknown as IComponentConstructor)).toBe(true);

      setup.entitiesManager.removeComponent(entity, TestTagComponent as unknown as IComponentConstructor);
      expect(setup.entitiesManager.hasComponent(entity, TestTagComponent as unknown as IComponentConstructor)).toBe(false);
    });

    it('should include entity in tag filter', () => {
      const entity = setup.entitiesManager.createEntity();

      setup.entitiesManager.addComponent(entity, TestTagComponent as unknown as IComponentConstructor);
      expect(setup.filterTag.length).toBe(1);
      expect([...setup.filterTag]).toContain(entity);
    });

    it('should exclude entity from filter with tag in exclude mask', () => {
      const entity = setup.entitiesManager.createEntity();

      // Add component A — should match exclude-tag filter (includes A, excludes Tag)
      setup.entitiesManager.addComponent(entity, TestComponentA as unknown as IComponentConstructor);
      expect(setup.filterExcludeTag.length).toBe(1);

      // Add tag — should be excluded now
      setup.entitiesManager.addComponent(entity, TestTagComponent as unknown as IComponentConstructor);
      expect(setup.filterExcludeTag.length).toBe(0);

      // Remove tag — should match again
      setup.entitiesManager.removeComponent(entity, TestTagComponent as unknown as IComponentConstructor);
      expect(setup.filterExcludeTag.length).toBe(1);
    });

    it('should work with tag + data components on same entity via prefab', () => {
      const prefab = Prefab.create()
        .with(TestComponentA as unknown as IComponentConstructor, { value: 99 })
        .with(TestTagComponent as unknown as IComponentConstructor);

      const entity = setup.entitiesManager.createEntity(prefab);

      expect(setup.entitiesManager.hasComponent(entity, TestComponentA as unknown as IComponentConstructor)).toBe(true);
      expect(setup.entitiesManager.hasComponent(entity, TestTagComponent as unknown as IComponentConstructor)).toBe(true);

      const compA = setup.componentsManager.get(TestComponentA as unknown as IComponentConstructor) as unknown as TestComponentA;
      expect(compA.unsafe['value'][entity]).toBeCloseTo(99);

      // Should be in tag filter
      expect(setup.filterTag.length).toBe(1);
    });
  });
});

// ─── Tests (maskWords=2, 64-bit masks) ─────────────────────

describe('EntitiesManager (maskWords=2)', () => {
  // Components in word 0 (bit indices 0-31)
  class CompWord0Bit0 {
    static readonly ID = 0;
    static readonly IS_TAG = true;
    static readonly schema = {};
    readonly unsafe = {} as Record<string, never>;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    constructor(_me: number, _buf: ArrayBuffer, _mt: MemoryTracker) {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    static calculateSize(_me: number, _mt: MemoryTracker): void {}
  }

  class CompWord0Bit31 {
    static readonly ID = 31;
    static readonly IS_TAG = true;
    static readonly schema = {};
    readonly unsafe = {} as Record<string, never>;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    constructor(_me: number, _buf: ArrayBuffer, _mt: MemoryTracker) {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    static calculateSize(_me: number, _mt: MemoryTracker): void {}
  }

  // Components in word 1 (bit indices 32-63)
  class CompWord1Bit32 {
    static readonly ID = 32;
    static readonly IS_TAG = true;
    static readonly schema = {};
    readonly unsafe = {} as Record<string, never>;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    constructor(_me: number, _buf: ArrayBuffer, _mt: MemoryTracker) {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    static calculateSize(_me: number, _mt: MemoryTracker): void {}
  }

  class CompWord1Bit63 {
    static readonly ID = 63;
    static readonly IS_TAG = true;
    static readonly schema = {};
    readonly unsafe = {} as Record<string, never>;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    constructor(_me: number, _buf: ArrayBuffer, _mt: MemoryTracker) {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    static calculateSize(_me: number, _mt: MemoryTracker): void {}
  }

  // Filter including components from both words
  class CrossWordFilter extends AbstractFilter {
    static readonly include = [
      CompWord0Bit0 as unknown as IComponentConstructor,
      CompWord1Bit32 as unknown as IComponentConstructor,
    ];
    static readonly exclude: IComponentConstructor[] = [];

    // word 0: bit 0 set → 1, word 1: bit 0 set → 1
    readonly includeMask = [1 << (0 & 31), 1 << (32 & 31)]; // [1, 1]
    readonly excludeMask = [0, 0];
  }

  // Filter including only word 1 component
  class Word1OnlyFilter extends AbstractFilter {
    static readonly include = [CompWord1Bit32 as unknown as IComponentConstructor];
    static readonly exclude: IComponentConstructor[] = [];

    readonly includeMask = [0, 1 << (32 & 31)]; // [0, 1]
    readonly excludeMask = [0, 0];
  }

  // Filter excluding word 1 component
  class ExcludeWord1Filter extends AbstractFilter {
    static readonly include = [CompWord0Bit0 as unknown as IComponentConstructor];
    static readonly exclude = [CompWord1Bit32 as unknown as IComponentConstructor];

    readonly includeMask = [1, 0];
    readonly excludeMask = [0, 1];
  }

  function createTwoWordSetup(maxEntities = 10) {
    const config = new ECSConfig({ maxEntities, maxPlayers: 2 });

    const deps: ECSDeps = {
      components: [
        CompWord0Bit0 as unknown as IComponentConstructor,
        CompWord0Bit31 as unknown as IComponentConstructor,
        CompWord1Bit32 as unknown as IComponentConstructor,
        CompWord1Bit63 as unknown as IComponentConstructor,
      ],
      singletons: [],
      filters: [
        CrossWordFilter as unknown as any,
        Word1OnlyFilter as unknown as any,
        ExcludeWord1Filter as unknown as any,
      ],
      inputs: [],
      playerResources: [],
    };

    const componentsManager = new ComponentsManager(config, deps);
    const filtersManager = new FiltersManager(config, deps, 2);
    const entitiesManager = new EntitiesManager(config, componentsManager, filtersManager, 2);

    const sizeTracker = new MemoryTracker();
    componentsManager.calculateSize(sizeTracker);
    filtersManager.calculateSize(sizeTracker);
    entitiesManager.calculateSize(sizeTracker);

    const buffer = new ArrayBuffer(sizeTracker.ptr);
    const initTracker = new MemoryTracker();
    componentsManager.init(buffer, initTracker);
    filtersManager.init(buffer, initTracker);
    entitiesManager.init(buffer, initTracker);

    const crossWordFilter = filtersManager.get(CrossWordFilter as unknown as any) as CrossWordFilter;
    const word1OnlyFilter = filtersManager.get(Word1OnlyFilter as unknown as any) as Word1OnlyFilter;
    const excludeWord1Filter = filtersManager.get(ExcludeWord1Filter as unknown as any) as ExcludeWord1Filter;

    return { config, entitiesManager, componentsManager, filtersManager, crossWordFilter, word1OnlyFilter, excludeWord1Filter, buffer };
  }

  it('should add and check components in word 0', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    s.entitiesManager.addComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor);
    expect(s.entitiesManager.hasComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor)).toBe(true);
    expect(s.entitiesManager.hasComponent(entity, CompWord0Bit31 as unknown as IComponentConstructor)).toBe(false);
    expect(s.entitiesManager.hasComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor)).toBe(false);
  });

  it('should add and check components in word 1', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    s.entitiesManager.addComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor);
    expect(s.entitiesManager.hasComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor)).toBe(true);
    expect(s.entitiesManager.hasComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor)).toBe(false);
  });

  it('should handle bit 31 (edge of word 0) and bit 63 (edge of word 1)', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    s.entitiesManager.addComponent(entity, CompWord0Bit31 as unknown as IComponentConstructor);
    s.entitiesManager.addComponent(entity, CompWord1Bit63 as unknown as IComponentConstructor);

    expect(s.entitiesManager.hasComponent(entity, CompWord0Bit31 as unknown as IComponentConstructor)).toBe(true);
    expect(s.entitiesManager.hasComponent(entity, CompWord1Bit63 as unknown as IComponentConstructor)).toBe(true);
    expect(s.entitiesManager.hasComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor)).toBe(false);
    expect(s.entitiesManager.hasComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor)).toBe(false);
  });

  it('should remove components across words', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    s.entitiesManager.addComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor);
    s.entitiesManager.addComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor);

    s.entitiesManager.removeComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor);
    expect(s.entitiesManager.hasComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor)).toBe(false);
    expect(s.entitiesManager.hasComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor)).toBe(true);

    s.entitiesManager.removeComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor);
    expect(s.entitiesManager.hasComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor)).toBe(false);
  });

  it('should match cross-word filter (include components from both words)', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    // Add only word 0 component — not enough
    s.entitiesManager.addComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor);
    expect(s.crossWordFilter.length).toBe(0);

    // Add word 1 component — now both words satisfied
    s.entitiesManager.addComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor);
    expect(s.crossWordFilter.length).toBe(1);
    expect([...s.crossWordFilter]).toContain(entity);
  });

  it('should match word-1-only filter', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    s.entitiesManager.addComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor);
    expect(s.word1OnlyFilter.length).toBe(1);
  });

  it('should handle exclude mask across words', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    // Add word 0 bit 0 — matches excludeWord1Filter (include=[bit0], exclude=[bit32])
    s.entitiesManager.addComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor);
    expect(s.excludeWord1Filter.length).toBe(1);

    // Add word 1 bit 32 — now excluded
    s.entitiesManager.addComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor);
    expect(s.excludeWord1Filter.length).toBe(0);

    // Remove word 1 bit 32 — back in filter
    s.entitiesManager.removeComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor);
    expect(s.excludeWord1Filter.length).toBe(1);
  });

  it('should handle entity removal with 2-word masks', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    s.entitiesManager.addComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor);
    s.entitiesManager.addComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor);
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(true);

    s.entitiesManager.removeEntity(entity);
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(false);
    expect(s.crossWordFilter.length).toBe(0);
  });

  it('should handle double removal with 2-word masks', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    s.entitiesManager.addComponent(entity, CompWord1Bit32 as unknown as IComponentConstructor);
    s.entitiesManager.removeEntity(entity);
    s.entitiesManager.removeEntity(entity); // double removal — no-op

    const recycled = s.entitiesManager.createEntity();
    expect(recycled).toBe(entity);
    expect(s.entitiesManager.isEntityAlive(recycled)).toBe(true);
    // Recycled entity should have clean mask — no components
    expect(s.entitiesManager.hasComponent(recycled, CompWord1Bit32 as unknown as IComponentConstructor)).toBe(false);
  });

  it('should allocate correct memory for 2-word masks', () => {
    const maxEntities = 5;
    const config = new ECSConfig({ maxEntities, maxPlayers: 2 });
    const deps: ECSDeps = { components: [], singletons: [], filters: [], inputs: [], playerResources: [] };

    const componentsManager = new ComponentsManager(config, deps);
    const filtersManager = new FiltersManager(config, deps, 2);
    const entitiesManager = new EntitiesManager(config, componentsManager, filtersManager, 2);

    const tracker = new MemoryTracker();
    entitiesManager.calculateSize(tracker);

    // nextEntityId(4→align8=8) + removedEntitiesLength(4→8) + removedEntities(20→24) + masks(5*2*4=40)
    expect(tracker.ptr).toBe(80);
  });

  it('should preserve masks through snapshot roundtrip', () => {
    const s = createTwoWordSetup();
    const entity = s.entitiesManager.createEntity();

    s.entitiesManager.addComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor);
    s.entitiesManager.addComponent(entity, CompWord1Bit63 as unknown as IComponentConstructor);

    // Export snapshot
    const snapshot = s.buffer.slice(0);

    // Modify state
    s.entitiesManager.removeComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor);
    expect(s.entitiesManager.hasComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor)).toBe(false);

    // Restore snapshot
    new Uint8Array(s.buffer).set(new Uint8Array(snapshot));

    // Verify restored
    expect(s.entitiesManager.hasComponent(entity, CompWord0Bit0 as unknown as IComponentConstructor)).toBe(true);
    expect(s.entitiesManager.hasComponent(entity, CompWord1Bit63 as unknown as IComponentConstructor)).toBe(true);
  });
});

// ─── Tests: Maximum 64 components full lifecycle ────────────

describe('EntitiesManager (all 64 components)', () => {
  // Factory to create tag component classes with a given bit index
  function createTagComponentClass(bitIndex: number) {
    class TagComp {
      static readonly ID = bitIndex;
      static readonly IS_TAG = true;
      static readonly schema = {};
      readonly unsafe = {} as Record<string, never>;
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      constructor(_me: number, _buf: ArrayBuffer, _mt: MemoryTracker) {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      static calculateSize(_me: number, _mt: MemoryTracker): void {}
    }
    Object.defineProperty(TagComp, 'name', { value: `Comp${bitIndex}` });
    return TagComp;
  }

  // Generate 64 tag component classes with IDs 0..63
  const AllComponents = Array.from({ length: 64 }, (_, i) => createTagComponentClass(i));

  // Compute filter masks the same way codegen does (bitwise |= produces signed int32)
  function computeMaskWords(bitIndices: number[]): number[] {
    const words = [0, 0];
    for (const idx of bitIndices) {
      const w = idx >>> 5;
      words[w] |= 1 << (idx & 31);
    }
    return words;
  }

  // Filter spanning both words: includes Comp0 (word 0, bit 0) + Comp32 (word 1, bit 0)
  class AllCrossFilter extends AbstractFilter {
    readonly includeMask = computeMaskWords([0, 32]);
    readonly excludeMask = [0, 0];
  }

  // Filter including all 64 components (all bits set in both words)
  class AllComponentsFilter extends AbstractFilter {
    readonly includeMask = computeMaskWords(Array.from({ length: 64 }, (_, i) => i));
    readonly excludeMask = [0, 0];
  }

  // Filter for 63 components (bits 0-30 in word 0, bits 32-63 in word 1) — avoids sentinel collision
  class Almost64Filter extends AbstractFilter {
    readonly includeMask = computeMaskWords(
      Array.from({ length: 63 }, (_, i) => (i < 31 ? i : i + 1)), // 0-30, 32-63
    );
    readonly excludeMask = [0, 0];
  }

  function createAll64Setup(maxEntities = 10) {
    const config = new ECSConfig({ maxEntities, maxPlayers: 2 });

    const deps: ECSDeps = {
      components: AllComponents as unknown as IComponentConstructor[],
      singletons: [],
      filters: [
        AllCrossFilter as unknown as any,
        AllComponentsFilter as unknown as any,
        Almost64Filter as unknown as any,
      ],
      inputs: [],
      playerResources: [],
    };

    const componentsManager = new ComponentsManager(config, deps);
    const filtersManager = new FiltersManager(config, deps, 2);
    const entitiesManager = new EntitiesManager(config, componentsManager, filtersManager, 2);

    const sizeTracker = new MemoryTracker();
    componentsManager.calculateSize(sizeTracker);
    filtersManager.calculateSize(sizeTracker);
    entitiesManager.calculateSize(sizeTracker);

    const buffer = new ArrayBuffer(sizeTracker.ptr);
    const initTracker = new MemoryTracker();
    componentsManager.init(buffer, initTracker);
    filtersManager.init(buffer, initTracker);
    entitiesManager.init(buffer, initTracker);

    const crossFilter = filtersManager.get(AllCrossFilter as unknown as any) as AllCrossFilter;
    const allFilter = filtersManager.get(AllComponentsFilter as unknown as any) as AllComponentsFilter;
    const almost64Filter = filtersManager.get(Almost64Filter as unknown as any) as Almost64Filter;

    return { config, entitiesManager, componentsManager, filtersManager, crossFilter, allFilter, almost64Filter, buffer };
  }

  it('should add all 64 components and verify hasComponent for each', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    for (let i = 0; i < 64; i++) {
      s.entitiesManager.addComponent(entity, AllComponents[i] as unknown as IComponentConstructor);
    }

    for (let i = 0; i < 64; i++) {
      expect(s.entitiesManager.hasComponent(entity, AllComponents[i] as unknown as IComponentConstructor)).toBe(true);
    }
  });

  it('should match AllComponentsFilter when all 64 components are present', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    // Add 63 components — filter should NOT match
    for (let i = 0; i < 63; i++) {
      s.entitiesManager.addComponent(entity, AllComponents[i] as unknown as IComponentConstructor);
    }
    expect(s.allFilter.length).toBe(0);

    // Add the 64th — now it should match
    s.entitiesManager.addComponent(entity, AllComponents[63] as unknown as IComponentConstructor);
    expect(s.allFilter.length).toBe(1);
    expect([...s.allFilter]).toContain(entity);
  });

  it('should match cross-word filter with components 0 and 32', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    s.entitiesManager.addComponent(entity, AllComponents[0] as unknown as IComponentConstructor);
    expect(s.crossFilter.length).toBe(0);

    s.entitiesManager.addComponent(entity, AllComponents[32] as unknown as IComponentConstructor);
    expect(s.crossFilter.length).toBe(1);
  });

  // Full entity lifecycle with 63 components (avoids sentinel collision on word 0 bit 31)
  it('should handle full entity lifecycle with 63 components (bits 0-30, 32-63)', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    // Add 63 components: 0-30 (word 0, skipping bit 31) + 32-63 (word 1)
    const indices63 = Array.from({ length: 63 }, (_, i) => (i < 31 ? i : i + 1));
    for (const idx of indices63) {
      s.entitiesManager.addComponent(entity, AllComponents[idx] as unknown as IComponentConstructor);
    }

    // Verify all 63 are present
    for (const idx of indices63) {
      expect(s.entitiesManager.hasComponent(entity, AllComponents[idx] as unknown as IComponentConstructor)).toBe(true);
    }
    // Bit 31 should be absent
    expect(s.entitiesManager.hasComponent(entity, AllComponents[31] as unknown as IComponentConstructor)).toBe(false);

    // Filter for these 63 components should match
    expect(s.almost64Filter.length).toBe(1);

    // Entity should be alive (word 0 is 0x7FFFFFFF, not sentinel)
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(true);

    // Remove entity
    s.entitiesManager.removeEntity(entity);
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(false);
    expect(s.almost64Filter.length).toBe(0);

    // Recycle entity
    const recycled = s.entitiesManager.createEntity();
    expect(recycled).toBe(entity);
    expect(s.entitiesManager.isEntityAlive(recycled)).toBe(true);

    // All components should be absent on recycled entity
    for (const idx of indices63) {
      expect(s.entitiesManager.hasComponent(recycled, AllComponents[idx] as unknown as IComponentConstructor)).toBe(false);
    }
    expect(s.almost64Filter.length).toBe(0);
  });

  it('should remove individual components and update filters', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    // Add components 0-30 + 32-63 (63 components, avoids sentinel)
    const indices63 = Array.from({ length: 63 }, (_, i) => (i < 31 ? i : i + 1));
    for (const idx of indices63) {
      s.entitiesManager.addComponent(entity, AllComponents[idx] as unknown as IComponentConstructor);
    }
    expect(s.almost64Filter.length).toBe(1);

    // Remove component 32 — almost64Filter should drop, crossFilter should drop
    s.entitiesManager.removeComponent(entity, AllComponents[32] as unknown as IComponentConstructor);
    expect(s.entitiesManager.hasComponent(entity, AllComponents[32] as unknown as IComponentConstructor)).toBe(false);
    expect(s.almost64Filter.length).toBe(0);
    expect(s.crossFilter.length).toBe(0);

    // Other 62 components still present
    for (const idx of indices63) {
      if (idx === 32) continue;
      expect(s.entitiesManager.hasComponent(entity, AllComponents[idx] as unknown as IComponentConstructor)).toBe(true);
    }
  });

  it('should preserve masks through snapshot roundtrip', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    // Add all 64 components
    for (let i = 0; i < 64; i++) {
      s.entitiesManager.addComponent(entity, AllComponents[i] as unknown as IComponentConstructor);
    }

    // Snapshot
    const snapshot = s.buffer.slice(0);

    // Remove half of them
    for (let i = 0; i < 32; i++) {
      s.entitiesManager.removeComponent(entity, AllComponents[i] as unknown as IComponentConstructor);
    }

    // Restore snapshot
    new Uint8Array(s.buffer).set(new Uint8Array(snapshot));

    // All 64 should be back
    for (let i = 0; i < 64; i++) {
      expect(s.entitiesManager.hasComponent(entity, AllComponents[i] as unknown as IComponentConstructor)).toBe(true);
    }
  });

  it('should handle multiple entities each with different subsets of 64 components', () => {
    const s = createAll64Setup();

    const e0 = s.entitiesManager.createEntity();
    const e1 = s.entitiesManager.createEntity();
    const e2 = s.entitiesManager.createEntity();

    // e0: even components (0, 2, 4, ..., 62)
    for (let i = 0; i < 64; i += 2) {
      s.entitiesManager.addComponent(e0, AllComponents[i] as unknown as IComponentConstructor);
    }

    // e1: odd components (1, 3, 5, ..., 63)
    for (let i = 1; i < 64; i += 2) {
      s.entitiesManager.addComponent(e1, AllComponents[i] as unknown as IComponentConstructor);
    }

    // e2: all 64 components
    for (let i = 0; i < 64; i++) {
      s.entitiesManager.addComponent(e2, AllComponents[i] as unknown as IComponentConstructor);
    }

    // Verify e0 has only even
    for (let i = 0; i < 64; i++) {
      expect(s.entitiesManager.hasComponent(e0, AllComponents[i] as unknown as IComponentConstructor)).toBe(i % 2 === 0);
    }

    // Verify e1 has only odd
    for (let i = 0; i < 64; i++) {
      expect(s.entitiesManager.hasComponent(e1, AllComponents[i] as unknown as IComponentConstructor)).toBe(i % 2 === 1);
    }

    // Only e2 has all 64 — should be in allFilter
    expect(s.allFilter.length).toBe(1);
    expect([...s.allFilter]).toContain(e2);

    // e0 has comp 0 and comp 32 (both even) — should be in crossFilter
    // e1 does NOT have comp 0 (it's even) — not in crossFilter
    // e2 has all — in crossFilter
    expect(s.crossFilter.length).toBe(2);
    expect([...s.crossFilter]).toContain(e0);
    expect([...s.crossFilter]).toContain(e2);
  });

  it('isEntityAlive should be true when word 0 has all 32 bits set but word 1 does not', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    // Add components 0-31 (all bits in word 0 = 0xFFFFFFFF)
    for (let i = 0; i < 32; i++) {
      s.entitiesManager.addComponent(entity, AllComponents[i] as unknown as IComponentConstructor);
    }

    // Word 0 = 0xFFFFFFFF but word 1 = 0 → entity is alive
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(true);

    // hasComponent still correct
    for (let i = 0; i < 32; i++) {
      expect(s.entitiesManager.hasComponent(entity, AllComponents[i] as unknown as IComponentConstructor)).toBe(true);
    }
  });

  it('removeEntity should work when word 0 has all 32 bits set', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    // Add components 0-31 + component 32
    for (let i = 0; i <= 32; i++) {
      s.entitiesManager.addComponent(entity, AllComponents[i] as unknown as IComponentConstructor);
    }
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(true);

    // Remove entity — should work correctly
    s.entitiesManager.removeEntity(entity);
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(false);

    // Recycle — should get clean masks
    const recycled = s.entitiesManager.createEntity();
    expect(recycled).toBe(entity);
    expect(s.entitiesManager.isEntityAlive(recycled)).toBe(true);
    for (let i = 0; i <= 32; i++) {
      expect(s.entitiesManager.hasComponent(recycled, AllComponents[i] as unknown as IComponentConstructor)).toBe(false);
    }
  });

  it('double removal should be no-op when word 0 has all 32 bits set', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    for (let i = 0; i < 32; i++) {
      s.entitiesManager.addComponent(entity, AllComponents[i] as unknown as IComponentConstructor);
    }
    // Word 0 = 0xFFFFFFFF, word 1 = 0 → alive
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(true);

    s.entitiesManager.removeEntity(entity);
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(false);

    // Double removal — should not corrupt state
    s.entitiesManager.removeEntity(entity);
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(false);

    // Only one recycled entity should be available
    const recycled = s.entitiesManager.createEntity();
    expect(recycled).toBe(entity);
    const fresh = s.entitiesManager.createEntity();
    expect(fresh).toBe(1); // next sequential ID, not entity again
  });

  // Remaining edge case: ALL 64 components → both words = 0xFFFFFFFF = sentinel.
  // Practically impossible (no game needs 64 components on one entity).
  it('known edge case: isEntityAlive false when all 64 components set (both words = sentinel)', () => {
    const s = createAll64Setup();
    const entity = s.entitiesManager.createEntity();

    for (let i = 0; i < 64; i++) {
      s.entitiesManager.addComponent(entity, AllComponents[i] as unknown as IComponentConstructor);
    }

    // Both words = 0xFFFFFFFF = sentinel → false positive "removed"
    expect(s.entitiesManager.isEntityAlive(entity)).toBe(false);
  });
});
