import { describe, it, expect, beforeAll } from 'vitest';
import { MathOps } from '@lagless/math';
import { LakeFeature } from '../../lib/features/lake-feature.js';
import { FeatureId } from '../../lib/types/feature.js';
import type { GenerationContext } from '../../lib/types/feature.js';
import type { LakeConfig } from '../../lib/types/feature-configs.js';
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

describe('LakeFeature', () => {
  it('should have correct id and requires', () => {
    const feature = new LakeFeature();
    expect(feature.id).toBe(FeatureId.Lake);
    expect(feature.requires).toEqual([]);
  });

  it('should generate looped circular lakes', () => {
    const feature = new LakeFeature();
    const config: LakeConfig = {
      lakes: [
        { odds: 1.0, innerRad: 30, outerRad: 50, spawnBound: { pos: { x: 360, y: 360 }, rad: 100 } },
      ],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);

    expect(output.lakes.length).toBe(1);
    expect(output.lakes[0].looped).toBe(true);
  });

  it('should generate lake points forming a roughly circular shape', () => {
    const feature = new LakeFeature();
    const config: LakeConfig = {
      lakes: [
        { odds: 1.0, innerRad: 30, outerRad: 50, spawnBound: { pos: { x: 360, y: 360 }, rad: 100 } },
      ],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);

    const lake = output.lakes[0];
    for (const pt of lake.splinePoints) {
      const dx = pt.x - lake.center.x;
      const dy = pt.y - lake.center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeGreaterThan(10);
      expect(dist).toBeLessThan(80);
    }
  });

  it('should output a valid GeneratedRiver with looped=true', () => {
    const feature = new LakeFeature();
    const config: LakeConfig = {
      lakes: [
        { odds: 1.0, innerRad: 30, outerRad: 50, spawnBound: { pos: { x: 360, y: 360 }, rad: 100 } },
      ],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);

    const lake = output.lakes[0];
    expect(lake.waterPoly.points.length).toBeGreaterThan(0);
    expect(lake.waterPoly.count).toBe(lake.waterPoly.points.length);
    expect(lake.shorePoly.points.length).toBeGreaterThan(0);
    expect(lake.shorePoly.count).toBe(lake.shorePoly.points.length);
    expect(lake.aabb).toBeDefined();
    expect(lake.looped).toBe(true);
  });

  it('should respect odds — skip lake when random exceeds odds', () => {
    const feature = new LakeFeature();
    const config: LakeConfig = {
      lakes: [
        { odds: 0.0, innerRad: 30, outerRad: 50, spawnBound: { pos: { x: 360, y: 360 }, rad: 100 } },
      ],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);

    expect(output.lakes.length).toBe(0);
  });

  it('should generate multiple lakes when configured', () => {
    const feature = new LakeFeature();
    const config: LakeConfig = {
      lakes: [
        { odds: 1.0, innerRad: 20, outerRad: 40, spawnBound: { pos: { x: 200, y: 200 }, rad: 80 } },
        { odds: 1.0, innerRad: 25, outerRad: 45, spawnBound: { pos: { x: 500, y: 500 }, rad: 80 } },
      ],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);

    expect(output.lakes.length).toBe(2);
    for (const lake of output.lakes) {
      expect(lake.looped).toBe(true);
    }
  });

  it('should be deterministic — same seed produces same output', () => {
    const feature = new LakeFeature();
    const config: LakeConfig = {
      lakes: [
        { odds: 1.0, innerRad: 30, outerRad: 50, spawnBound: { pos: { x: 360, y: 360 }, rad: 100 } },
      ],
    };
    const ctx1 = createContext({ random: createMockRandom(42) });
    const ctx2 = createContext({ random: createMockRandom(42) });

    const output1 = feature.generate(ctx1, config);
    const output2 = feature.generate(ctx2, config);

    expect(output1.lakes.length).toBe(output2.lakes.length);
    for (let i = 0; i < output1.lakes.length; i++) {
      expect(output1.lakes[i].splinePoints).toEqual(output2.lakes[i].splinePoints);
      expect(output1.lakes[i].waterWidth).toBe(output2.lakes[i].waterWidth);
    }
  });

  it('should generate lake with expected number of spline points', () => {
    const feature = new LakeFeature();
    const config: LakeConfig = {
      lakes: [
        { odds: 1.0, innerRad: 30, outerRad: 50, spawnBound: { pos: { x: 360, y: 360 }, rad: 100 } },
      ],
    };
    const ctx = createContext();
    const output = feature.generate(ctx, config);

    const lake = output.lakes[0];
    expect(lake.splinePoints.length).toBeGreaterThanOrEqual(20);
  });
});
