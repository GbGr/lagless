import { describe, it, expect, beforeAll } from 'vitest';
import { MathOps } from '@lagless/math';
import { BridgeFeature } from '../../lib/features/bridge-feature.js';
import { FeatureId } from '../../lib/types/feature.js';
import type { BridgeConfig, RiverOutput } from '../../lib/types/feature-configs.js';
import type { GenerationContext } from '../../lib/types/feature.js';
import type { ICollisionProvider } from '../../lib/types/collision-provider.js';
import type { GeneratedRiver } from '../../lib/types/generated-river.js';
import { generateRiverPolygon } from '../../lib/math/river-polygon.js';
import { createMockRandom } from '../helpers/mock-random.js';

beforeAll(async () => {
  await MathOps.init();
});

function createMockCollision(): ICollisionProvider {
  return {
    addShape: () => { return; },
    testShape: () => false,
    removeShape: () => { return; },
    clear: () => { return; },
  };
}

function makeRiver(waterWidth: number): GeneratedRiver {
  const splinePoints = [
    { x: 0, y: 100 },
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 300, y: 100 },
  ];
  return generateRiverPolygon({
    splinePoints,
    waterWidth,
    shoreWidth: Math.max(4, Math.min(8, waterWidth * 0.75)),
    looped: false,
    mapWidth: 300,
    mapHeight: 200,
  });
}

function createContext(riverOutput: RiverOutput): GenerationContext {
  const outputs = new Map<FeatureId, unknown>();
  outputs.set(FeatureId.River, riverOutput);

  return {
    width: 300,
    height: 200,
    center: { x: 150, y: 100 },
    random: createMockRandom(42),
    collision: createMockCollision(),
    get: <T>(f: { readonly id: FeatureId }) => outputs.get(f.id) as T,
    hasFeature: (id: FeatureId) => outputs.has(id),
  };
}

const defaultConfig: BridgeConfig = {
  bridgeTypes: { medium: 10, large: 11, xlarge: 12 },
  maxPerSize: { medium: 3, large: 2, xlarge: 1 },
};

describe('BridgeFeature', () => {
  it('should have correct id and requires', () => {
    const feature = new BridgeFeature();
    expect(feature.id).toBe(FeatureId.Bridge);
    expect(feature.requires).toEqual([FeatureId.River]);
  });

  it('should place bridges on rivers', () => {
    const river = makeRiver(8);
    const riverOutput: RiverOutput = { rivers: [river], normalRivers: [river] };
    const ctx = createContext(riverOutput);
    const output = new BridgeFeature().generate(ctx, defaultConfig);

    expect(output.bridges.length).toBeGreaterThan(0);
  });

  it('should select bridge size based on river width — medium (5-8)', () => {
    const river = makeRiver(6);
    const riverOutput: RiverOutput = { rivers: [river], normalRivers: [river] };
    const ctx = createContext(riverOutput);
    const output = new BridgeFeature().generate(ctx, defaultConfig);

    for (const bridge of output.bridges) {
      expect(bridge.typeId).toBe(10);
    }
  });

  it('should select bridge size based on river width — large (9-19)', () => {
    const river = makeRiver(12);
    const riverOutput: RiverOutput = { rivers: [river], normalRivers: [river] };
    const ctx = createContext(riverOutput);
    const output = new BridgeFeature().generate(ctx, defaultConfig);

    for (const bridge of output.bridges) {
      expect(bridge.typeId).toBe(11);
    }
  });

  it('should select bridge size based on river width — xlarge (20+)', () => {
    const river = makeRiver(24);
    const riverOutput: RiverOutput = { rivers: [river], normalRivers: [river] };
    const ctx = createContext(riverOutput);
    const output = new BridgeFeature().generate(ctx, defaultConfig);

    for (const bridge of output.bridges) {
      expect(bridge.typeId).toBe(12);
    }
  });

  it('should respect max bridge count per size', () => {
    const config: BridgeConfig = {
      bridgeTypes: { medium: 10, large: 11, xlarge: 12 },
      maxPerSize: { medium: 1, large: 1, xlarge: 1 },
    };
    const river = makeRiver(6);
    const riverOutput: RiverOutput = { rivers: [river], normalRivers: [river] };
    const ctx = createContext(riverOutput);
    const output = new BridgeFeature().generate(ctx, config);

    expect(output.bridges.length).toBeLessThanOrEqual(1);
  });

  it('should skip looped rivers (lakes)', () => {
    const river = makeRiver(8);
    const loopedRiver: GeneratedRiver = { ...river, looped: true };
    const riverOutput: RiverOutput = { rivers: [loopedRiver], normalRivers: [] };
    const ctx = createContext(riverOutput);
    const output = new BridgeFeature().generate(ctx, defaultConfig);

    expect(output.bridges.length).toBe(0);
  });
});
