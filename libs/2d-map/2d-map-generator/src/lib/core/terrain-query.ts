import { TerrainZone } from '../types/placed-object.js';
import type { ShoreOutput, GrassOutput, RiverOutput, LakeOutput } from '../types/feature-configs.js';
import type { AABB } from '../types/geometry.js';
import type { GeneratedRiver } from '../types/generated-river.js';
import { pointInPolygon } from '../math/polygon-utils.js';

export interface TerrainQueryInputs {
  shore?: ShoreOutput;
  grass?: GrassOutput;
  river?: RiverOutput;
  lake?: LakeOutput;
}

export class TerrainQuery {
  private readonly _shore: ShoreOutput | undefined;
  private readonly _grass: GrassOutput | undefined;
  private readonly _rivers: readonly GeneratedRiver[];
  private readonly _lakes: readonly GeneratedRiver[];

  constructor(inputs: TerrainQueryInputs) {
    this._shore = inputs.shore;
    this._grass = inputs.grass;
    this._rivers = inputs.river?.rivers ?? [];
    this._lakes = inputs.lake?.lakes ?? [];
  }

  classify(x: number, y: number): TerrainZone {
    // Check lakes first (highest priority water feature)
    for (const lake of this._lakes) {
      if (isInsideAabb(x, y, lake.aabb) && pointInPolygon({ x, y }, lake.waterPoly)) {
        return TerrainZone.Lake;
      }
    }

    // Check rivers
    for (const river of this._rivers) {
      if (!isInsideAabb(x, y, river.aabb)) continue;

      if (pointInPolygon({ x, y }, river.waterPoly)) {
        return TerrainZone.River;
      }
      if (pointInPolygon({ x, y }, river.shorePoly)) {
        return TerrainZone.RiverShore;
      }
    }

    // Check grass
    if (this._grass) {
      if (isInsideAabb(x, y, this._grass.bounds) && pointInPolygon({ x, y }, this._grass.polygon)) {
        return TerrainZone.Grass;
      }
    }

    // Check shore (beach = inside shore but outside grass)
    if (this._shore) {
      if (isInsideAabb(x, y, this._shore.bounds) && pointInPolygon({ x, y }, this._shore.polygon)) {
        return TerrainZone.Beach;
      }
    }

    // No shore feature → default to Grass
    if (!this._shore) {
      return TerrainZone.Grass;
    }

    // Outside shore → ocean
    return TerrainZone.WaterEdge;
  }
}

function isInsideAabb(x: number, y: number, aabb: AABB): boolean {
  return x >= aabb.min.x && x <= aabb.max.x && y >= aabb.min.y && y <= aabb.max.y;
}
