import { describe, it, expect, beforeAll } from 'vitest';
import { MathOps } from '@lagless/math';
import { GroundPatchFeature } from '../../lib/features/ground-patch-feature.js';
import { FeatureId } from '../../lib/types/feature.js';
import { ShapeType } from '../../lib/types/geometry.js';
import type { GroundPatchConfig, ObjectPlacementOutput } from '../../lib/types/feature-configs.js';
import type { GenerationContext } from '../../lib/types/feature.js';
import type { MapObjectDef, MapObjectRegistry } from '../../lib/types/object-def.js';
import type { ICollisionProvider } from '../../lib/types/collision-provider.js';
import { TerrainZone } from '../../lib/types/placed-object.js';
import { createMockRandom } from '../helpers/mock-random.js';

function createMockCollision(): ICollisionProvider {
  return {
    addShape: () => { return; },
    testShape: () => false,
    removeShape: () => { return; },
    clear: () => { return; },
  };
}

describe('GroundPatchFeature', () => {
  beforeAll(async () => {
    await MathOps.init();
  });

  it('should have correct id and requires', () => {
    const feature = new GroundPatchFeature();
    expect(feature.id).toBe(FeatureId.GroundPatch);
    expect(feature.requires).toEqual([FeatureId.ObjectPlacement]);
  });

  it('should collect patches from placed objects', () => {
    const buildingDef: MapObjectDef = {
      typeId: 10,
      colliders: [{ shape: { type: ShapeType.Circle, radius: 10 } }],
      visuals: [],
      scaleRange: [1, 1],
      groundPatches: [
        {
          offset: { x: 0, y: 0 },
          halfExtents: { x: 20, y: 15 },
          color: 0x8b4513,
          roughness: 0.5,
          offsetDist: 2,
          order: 0,
          useAsMapShape: false,
        },
      ],
    };
    const registry: MapObjectRegistry = new Map([[10, buildingDef]]);
    const placementOutput: ObjectPlacementOutput = {
      objects: [
        {
          typeId: 10,
          posX: 100,
          posY: 100,
          rotation: 0,
          scale: 1,
          terrainZone: TerrainZone.Grass,
          children: [],
        },
      ],
    };

    const outputs = new Map<FeatureId, unknown>();
    outputs.set(FeatureId.ObjectPlacement, placementOutput);

    const ctx: GenerationContext = {
      width: 200,
      height: 200,
      center: { x: 100, y: 100 },
      random: createMockRandom(42),
      collision: createMockCollision(),
      get: <T>(f: { readonly id: FeatureId }) => outputs.get(f.id) as T,
      hasFeature: (id: FeatureId) => outputs.has(id),
    };

    const config: GroundPatchConfig = { registry, extraPatches: [] };
    const output = new GroundPatchFeature().generate(ctx, config);

    expect(output.patches.length).toBe(1);
    const patch = output.patches[0];
    expect(patch.minX).toBe(80);
    expect(patch.maxX).toBe(120);
    expect(patch.minY).toBe(85);
    expect(patch.maxY).toBe(115);
    expect(patch.color).toBe(0x8b4513);
    expect(patch.roughness).toBe(0.5);
    expect(patch.order).toBe(0);
  });

  it('should compute patch world coordinates with object scale', () => {
    const def: MapObjectDef = {
      typeId: 20,
      colliders: [{ shape: { type: ShapeType.Circle, radius: 5 } }],
      visuals: [],
      scaleRange: [2, 2],
      groundPatches: [
        {
          offset: { x: 10, y: 5 },
          halfExtents: { x: 10, y: 10 },
          color: 0x00ff00,
          roughness: 0,
          offsetDist: 0,
          order: 1,
          useAsMapShape: true,
        },
      ],
    };
    const registry: MapObjectRegistry = new Map([[20, def]]);
    const placementOutput: ObjectPlacementOutput = {
      objects: [
        {
          typeId: 20,
          posX: 50,
          posY: 50,
          rotation: 0,
          scale: 2,
          terrainZone: TerrainZone.Grass,
          children: [],
        },
      ],
    };

    const outputs = new Map<FeatureId, unknown>();
    outputs.set(FeatureId.ObjectPlacement, placementOutput);

    const ctx: GenerationContext = {
      width: 200,
      height: 200,
      center: { x: 100, y: 100 },
      random: createMockRandom(42),
      collision: createMockCollision(),
      get: <T>(f: { readonly id: FeatureId }) => outputs.get(f.id) as T,
      hasFeature: (id: FeatureId) => outputs.has(id),
    };

    const output = new GroundPatchFeature().generate(ctx, { registry, extraPatches: [] });
    const patch = output.patches[0];
    expect(patch.minX).toBe(50);
    expect(patch.maxX).toBe(90);
    expect(patch.minY).toBe(40);
    expect(patch.maxY).toBe(80);
    expect(patch.useAsMapShape).toBe(true);
  });

  it('should add extra patches from config', () => {
    const placementOutput: ObjectPlacementOutput = { objects: [] };
    const outputs = new Map<FeatureId, unknown>();
    outputs.set(FeatureId.ObjectPlacement, placementOutput);

    const ctx: GenerationContext = {
      width: 200,
      height: 200,
      center: { x: 100, y: 100 },
      random: createMockRandom(42),
      collision: createMockCollision(),
      get: <T>(f: { readonly id: FeatureId }) => outputs.get(f.id) as T,
      hasFeature: (id: FeatureId) => outputs.has(id),
    };

    const config: GroundPatchConfig = {
      extraPatches: [
        {
          offset: { x: 0, y: 0 },
          halfExtents: { x: 50, y: 50 },
          color: 0xff0000,
          roughness: 1,
          offsetDist: 0,
          order: 0,
          useAsMapShape: false,
        },
      ],
    };

    const output = new GroundPatchFeature().generate(ctx, config);
    expect(output.patches.length).toBe(1);
    expect(output.patches[0].color).toBe(0xff0000);
  });
});
