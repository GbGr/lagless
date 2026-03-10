import { MathOps } from '@lagless/math';
import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { GrassConfig, GrassOutput, ShoreOutput } from '../types/feature-configs.js';
import { ShoreFeature } from './shore-feature.js';
import type { ReadonlyVec2 } from '../types/geometry.js';
import { polygonArea, computePolygonBounds } from '../math/polygon-utils.js';

export class GrassFeature implements IMapFeature<GrassConfig, GrassOutput> {
  static readonly id = FeatureId.Grass;
  readonly id = FeatureId.Grass;
  readonly requires: readonly FeatureId[] = [FeatureId.Shore];

  generate(ctx: GenerationContext, config: GrassConfig): GrassOutput {
    const shore = ctx.get<ShoreOutput>(ShoreFeature);
    const centerX = ctx.center.x;
    const centerY = ctx.center.y;

    const points: ReadonlyVec2[] = shore.polygon.points.map((pos) => {
      const dx = centerX - pos.x;
      const dy = centerY - pos.y;
      const len = MathOps.sqrt(dx * dx + dy * dy);

      if (len === 0) return { x: pos.x, y: pos.y };

      const nx = dx / len;
      const ny = dy / len;
      const variation = (ctx.random.getFloat() * 2 - 1) * config.variation;
      const inset = config.inset + variation;

      return {
        x: pos.x + nx * inset,
        y: pos.y + ny * inset,
      };
    });

    const bounds = computePolygonBounds(points);
    const area = polygonArea(points);

    return {
      polygon: { points, count: points.length },
      bounds,
      area,
    };
  }
}
