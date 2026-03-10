import { describe, it, expect } from 'vitest';
import { PlacesFeature } from '../../lib/features/places-feature.js';
import { FeatureId } from '../../lib/types/feature.js';
import { STANDARD_BIOME } from '../../lib/presets/standard-biome.js';
import type { GenerationContext } from '../../lib/types/feature.js';
import type { PlacesConfig } from '../../lib/types/feature-configs.js';
import type { ICollisionProvider } from '../../lib/types/collision-provider.js';
import { createMockRandom } from '../helpers/mock-random.js';

function createMockCollision(): ICollisionProvider {
  return {
    addShape: () => { return; },
    testShape: () => false,
    removeShape: () => { return; },
    clear: () => { return; },
  };
}

function createContext(): GenerationContext {
  return {
    width: 720,
    height: 720,
    center: { x: 360, y: 360 },
    random: createMockRandom(42),
    collision: createMockCollision(),
    get: () => { throw new Error('not available'); },
    hasFeature: () => false,
  };
}

describe('PlacesFeature', () => {
  it('should have correct id and requires', () => {
    const feature = new PlacesFeature();
    expect(feature.id).toBe(FeatureId.Places);
    expect(feature.requires).toEqual([]);
  });

  it('should convert normalized positions to world coordinates', () => {
    const feature = new PlacesFeature();
    const config: PlacesConfig = {
      places: [
        { name: 'spawn', pos: { x: 0.5, y: 0.5 } },
        { name: 'corner', pos: { x: 0, y: 0 } },
        { name: 'far', pos: { x: 1, y: 1 } },
      ],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);

    expect(output.places.length).toBe(3);
    expect(output.places[0]).toEqual({ name: 'spawn', x: 360, y: 360 });
    expect(output.places[1]).toEqual({ name: 'corner', x: 0, y: 0 });
    expect(output.places[2]).toEqual({ name: 'far', x: 720, y: 720 });
  });
});

describe('STANDARD_BIOME', () => {
  it('should have all required color fields', () => {
    expect(STANDARD_BIOME.background).toBeDefined();
    expect(STANDARD_BIOME.water).toBeDefined();
    expect(STANDARD_BIOME.waterRipple).toBeDefined();
    expect(STANDARD_BIOME.beach).toBeDefined();
    expect(STANDARD_BIOME.riverbank).toBeDefined();
    expect(STANDARD_BIOME.grass).toBeDefined();
    expect(STANDARD_BIOME.underground).toBeDefined();
  });

  it('should have numeric color values', () => {
    for (const value of Object.values(STANDARD_BIOME)) {
      expect(typeof value).toBe('number');
    }
  });
});
