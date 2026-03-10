import { GeneratedMap } from '../../lib/core/generated-map.js';
import { FeatureId } from '../../lib/types/feature.js';

describe('GeneratedMap', () => {
  it('should store and retrieve feature outputs via get()', () => {
    const map = new GeneratedMap(512, 512, 16);
    const output = { polygon: { points: [{ x: 0, y: 0 }], count: 1 } };

    map.setFeatureOutput(FeatureId.Shore, output);

    expect(map.get<typeof output>({ id: FeatureId.Shore })).toBe(output);
  });

  it('should return undefined for missing feature', () => {
    const map = new GeneratedMap(512, 512, 16);

    expect(map.get(({ id: 99 as FeatureId }))).toBeUndefined();
  });

  it('should expose dimensions', () => {
    const map = new GeneratedMap(800, 600, 32);

    expect(map.width).toBe(800);
    expect(map.height).toBe(600);
    expect(map.gridSize).toBe(32);
  });

  it('should support type-safe get() via feature class', () => {
    const map = new GeneratedMap(512, 512, 16);
    map.setFeatureOutput(FeatureId.Biome, { grass: 0x80af49 });

    const result = map.get<{ grass: number }>({ id: FeatureId.Biome });

    expect(result).toEqual({ grass: 0x80af49 });
  });
});
