import { MapGenerator } from '../../lib/core/map-generator.js';
import { createMockRandom } from '../helpers/mock-random.js';
import type { GenerationContext, IMapFeature, MapGeneratorConfig, ICollisionProvider } from '../../lib/types/index.js';
import { FeatureId } from '../../lib/types/feature.js';

const DEFAULT_CONFIG: MapGeneratorConfig = {
  baseWidth: 512,
  baseHeight: 512,
  scale: 1.0,
  extension: 0,
  gridSize: 16,
};

// Use real FeatureId values as mock IDs
const ID_A = FeatureId.Biome;
const ID_B = FeatureId.Shore;
const ID_C = FeatureId.Grass;
const ID_TEST = FeatureId.River;
const ID_RANDOM = FeatureId.Lake;

function createMockFeature(id: FeatureId, requires: FeatureId[] = []): IMapFeature<undefined, { id: FeatureId; ran: true }> {
  return {
    id,
    requires,
    generate(_ctx: GenerationContext) {
      return { id, ran: true };
    },
  };
}

let globalCallCount = 0;

function createCountingFeature(id: FeatureId, requires: FeatureId[] = []): IMapFeature<undefined, { order: number }> & { callOrder: number } {
  const feature = {
    id,
    requires,
    callOrder: -1,
    generate(_ctx: GenerationContext) {
      feature.callOrder = globalCallCount++;
      return { order: feature.callOrder };
    },
  };
  return feature;
}

const noopCollision: ICollisionProvider = {
  addShape() { return; },
  testShape() { return false; },
  removeShape() { return; },
  clear() { return; },
};

