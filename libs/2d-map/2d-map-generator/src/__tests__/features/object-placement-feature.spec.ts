import { describe, it, expect, beforeAll } from 'vitest';
import { MathOps } from '@lagless/math';
import { ObjectPlacementFeature, computePlacementBounds } from '../../lib/features/object-placement-feature.js';
import { FeatureId } from '../../lib/types/feature.js';
import { ShapeType } from '../../lib/types/geometry.js';
import { PlacementKind } from '../../lib/types/feature-configs.js';
import { TerrainZone } from '../../lib/types/placed-object.js';
import type { GenerationContext } from '../../lib/types/feature.js';
import type { ObjectPlacementConfig } from '../../lib/types/feature-configs.js';
import type { ICollisionProvider } from '../../lib/types/collision-provider.js';
import type { MapCollisionShape } from '../../lib/types/geometry.js';
import type { MapObjectDef, MapObjectRegistry } from '../../lib/types/object-def.js';
import { createMockRandom } from '../helpers/mock-random.js';

function createTrackingCollision(): ICollisionProvider & { shapes: unknown[] } {
  const shapes: unknown[] = [];
  return {
    shapes,
    addShape: () => {
      shapes.push({});
      return shapes.length - 1;
    },
    testShape: () => false,
    removeShape: () => { return; },
    clear: () => { shapes.length = 0; },
  };
}

function createBlockingCollision(): ICollisionProvider {
  return {
    addShape: () => 0,
    testShape: () => true,
    removeShape: () => { return; },
    clear: () => { return; },
  };
}

function makeSimpleDef(typeId: number): MapObjectDef {
  return {
    typeId,
    colliders: [{ shape: { type: ShapeType.Circle, radius: 5 } }],
    visuals: [],
    scaleRange: [1, 1],
    orientations: [0],
  };
}

function makeRegistry(...defs: MapObjectDef[]): MapObjectRegistry {
  return new Map(defs.map(d => [d.typeId, d]));
}

function createContext(overrides: Partial<GenerationContext> = {}): GenerationContext {
  const outputs = new Map<FeatureId, unknown>();
  return {
    width: 200,
    height: 200,
    center: { x: 100, y: 100 },
    random: createMockRandom(42),
    collision: createTrackingCollision(),
    get: <T>(f: { readonly id: FeatureId }) => outputs.get(f.id) as T,
    hasFeature: (id: FeatureId) => outputs.has(id),
    ...overrides,
  };
}

