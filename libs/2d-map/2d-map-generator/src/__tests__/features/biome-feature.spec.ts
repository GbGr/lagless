import { BiomeFeature } from '../../lib/features/biome-feature.js';
import { MapGenerator } from '../../lib/core/map-generator.js';
import { createMockRandom } from '../helpers/mock-random.js';
import { FeatureId } from '../../lib/types/feature.js';
import type { BiomeConfig, BiomeOutput, MapGeneratorConfig } from '../../lib/types/index.js';

const DEFAULT_CONFIG: MapGeneratorConfig = {
  baseWidth: 512, baseHeight: 512, scale: 1.0, extension: 0,
};

const noopCollision = {
  addShape() { return; }, testShape() { return false; }, removeShape() { return; }, clear() { return; },
};

describe('BiomeFeature', () => {
  it('should have correct id and no requirements', () => {
    const feature = new BiomeFeature();
    expect(feature.id).toBe(FeatureId.Biome);
    expect(feature.requires).toEqual([]);
  });

  it('should passthrough config as output', () => {
    const gen = new MapGenerator(DEFAULT_CONFIG);
    const biomeConfig: BiomeConfig = {
      background: 0x20536E,
      water: 0x3282AB,
      waterRipple: 0xb3f0ff,
      beach: 0xEFB35B,
      riverbank: 0x905E24,
      grass: 0x80AF49,
      underground: 0x1B0D00,
    };

    gen.addFeature(new BiomeFeature(), biomeConfig);
    const map = gen.generate(createMockRandom(), noopCollision);

    const output = map.get<BiomeOutput>(BiomeFeature);
    expect(output).toEqual(biomeConfig);
  });
});