describe('MapGenerator', () => {
  describe('addFeature', () => {
    it('should return this for chaining', () => {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      const result = gen.addFeature(createMockFeature(ID_A), undefined);
      expect(result).toBe(gen);
    });
  });

  describe('topological sort', () => {
    it('should run features in dependency order', () => {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      const featureA = createCountingFeature(ID_A);
      const featureB = createCountingFeature(ID_B, [ID_A]);
      const featureC = createCountingFeature(ID_C, [ID_B]);

      // Add in reverse order
      gen.addFeature(featureC, undefined);
      gen.addFeature(featureA, undefined);
      gen.addFeature(featureB, undefined);

      gen.generate(createMockRandom(), noopCollision);

      expect(featureA.callOrder).toBeLessThan(featureB.callOrder);
      expect(featureB.callOrder).toBeLessThan(featureC.callOrder);
    });

    it('should throw on missing required dependency', () => {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      gen.addFeature(createMockFeature(ID_C, [ID_B]), undefined);

      expect(() => gen.generate(createMockRandom(), noopCollision))
        .toThrow(/requires.*which was not included/);
    });

    it('should throw on circular dependency', () => {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      gen.addFeature(createMockFeature(ID_A, [ID_B]), undefined);
      gen.addFeature(createMockFeature(ID_B, [ID_A]), undefined);

      expect(() => gen.generate(createMockRandom(), noopCollision))
        .toThrow(/circular/i);
    });
  });

  describe('generate', () => {
    it('should return GeneratedMap with feature outputs', () => {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      gen.addFeature(createMockFeature(ID_B), undefined);
      gen.addFeature(createMockFeature(ID_C, [ID_B]), undefined);

      const map = gen.generate(createMockRandom(), noopCollision);

      expect(map.get({ id: ID_B })).toEqual({ id: ID_B, ran: true });
      expect(map.get({ id: ID_C })).toEqual({ id: ID_C, ran: true });
    });

    it('should compute correct dimensions', () => {
      const config: MapGeneratorConfig = {
        baseWidth: 512,
        baseHeight: 512,
        scale: 1.19,
        extension: 112,
      };
      const gen = new MapGenerator(config);
      gen.addFeature(createMockFeature(ID_TEST), undefined);

      const map = gen.generate(createMockRandom(), noopCollision);

      expect(map.width).toBeCloseTo(512 * 1.19 + 112, 5);
      expect(map.height).toBeCloseTo(512 * 1.19 + 112, 5);
    });

    it('should use default gridSize of 16', () => {
      const config: MapGeneratorConfig = {
        baseWidth: 512,
        baseHeight: 512,
        scale: 1.0,
        extension: 0,
      };
      const gen = new MapGenerator(config);
      gen.addFeature(createMockFeature(ID_TEST), undefined);

      const map = gen.generate(createMockRandom(), noopCollision);

      expect(map.gridSize).toBe(16);
    });
  });

  describe('GenerationContext', () => {
    it('should provide get() for previously run features', () => {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      let capturedCtx: GenerationContext | null = null;

      const featureA: IMapFeature = {
        id: ID_A,
        requires: [],
        generate() { return { value: 42 }; },
      };
      const featureB: IMapFeature = {
        id: ID_B,
        requires: [ID_A],
        generate(ctx: GenerationContext) {
          capturedCtx = ctx;
          return {};
        },
      };

      gen.addFeature(featureA, undefined);
      gen.addFeature(featureB, undefined);
      gen.generate(createMockRandom(), noopCollision);

      expect(capturedCtx!.get<{ value: number }>({ id: ID_A })).toEqual({ value: 42 });
    });

    it('should throw get() for feature not yet run', () => {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      let capturedCtx: GenerationContext | null = null;

      const featureA: IMapFeature = {
        id: ID_A,
        requires: [],
        generate(ctx: GenerationContext) {
          capturedCtx = ctx;
          return {};
        },
      };

      gen.addFeature(featureA, undefined);
      gen.generate(createMockRandom(), noopCollision);

      expect(() => capturedCtx!.get({ id: 99 as FeatureId })).toThrow();
    });

    it('should provide hasFeature correctly', () => {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      let capturedCtx: GenerationContext | null = null;

      const featureA: IMapFeature = {
        id: ID_A,
        requires: [],
        generate() { return { value: 1 }; },
      };
      const featureB: IMapFeature = {
        id: ID_B,
        requires: [ID_A],
        generate(ctx: GenerationContext) {
          capturedCtx = ctx;
          return {};
        },
      };

      gen.addFeature(featureA, undefined);
      gen.addFeature(featureB, undefined);
      gen.generate(createMockRandom(), noopCollision);

      expect(capturedCtx!.hasFeature(ID_A)).toBe(true);
      expect(capturedCtx!.hasFeature(99 as FeatureId)).toBe(false);
    });

    it('should provide width, height, center', () => {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      let capturedCtx: GenerationContext | null = null;

      gen.addFeature({
        id: ID_TEST,
        requires: [],
        generate(ctx: GenerationContext) {
          capturedCtx = ctx;
          return {};
        },
      }, undefined);
      gen.generate(createMockRandom(), noopCollision);

      expect(capturedCtx!.width).toBe(512);
      expect(capturedCtx!.height).toBe(512);
      expect(capturedCtx!.center).toEqual({ x: 256, y: 256 });
    });
  });

  describe('determinism', () => {
    it('should produce identical output for same seed and features', () => {
      function runGeneration() {
        const gen = new MapGenerator(DEFAULT_CONFIG);
        const feature: IMapFeature<undefined, { values: number[] }> = {
          id: ID_RANDOM,
          requires: [],
          generate(ctx: GenerationContext) {
            const values: number[] = [];
            for (let i = 0; i < 10; i++) {
              values.push(ctx.random.getFloat());
            }
            return { values };
          },
        };

        gen.addFeature(feature, undefined);
        return gen.generate(createMockRandom(42), noopCollision);
      }

      const map1 = runGeneration();
      const map2 = runGeneration();

      expect(map1.get({ id: ID_RANDOM }))
        .toEqual(map2.get({ id: ID_RANDOM }));
    });
  });
});