describe('ObjectPlacementFeature', () => {
  beforeAll(async () => {
    await MathOps.init();
  });

  it('should have correct id and requires', () => {
    const feature = new ObjectPlacementFeature();
    expect(feature.id).toBe(FeatureId.ObjectPlacement);
    expect(feature.requires).toEqual([FeatureId.Shore, FeatureId.Grass]);
  });

  describe('LocationStage', () => {
    it('should place object near specified position', () => {
      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(makeSimpleDef(0));
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Location, typeId: 0, pos: { x: 50, y: 50 }, rad: 10, optional: false },
        ],
      };
      const ctx = createContext();
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(1);
      const obj = output.objects[0];
      expect(obj.typeId).toBe(0);
      const dx = obj.posX - 50;
      const dy = obj.posY - 50;
      expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(10);
    });
  });

  describe('FixedStage', () => {
    it('should place the specified count of objects', () => {
      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(makeSimpleDef(1));
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Fixed, typeId: 1, count: 5 },
        ],
      };
      const ctx = createContext();
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(5);
      for (const obj of output.objects) {
        expect(obj.typeId).toBe(1);
      }
    });

    it('should place fewer than requested when all attempts fail (collision)', () => {
      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(makeSimpleDef(1));
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Fixed, typeId: 1, count: 5 },
        ],
      };
      const ctx = createContext({ collision: createBlockingCollision() });
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(0);
    });

    it('should increase max attempts when important flag is set', () => {
      const feature = new ObjectPlacementFeature();
      let attempts = 0;
      const countingCollision: ICollisionProvider = {
        addShape: () => 0,
        testShape: () => { attempts++; return true; },
        removeShape: () => { return; },
        clear: () => { return; },
      };
      const registry = makeRegistry(makeSimpleDef(2));
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Fixed, typeId: 2, count: 1, important: true },
        ],
      };
      const ctx = createContext({ collision: countingCollision });
      feature.generate(ctx, config);

      expect(attempts).toBe(5000);
    });
  });

  describe('RandomStage', () => {
    it('should choose N types from spawns list', () => {
      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(
        makeSimpleDef(0),
        makeSimpleDef(1),
        makeSimpleDef(2),
      );
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Random, spawns: [0, 1, 2], choose: 2 },
        ],
      };
      const ctx = createContext();
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(2);
      for (const obj of output.objects) {
        expect([0, 1, 2]).toContain(obj.typeId);
      }
    });
  });

  describe('DensityStage', () => {
    it('should compute count proportional to map area', () => {
      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(makeSimpleDef(3));
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Density, typeId: 3, density: 50 },
        ],
      };
      const ctx = createContext();
      const output = feature.generate(ctx, config);

      // 50 * (40000 / 250000) = 8
      expect(output.objects.length).toBe(8);
    });
  });

  describe('Collision checking', () => {
    it('should prevent overlapping placements', () => {
      let addCount = 0;
      const collision: ICollisionProvider = {
        addShape: () => addCount++,
        testShape: (_x, _y, _shape, _scale) => addCount > 0,
        removeShape: () => { return; },
        clear: () => { return; },
      };
      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(makeSimpleDef(0));
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Fixed, typeId: 0, count: 5 },
        ],
      };
      const ctx = createContext({ collision });
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(1);
    });
  });

  describe('Children', () => {
    it('should place children at correct offsets from parent', () => {
      const feature = new ObjectPlacementFeature();
      const parentDef: MapObjectDef = {
        typeId: 10,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 10 } }],
        visuals: [],
        scaleRange: [1, 1],
        orientations: [0],
        children: [
          { typeId: 11, offset: { x: 5, y: 0 }, scale: 1, ori: 0 },
        ],
      };
      const childDef = makeSimpleDef(11);
      const registry = makeRegistry(parentDef, childDef);
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Location, typeId: 10, pos: { x: 100, y: 100 }, rad: 0, optional: false },
        ],
      };
      const ctx = createContext();
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(1);
      const parent = output.objects[0];
      expect(parent.children.length).toBe(1);
      const child = parent.children[0];
      expect(child.typeId).toBe(11);
      expect(child.posX).toBeCloseTo(parent.posX + 5, 1);
      expect(child.posY).toBeCloseTo(parent.posY, 1);
    });
  });

  describe('Works without terrain features', () => {
    it('should place objects with random positions within map bounds', () => {
      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(makeSimpleDef(0));
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Fixed, typeId: 0, count: 3 },
        ],
      };
      const ctx = createContext();
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(3);
      for (const obj of output.objects) {
        expect(obj.posX).toBeGreaterThanOrEqual(0);
        expect(obj.posX).toBeLessThanOrEqual(200);
        expect(obj.posY).toBeGreaterThanOrEqual(0);
        expect(obj.posY).toBeLessThanOrEqual(200);
      }
    });
  });

  describe('Determinism', () => {
    it('should produce same placements with same seed', () => {
      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(makeSimpleDef(0));
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Fixed, typeId: 0, count: 5 },
        ],
      };

      const ctx1 = createContext({ random: createMockRandom(42) });
      const ctx2 = createContext({ random: createMockRandom(42) });

      const output1 = feature.generate(ctx1, config);
      const output2 = feature.generate(ctx2, config);

      expect(output1.objects.length).toBe(output2.objects.length);
      for (let i = 0; i < output1.objects.length; i++) {
        expect(output1.objects[i].posX).toBe(output2.objects[i].posX);
        expect(output1.objects[i].posY).toBe(output2.objects[i].posY);
        expect(output1.objects[i].typeId).toBe(output2.objects[i].typeId);
      }
    });
  });

  describe('computePlacementBounds', () => {
    it('should return undefined for def with no non-sensor colliders', () => {
      const def: MapObjectDef = {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 10 }, isSensor: true }],
        visuals: [],
        scaleRange: [1, 1],
      };
      expect(computePlacementBounds(def)).toBeUndefined();
    });

    it('should return undefined for def with empty colliders', () => {
      const def: MapObjectDef = {
        typeId: 0,
        colliders: [],
        visuals: [],
        scaleRange: [1, 1],
      };
      expect(computePlacementBounds(def)).toBeUndefined();
    });

    it('should compute AABB for single circle collider without offset', () => {
      const def: MapObjectDef = {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 5 } }],
        visuals: [],
        scaleRange: [1, 1],
      };
      const bounds = computePlacementBounds(def);
      expect(bounds).toBeDefined();
      expect(bounds!.halfWidth).toBeCloseTo(5);
      expect(bounds!.halfHeight).toBeCloseTo(5);
      expect(bounds!.centerX).toBeCloseTo(0);
      expect(bounds!.centerY).toBeCloseTo(0);
    });

    it('should compute AABB for single cuboid collider with offset', () => {
      const def: MapObjectDef = {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 1 }, offsetY: -19 }],
        visuals: [],
        scaleRange: [1, 1],
      };
      const bounds = computePlacementBounds(def);
      expect(bounds).toBeDefined();
      expect(bounds!.halfWidth).toBeCloseTo(30);
      expect(bounds!.halfHeight).toBeCloseTo(1);
      expect(bounds!.centerX).toBeCloseTo(0);
      expect(bounds!.centerY).toBeCloseTo(-19);
    });

    it('should compute correct AABB and center offset for garage def (multi-collider)', () => {
      // Garage: top wall at y=-19, left wall at x=-29, right wall at x=29, inner partition at x=0 y=2
      const garageDef: MapObjectDef = {
        typeId: 1,
        colliders: [
          { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 1 }, offsetY: -19 },     // top wall
          { shape: { type: ShapeType.Cuboid, halfWidth: 1, halfHeight: 20 }, offsetX: -29 },      // left wall
          { shape: { type: ShapeType.Cuboid, halfWidth: 1, halfHeight: 20 }, offsetX: 29 },       // right wall
          { shape: { type: ShapeType.Cuboid, halfWidth: 1, halfHeight: 8 }, offsetX: 0, offsetY: 2 },  // inner partition
          { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 20 }, isSensor: true, tag: 1 }, // canopy sensor — EXCLUDED
        ],
        visuals: [],
        scaleRange: [1, 1],
      };
      const bounds = computePlacementBounds(garageDef);
      expect(bounds).toBeDefined();

      // Left wall: x from -30 to -28, right wall: x from 28 to 30 → total x: -30 to 30 → halfWidth = 30
      expect(bounds!.halfWidth).toBeCloseTo(30);

      // Top wall: y from -20 to -18, left/right walls: y from -20 to 20 → total y: -20 to 20 → halfHeight = 20
      expect(bounds!.halfHeight).toBeCloseTo(20);

      // Center: x = (-30+30)/2 = 0, y = (-20+20)/2 = 0
      expect(bounds!.centerX).toBeCloseTo(0);
      expect(bounds!.centerY).toBeCloseTo(0);
    });

    it('should compute non-zero center offset for asymmetric colliders', () => {
      // Only a top wall with offset — center should be at the wall's position
      const def: MapObjectDef = {
        typeId: 0,
        colliders: [
          { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 1 }, offsetY: -19 },
          { shape: { type: ShapeType.Cuboid, halfWidth: 1, halfHeight: 10 }, offsetX: -29, offsetY: -10 },
        ],
        visuals: [],
        scaleRange: [1, 1],
      };
      const bounds = computePlacementBounds(def);
      expect(bounds).toBeDefined();

      // x: min(-30, -30) = -30, max(30, -28) = 30 → halfWidth = 30, centerX = 0
      expect(bounds!.centerX).toBeCloseTo(0);

      // y: min(-20, -20) = -20, max(-18, 0) = 0 → halfHeight = 10, centerY = -10
      expect(bounds!.halfHeight).toBeCloseTo(10);
      expect(bounds!.centerY).toBeCloseTo(-10);
    });

    it('should handle circle collider with offset', () => {
      const def: MapObjectDef = {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 5 }, offsetX: 10, offsetY: 20 }],
        visuals: [],
        scaleRange: [1, 1],
      };
      const bounds = computePlacementBounds(def);
      expect(bounds).toBeDefined();
      expect(bounds!.halfWidth).toBeCloseTo(5);
      expect(bounds!.halfHeight).toBeCloseTo(5);
      expect(bounds!.centerX).toBeCloseTo(10);
      expect(bounds!.centerY).toBeCloseTo(20);
    });
  });

  describe('AABB collision in tryPlace', () => {
    it('should use AABB bounds for collision testing with multi-collider objects', () => {
      const capturedShapes: { shape: MapCollisionShape; posX: number; posY: number; scale: number }[] = [];
      const collision: ICollisionProvider = {
        addShape: (_id, shape, posX, posY, _rot, scale) => {
          capturedShapes.push({ shape, posX, posY, scale });
        },
        testShape: () => false,
        removeShape: () => { return; },
        clear: () => { return; },
      };

      const garageDef: MapObjectDef = {
        typeId: 1,
        colliders: [
          { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 1 }, offsetY: -19 },
          { shape: { type: ShapeType.Cuboid, halfWidth: 1, halfHeight: 20 }, offsetX: -29 },
          { shape: { type: ShapeType.Cuboid, halfWidth: 1, halfHeight: 20 }, offsetX: 29 },
          { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 20 }, isSensor: true, tag: 1 },
        ],
        visuals: [],
        scaleRange: [1, 1],
      };

      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(garageDef);
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Location, typeId: 1, pos: { x: 100, y: 100 }, rad: 0, optional: false },
        ],
      };
      const ctx = createContext({ collision });
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(1);
      expect(capturedShapes.length).toBe(1);

      const added = capturedShapes[0];
      // Should be a Cuboid with the full AABB bounds
      expect(added.shape.type).toBe(ShapeType.Cuboid);
      if (added.shape.type === ShapeType.Cuboid) {
        expect(added.shape.halfWidth).toBeCloseTo(30);
        expect(added.shape.halfHeight).toBeCloseTo(20);
      }
    });

    it('should store original position in PlacedObject, not adjusted by center offset', () => {
      const collision: ICollisionProvider = {
        addShape: () => { return; },
        testShape: () => false,
        removeShape: () => { return; },
        clear: () => { return; },
      };

      // Asymmetric def — only top wall → center offset is (0, -19)
      const def: MapObjectDef = {
        typeId: 0,
        colliders: [
          { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 1 }, offsetY: -19 },
        ],
        visuals: [],
        scaleRange: [1, 1],
      };

      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(def);
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Location, typeId: 0, pos: { x: 100, y: 100 }, rad: 0, optional: false },
        ],
      };
      const ctx = createContext({ collision });
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(1);
      const obj = output.objects[0];
      // PlacedObject should store the original position, NOT adjusted by center offset
      // With rad=0, position should be near (100, 100)
      expect(obj.posX).toBeCloseTo(100, 0);
      expect(obj.posY).toBeCloseTo(100, 0);
    });

    it('should apply center offset to collision position when testing/adding shapes', () => {
      const testedPositions: { posX: number; posY: number }[] = [];
      const collision: ICollisionProvider = {
        addShape: (_id, _shape, posX, posY) => {
          testedPositions.push({ posX, posY });
        },
        testShape: (_shape, posX, posY) => {
          testedPositions.push({ posX, posY });
          return false;
        },
        removeShape: () => { return; },
        clear: () => { return; },
      };

      // Asymmetric def — only top wall → center offset is (0, -19)
      const def: MapObjectDef = {
        typeId: 0,
        colliders: [
          { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 1 }, offsetY: -19 },
        ],
        visuals: [],
        scaleRange: [1, 1],
      };

      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(def);
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Location, typeId: 0, pos: { x: 100, y: 100 }, rad: 0, optional: false },
        ],
      };
      const ctx = createContext({ collision });
      feature.generate(ctx, config);

      // Both testShape and addShape should have used the adjusted position
      // The center offset for this single wall is (0, -19)
      // So collision position should be approximately (100, 100 + (-19) * 1) = (100, 81)
      expect(testedPositions.length).toBeGreaterThanOrEqual(2); // testShape + addShape
      for (const pos of testedPositions) {
        expect(pos.posX).toBeCloseTo(100, 0);
        expect(pos.posY).toBeCloseTo(81, 0);
      }
    });
  });

  describe('Terrain corner checking', () => {
    it('should reject large object when corner is in wrong terrain zone (grass boundary)', () => {
      const collision: ICollisionProvider = {
        addShape: () => { return; },
        testShape: () => false,
        removeShape: () => { return; },
        clear: () => { return; },
      };

      // Large object: halfWidth=30
      const largeDef: MapObjectDef = {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 30 } }],
        visuals: [],
        scaleRange: [1, 1],
      };

      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(largeDef);

      // Grass polygon covers only x:[20,150], y:[20,180]
      // Objects placed near x=150 boundary with halfWidth=30 would have right corner at x=180 (outside grass → Beach)
      const grassPoly = [
        { x: 20, y: 20 }, { x: 150, y: 20 }, { x: 150, y: 180 }, { x: 20, y: 180 },
      ];
      const grassBounds = { min: { x: 20, y: 20 }, max: { x: 150, y: 180 } };

      // Shore polygon covers the full map — positions outside grass but inside shore = Beach
      const shorePoly = [
        { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 },
      ];
      const shoreBounds = { min: { x: 0, y: 0 }, max: { x: 200, y: 200 } };

      const outputs = new Map<FeatureId, unknown>();
      outputs.set(FeatureId.Grass, { polygon: grassPoly, bounds: grassBounds });
      outputs.set(FeatureId.Shore, { polygon: shorePoly, bounds: shoreBounds });

      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Fixed, typeId: 0, count: 100, terrainZone: TerrainZone.Grass },
        ],
      };

      const ctx: GenerationContext = {
        width: 200,
        height: 200,
        center: { x: 100, y: 100 },
        random: createMockRandom(42),
        collision,
        get: <T>(f: { readonly id: FeatureId }) => outputs.get(f.id) as T,
        hasFeature: (id: FeatureId) => outputs.has(id),
      };
      const output = feature.generate(ctx, config);

      // All placed objects should have ALL corners within the grass zone
      for (const obj of output.objects) {
        const bounds = computePlacementBounds(largeDef)!;
        const hw = bounds.halfWidth * obj.scale;
        const hh = bounds.halfHeight * obj.scale;
        const cx = obj.posX + bounds.centerX * obj.scale;
        const cy = obj.posY + bounds.centerY * obj.scale;

        // All 4 corners must be inside grass polygon
        expect(cx - hw).toBeGreaterThanOrEqual(20);
        expect(cx + hw).toBeLessThanOrEqual(150);
        expect(cy - hh).toBeGreaterThanOrEqual(20);
        expect(cy + hh).toBeLessThanOrEqual(180);
      }
    });

    it('should still place objects when all corners are in correct zone', () => {
      const collision: ICollisionProvider = {
        addShape: () => { return; },
        testShape: () => false,
        removeShape: () => { return; },
        clear: () => { return; },
      };

      const smallDef: MapObjectDef = {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 2 } }],
        visuals: [],
        scaleRange: [1, 1],
      };

      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(smallDef);
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Fixed, typeId: 0, count: 5 },
        ],
      };
      const ctx = createContext({ collision });
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(5);
    });

    it('should not check corners for objects without bounds (no colliders)', () => {
      const collision: ICollisionProvider = {
        addShape: () => { return; },
        testShape: () => false,
        removeShape: () => { return; },
        clear: () => { return; },
      };

      const noColliderDef: MapObjectDef = {
        typeId: 0,
        colliders: [],
        visuals: [],
        scaleRange: [1, 1],
      };

      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(noColliderDef);
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Fixed, typeId: 0, count: 3 },
        ],
      };
      const ctx = createContext({ collision });
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(3);
    });

    it('should pass terrainZone from placeFixed/placeRandom/placeDensity but not placeLocation', () => {
      // Verify that placeLocation passes undefined terrainZone (no zone constraint in tryPlace corners)
      const collision: ICollisionProvider = {
        addShape: () => { return; },
        testShape: () => false,
        removeShape: () => { return; },
        clear: () => { return; },
      };

      const def: MapObjectDef = {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Cuboid, halfWidth: 10, halfHeight: 10 } }],
        visuals: [],
        scaleRange: [1, 1],
      };

      const feature = new ObjectPlacementFeature();
      const registry = makeRegistry(def);
      // Location stage has no terrainZone field — should still place without corner checks
      const config: ObjectPlacementConfig = {
        registry,
        stages: [
          { kind: PlacementKind.Location, typeId: 0, pos: { x: 100, y: 100 }, rad: 0, optional: false },
        ],
      };
      const ctx = createContext({ collision });
      const output = feature.generate(ctx, config);

      expect(output.objects.length).toBe(1);
    });
  });
});
