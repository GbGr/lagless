import { Container } from 'pixi.js';
import type { IGeneratedMap, BiomeOutput, ShoreOutput, GrassOutput, RiverOutput, LakeOutput, GroundPatchOutput } from '@lagless/2d-map-generator';
import { BiomeFeature, ShoreFeature, GrassFeature, RiverFeature, LakeFeature, GroundPatchFeature } from '@lagless/2d-map-generator';
import { createBackgroundLayer } from '../layers/background-layer.js';
import { createBeachLayer } from '../layers/beach-layer.js';
import { createGrassLayer } from '../layers/grass-layer.js';
import { createOceanLayer } from '../layers/ocean-layer.js';
import { createGridLayer } from '../layers/grid-layer.js';
import { createRiverShoreLayer } from '../layers/river-shore-layer.js';
import { createRiverWaterLayer } from '../layers/river-water-layer.js';
import { createGroundPatchLayer } from '../layers/ground-patch-layer.js';

export interface MapTerrainRendererOptions {
  canvasMode?: boolean;
}

export class MapTerrainRenderer {
  private _container: Container | null = null;

  buildTerrain(map: IGeneratedMap, options?: MapTerrainRendererOptions): Container {
    const container = new Container();
    const width = map.width;
    const height = map.height;

    const biome = map.get<BiomeOutput>(BiomeFeature);
    const shore = map.get<ShoreOutput>(ShoreFeature);
    const grass = map.get<GrassOutput>(GrassFeature);
    const riverOutput = map.get<RiverOutput>(RiverFeature);
    const lakeOutput = map.get<LakeOutput>(LakeFeature);
    const patchOutput = map.get<GroundPatchOutput>(GroundPatchFeature);

    const bgColor = biome?.grass ?? 0x80af49;
    container.addChild(createBackgroundLayer(width, height, bgColor));

    if (shore && grass && biome) {
      container.addChild(createBeachLayer(shore, grass, biome.beach));

      if (options?.canvasMode) {
        container.addChild(createGrassLayer(grass, biome.grass));
      }
    }

    // Patches order=0 (under grid)
    if (patchOutput) {
      const order0 = patchOutput.patches.filter(p => p.order === 0);
      if (order0.length > 0) container.addChild(createGroundPatchLayer(order0));
    }

    // Rivers
    const allRivers = [
      ...(riverOutput?.rivers ?? []),
      ...(lakeOutput?.lakes ?? []),
    ];
    if (allRivers.length > 0 && biome) {
      container.addChild(createRiverShoreLayer(allRivers, biome.riverbank));
      container.addChild(createRiverWaterLayer(allRivers, biome.water));
    }

    // Ocean
    if (shore && biome) {
      container.addChild(createOceanLayer(width, height, shore, biome.water));
    }

    // Grid
    container.addChild(createGridLayer(width, height, map.gridSize));

    // Patches order=1 (over grid)
    if (patchOutput) {
      const order1 = patchOutput.patches.filter(p => p.order === 1);
      if (order1.length > 0) container.addChild(createGroundPatchLayer(order1));
    }

    this._container = container;
    return container;
  }

  updateCamera(screenOriginX: number, screenOriginY: number, scaleX: number, scaleY: number): void {
    if (!this._container) return;
    this._container.position.set(screenOriginX, screenOriginY);
    this._container.scale.set(scaleX, scaleY);
  }

  destroy(): void {
    if (this._container) {
      this._container.destroy({ children: true });
      this._container = null;
    }
  }
}
