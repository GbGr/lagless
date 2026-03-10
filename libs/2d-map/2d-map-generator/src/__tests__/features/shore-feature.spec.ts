import { MathOps } from '@lagless/math';
import { ShoreFeature } from '../../lib/features/shore-feature.js';
import { MapGenerator } from '../../lib/core/map-generator.js';
import { createMockRandom } from '../helpers/mock-random.js';
import { FeatureId } from '../../lib/types/feature.js';
import type { ShoreConfig, ShoreOutput, MapGeneratorConfig } from '../../lib/types/index.js';

const DEFAULT_CONFIG: MapGeneratorConfig = {
  baseWidth: 512, baseHeight: 512, scale: 1.0, extension: 0,
};

const noopCollision = {
  addShape() { return; }, testShape() { return false; }, removeShape() { return; }, clear() { return; },
};

describe('ShoreFeature', () => {
  beforeAll(async () => {
    await MathOps.init();
  });

  it('should have correct id and no requirements', () => {
    const feature = new ShoreFeature();
    expect(feature.id).toBe(FeatureId.Shore);
    expect(feature.requires).toEqual([]);
  });

  it('should produce a polygon with correct point count', () => {
    const gen = new MapGenerator(DEFAULT_CONFIG);
    const shoreConfig: ShoreConfig = { inset: 48, divisions: 8, variation: 3 };

    gen.addFeature(new ShoreFeature(), shoreConfig);
    const map = gen.generate(createMockRandom(), noopCollision);

    const output = map.get<ShoreOutput>(ShoreFeature);
    expect(output).toBeDefined();
    // 4 corners + 4 * 8 intermediate = 36
    expect(output!.polygon.count).toBe(36);
    expect(output!.polygon.points.length).toBe(36);
  });

  it('should produce bounds matching the shore inset', () => {
    const gen = new MapGenerator(DEFAULT_CONFIG);
    const shoreConfig: ShoreConfig = { inset: 48, divisions: 8, variation: 0 };

    gen.addFeature(new ShoreFeature(), shoreConfig);
    const map = gen.generate(createMockRandom(), noopCollision);

    const output = map.get<ShoreOutput>(ShoreFeature);
    expect(output!.bounds.min.x).toBe(48);
    expect(output!.bounds.min.y).toBe(48);
    expect(output!.bounds.max.x).toBe(512 - 48);
    expect(output!.bounds.max.y).toBe(512 - 48);
  });

  it('should produce deterministic output', () => {
    function run() {
      const gen = new MapGenerator(DEFAULT_CONFIG);
      gen.addFeature(new ShoreFeature(), { inset: 48, divisions: 8, variation: 3 });
      return gen.generate(createMockRandom(42), noopCollision).get<ShoreOutput>(ShoreFeature);
    }
    expect(run()).toEqual(run());
  });
});
