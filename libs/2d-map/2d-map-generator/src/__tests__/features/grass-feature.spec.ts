import { MathOps } from '@lagless/math';
import { ShoreFeature } from '../../lib/features/shore-feature.js';
import { GrassFeature } from '../../lib/features/grass-feature.js';
import { MapGenerator } from '../../lib/core/map-generator.js';
import { createMockRandom } from '../helpers/mock-random.js';
import { FeatureId } from '../../lib/types/feature.js';
import type { GrassConfig, GrassOutput, ShoreConfig, MapGeneratorConfig } from '../../lib/types/index.js';

const DEFAULT_CONFIG: MapGeneratorConfig = {
  baseWidth: 512, baseHeight: 512, scale: 1.0, extension: 0,
};

const noopCollision = {
  addShape() { return; }, testShape() { return false; }, removeShape() { return; }, clear() { return; },
};

describe('GrassFeature', () => {
  beforeAll(async () => {
    await MathOps.init();
  });

  it('should have correct id and require Shore', () => {
    const feature = new GrassFeature();
    expect(feature.id).toBe(FeatureId.Grass);
    expect(feature.requires).toEqual([FeatureId.Shore]);
  });

  it('should produce a polygon with same point count as shore', () => {
    const gen = new MapGenerator(DEFAULT_CONFIG);
    const shoreConfig: ShoreConfig = { inset: 48, divisions: 8, variation: 3 };
    const grassConfig: GrassConfig = { inset: 18, variation: 2 };

    gen.addFeature(new ShoreFeature(), shoreConfig);
    gen.addFeature(new GrassFeature(), grassConfig);
    const map = gen.generate(createMockRandom(), noopCollision);

    const output = map.get<GrassOutput>(GrassFeature);
    expect(output).toBeDefined();
    expect(output!.polygon.count).toBe(36);
  });

  it('should produce grass polygon inset from shore polygon', () => {
    const gen = new MapGenerator(DEFAULT_CONFIG);
    const shoreConfig: ShoreConfig = { inset: 48, divisions: 4, variation: 0 };
    const grassConfig: GrassConfig = { inset: 18, variation: 0 };

    gen.addFeature(new ShoreFeature(), shoreConfig);
    gen.addFeature(new GrassFeature(), grassConfig);
    const map = gen.generate(createMockRandom(), noopCollision);

    const output = map.get<GrassOutput>(GrassFeature);
    expect(output!.bounds.min.x).toBeGreaterThan(48);
    expect(output!.bounds.min.y).toBeGreaterThan(48);
    expect(output!.bounds.max.x).toBeLessThan(512 - 48);
    expect(output!.bounds.max.y).toBeLessThan(512 - 48);
  });

  it('should compute positive area', () => {
    const gen = new MapGenerator(DEFAULT_CONFIG);
    gen.addFeature(new ShoreFeature(), { inset: 48, divisions: 4, variation: 0 });
    gen.addFeature(new GrassFeature(), { inset: 18, variation: 0 });
    const map = gen.generate(createMockRandom(), noopCollision);

    const output = map.get<GrassOutput>(GrassFeature);
    expect(output!.area).toBeGreaterThan(0);
  });

  it('should produce deterministic output', () => {
    function run() {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      gen.addFeature(new ShoreFeature(), { inset: 48, divisions: 8, variation: 3 });
      gen.addFeature(new GrassFeature(), { inset: 18, variation: 2 });
      return gen.generate(createMockRandom(42), noopCollision).get<GrassOutput>(GrassFeature);
    }
    expect(run()).toEqual(run());
  });
});
