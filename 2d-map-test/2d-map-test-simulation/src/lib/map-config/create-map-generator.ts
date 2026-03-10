import {
  MapGenerator,
  BiomeFeature,
  ShoreFeature,
  GrassFeature,
  RiverFeature,
  LakeFeature,
  ObjectPlacementFeature,
  PlacementKind,
  TerrainZone,
  STANDARD_BIOME,
} from '@lagless/2d-map-generator';
import { StandardObjectType, STANDARD_OBJECT_REGISTRY } from './objects.js';

export interface StandardGeneratorOptions {
  scale?: 'small' | 'large';
}

export function createStandardGenerator(options?: StandardGeneratorOptions): MapGenerator {
  const scaleFactor = options?.scale === 'large' ? 1.5 : 1.0;

  const generator = new MapGenerator({
    baseWidth: 720,
    baseHeight: 720,
    scale: scaleFactor,
    extension: 80,
    gridSize: 16,
  });

  generator
    .addFeature(new BiomeFeature(), STANDARD_BIOME)
    .addFeature(new ShoreFeature(), {
      inset: 48,
      divisions: 12,
      variation: 4,
    })
    .addFeature(new GrassFeature(), {
      inset: 18,
      variation: 3,
    })
    .addFeature(new RiverFeature(), {
      weights: [
        { weight: 0.10, widths: [4] },
        { weight: 0.25, widths: [8, 4] },
        { weight: 0.20, widths: [16, 8, 4] },
        { weight: 0.15, widths: [8, 6, 4] },
        { weight: 0.15, widths: [8, 4] },
        { weight: 0.15, widths: [4] },
      ],
      subdivisionPasses: 5,
      masks: [],
    })
    .addFeature(new LakeFeature(), {
      lakes: [
        {
          odds: 1.0,
          innerRad: 30,
          outerRad: 200 ,
          spawnBound: { pos: { x: 0.5, y: 0.5 }, rad: 300 },
        },
      ],
    })
    .addFeature(new ObjectPlacementFeature(), {
      registry: STANDARD_OBJECT_REGISTRY,
      stages: [
        { kind: PlacementKind.Density, typeId: StandardObjectType.Tree, density: 100, terrainZone: TerrainZone.Grass },
        { kind: PlacementKind.Fixed, typeId: StandardObjectType.Garage, count: 3, terrainZone: TerrainZone.Grass },
      ],
    });

  return generator;
}
