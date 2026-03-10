import { MathOps } from '@lagless/math';
import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { LakeConfig, LakeOutput } from '../types/feature-configs.js';
import type { ReadonlyVec2 } from '../types/geometry.js';
import type { GeneratedRiver } from '../types/generated-river.js';
import { generateRiverPolygon } from '../math/river-polygon.js';

const TWO_PI = Math.PI * 2;

export class LakeFeature implements IMapFeature<LakeConfig, LakeOutput> {
  static readonly id = FeatureId.Lake;
  readonly id = FeatureId.Lake;
  readonly requires: readonly FeatureId[] = [];

  generate(ctx: GenerationContext, config: LakeConfig): LakeOutput {
    const lakes: GeneratedRiver[] = [];

    for (const lakeDef of config.lakes) {
      if (ctx.random.getFloat() >= lakeDef.odds) {
        continue;
      }

      const boundCenterX = lakeDef.spawnBound.pos.x * ctx.width;
      const boundCenterY = lakeDef.spawnBound.pos.y * ctx.height;
      const boundRad = lakeDef.spawnBound.rad;
      const angle = ctx.random.getFloat() * TWO_PI;
      const dist = ctx.random.getFloat() * boundRad;
      const centerX = boundCenterX + MathOps.cos(angle) * dist;
      const centerY = boundCenterY + MathOps.sin(angle) * dist;

      const numPoints = 20;
      const smoothPasses = 3;

      // Generate raw radii with random variation
      const rawRadii: number[] = [];
      for (let i = 0; i < numPoints; i++) {
        rawRadii.push(lakeDef.innerRad + ctx.random.getFloat() * (lakeDef.outerRad - lakeDef.innerRad));
      }

      // Smooth radii with circular moving average to eliminate star-shaped spikes
      let radii = rawRadii;
      for (let pass = 0; pass < smoothPasses; pass++) {
        const smoothed: number[] = [];
        for (let i = 0; i < numPoints; i++) {
          const prev = radii[(i - 1 + numPoints) % numPoints];
          const curr = radii[i];
          const next = radii[(i + 1) % numPoints];
          smoothed.push(prev * 0.25 + curr * 0.5 + next * 0.25);
        }
        radii = smoothed;
      }

      const splinePoints: ReadonlyVec2[] = [];
      for (let i = 0; i < numPoints; i++) {
        const theta = (i / numPoints) * TWO_PI;
        splinePoints.push({
          x: centerX + MathOps.cos(theta) * radii[i],
          y: centerY + MathOps.sin(theta) * radii[i],
        });
      }

      splinePoints.push({ x: splinePoints[0].x, y: splinePoints[0].y });

      // Control points already define the lake boundary — waterWidth is a small outward expansion
      const waterWidth = 2;
      const shoreWidth = Math.max(4, Math.min(8, (lakeDef.innerRad + lakeDef.outerRad) * 0.1));

      const lake = generateRiverPolygon({
        splinePoints,
        waterWidth,
        shoreWidth,
        looped: true,
        mapWidth: ctx.width,
        mapHeight: ctx.height,
      });

      lakes.push(lake);
    }

    return { lakes };
  }
}
