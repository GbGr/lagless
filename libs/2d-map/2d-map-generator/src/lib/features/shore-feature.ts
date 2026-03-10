import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { ShoreConfig, ShoreOutput } from '../types/feature-configs.js';
import type { AABB } from '../types/geometry.js';
import { generateJaggedAabbPoints } from '../math/jagged-aabb.js';
import { computePolygonBounds } from '../math/polygon-utils.js';

export class ShoreFeature implements IMapFeature<ShoreConfig, ShoreOutput> {
  static readonly id = FeatureId.Shore;
  readonly id = FeatureId.Shore;
  readonly requires: readonly FeatureId[] = [];

  generate(ctx: GenerationContext, config: ShoreConfig): ShoreOutput {
    const shoreAabb: AABB = {
      min: { x: config.inset, y: config.inset },
      max: { x: ctx.width - config.inset, y: ctx.height - config.inset },
    };

    const points = generateJaggedAabbPoints(
      shoreAabb,
      config.divisions,
      config.divisions,
      config.variation,
      ctx.random,
    );

    const bounds = computePolygonBounds(points);

    return {
      polygon: { points, count: points.length },
      bounds,
    };
  }
}
