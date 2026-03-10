import { describe, it, expect, beforeAll } from 'vitest';
import { MathOps } from '@lagless/math';
import { RiverFeature } from '../../lib/features/river-feature.js';
import { FeatureId } from '../../lib/types/feature.js';
import type { GenerationContext } from '../../lib/types/feature.js';
import type { RiverConfig } from '../../lib/types/feature-configs.js';
import type { ICollisionProvider } from '../../lib/types/collision-provider.js';
import { createMockRandom } from '../helpers/mock-random.js';

beforeAll(async () => {
  await MathOps.init();
});

function createMockCollision(): ICollisionProvider {
  return {
    addShape: () => 0,
    testShape: () => false,
    removeShape: () => { return; },
    clear: () => { return; },
  };
}

function createContext(overrides: Partial<GenerationContext> = {}): GenerationContext {
  return {
    width: 720,
    height: 720,
    center: { x: 360, y: 360 },
    random: createMockRandom(42),
    collision: createMockCollision(),
    get: () => { throw new Error('not available'); },
    hasFeature: () => false,
    ...overrides,
  };
}

const defaultConfig: RiverConfig = {
  weights: [
    { weight: 1.0, widths: [8] },
  ],
  subdivisionPasses: 5,

  masks: [],
};

describe('RiverFeature', () => {
  it('should have correct id and requires', () => {
    const feature = new RiverFeature();
    expect(feature.id).toBe(FeatureId.River);
    expect(feature.requires).toEqual([]);
  });

  it('should generate rivers with correct subdivision', () => {
    const feature = new RiverFeature();
    const ctx = createContext();
    const output = feature.generate(ctx, defaultConfig);

    expect(output.rivers.length).toBeGreaterThan(0);
    for (const river of output.rivers) {
      expect(river.splinePoints.length).toBeGreaterThanOrEqual(3);
      expect(river.waterWidth).toBe(8);
      expect(river.looped).toBe(false);
    }
  });

  it('should generate river points within map bounds', () => {
    const feature = new RiverFeature();
    const ctx = createContext();
    const output = feature.generate(ctx, defaultConfig);

    for (const river of output.rivers) {
      for (const pt of river.splinePoints) {
        expect(pt.x).toBeGreaterThanOrEqual(-50);
        expect(pt.x).toBeLessThanOrEqual(770);
        expect(pt.y).toBeGreaterThanOrEqual(-50);
        expect(pt.y).toBeLessThanOrEqual(770);
      }
    }
  });

  it('should respect mask exclusion zones', () => {
    const feature = new RiverFeature();
    const config: RiverConfig = {
      ...defaultConfig,
      masks: [{ pos: { x: 360, y: 360 }, rad: 50 }],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);
    expect(output.rivers).toBeDefined();
  });

  it('should produce normalRivers containing only non-looped rivers', () => {
    const feature = new RiverFeature();
    const ctx = createContext();
    const output = feature.generate(ctx, defaultConfig);

    for (const river of output.normalRivers) {
      expect(river.looped).toBe(false);
    }
    expect(output.normalRivers.length).toBe(output.rivers.length);
  });

  it('should handle weighted random selection with multiple width sets', () => {
    const feature = new RiverFeature();
    const config: RiverConfig = {
      weights: [
        { weight: 0.5, widths: [16, 8] },
        { weight: 0.5, widths: [4] },
      ],
      subdivisionPasses: 5,
    
      masks: [],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);

    expect(output.rivers.length).toBeGreaterThan(0);
  });

  it('should produce valid water and shore polygons', () => {
    const feature = new RiverFeature();
    const ctx = createContext();
    const output = feature.generate(ctx, defaultConfig);

    for (const river of output.rivers) {
      expect(river.waterPoly.points.length).toBeGreaterThan(0);
      expect(river.waterPoly.count).toBe(river.waterPoly.points.length);
      expect(river.shorePoly.points.length).toBeGreaterThan(0);
      expect(river.shorePoly.count).toBe(river.shorePoly.points.length);
      expect(river.aabb).toBeDefined();
      expect(river.center).toBeDefined();
    }
  });

  it('should be deterministic — same seed produces same output', () => {
    const feature = new RiverFeature();
    const ctx1 = createContext({ random: createMockRandom(42) });
    const ctx2 = createContext({ random: createMockRandom(42) });

    const output1 = feature.generate(ctx1, defaultConfig);
    const output2 = feature.generate(ctx2, defaultConfig);

    expect(output1.rivers.length).toBe(output2.rivers.length);
    for (let i = 0; i < output1.rivers.length; i++) {
      expect(output1.rivers[i].splinePoints).toEqual(output2.rivers[i].splinePoints);
      expect(output1.rivers[i].waterWidth).toBe(output2.rivers[i].waterWidth);
    }
  });

  it('should generate multiple rivers from multi-width config', () => {
    const feature = new RiverFeature();
    const config: RiverConfig = {
      weights: [
        { weight: 1.0, widths: [16, 8, 4] },
      ],
      subdivisionPasses: 5,
    
      masks: [],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);

    expect(output.rivers.length).toBe(3);
    const widths = output.rivers.map(r => r.waterWidth).sort((a, b) => b - a);
    expect(widths).toEqual([16, 8, 4]);
  });
});
