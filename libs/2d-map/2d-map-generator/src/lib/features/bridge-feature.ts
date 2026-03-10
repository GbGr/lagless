import { MathOps } from '@lagless/math';
import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { BridgeConfig, BridgeOutput, RiverOutput } from '../types/feature-configs.js';
import { RiverFeature } from './river-feature.js';
import type { PlacedObject } from '../types/placed-object.js';
import { TerrainZone } from '../types/placed-object.js';
import type { GeneratedRiver } from '../types/generated-river.js';
import { Spline } from '../math/spline.js';

export class BridgeFeature implements IMapFeature<BridgeConfig, BridgeOutput> {
  static readonly id = FeatureId.Bridge;
  readonly id = FeatureId.Bridge;
  readonly requires: readonly FeatureId[] = [FeatureId.River];

  generate(ctx: GenerationContext, config: BridgeConfig): BridgeOutput {
    const riverOutput = ctx.get<RiverOutput>(RiverFeature);
    const bridges: PlacedObject[] = [];

    const counts = { medium: 0, large: 0, xlarge: 0 };

    for (const river of riverOutput.normalRivers) {
      if (river.looped) continue;

      const size = getBridgeSize(river.waterWidth);
      if (counts[size] >= config.maxPerSize[size]) continue;

      const bridgeTypeId = config.bridgeTypes[size];
      const placed = placeBridge(ctx, river, bridgeTypeId);
      if (placed) {
        bridges.push(placed);
        counts[size]++;
      }
    }

    return { bridges };
  }
}

function getBridgeSize(waterWidth: number): 'medium' | 'large' | 'xlarge' {
  if (waterWidth >= 20) return 'xlarge';
  if (waterWidth >= 9) return 'large';
  return 'medium';
}

function placeBridge(
  ctx: GenerationContext,
  river: GeneratedRiver,
  bridgeTypeId: number,
): PlacedObject | null {
  const spline = new Spline(river.splinePoints, false);

  const t = 0.3 + ctx.random.getFloat() * 0.4;
  const pos = spline.getPos(t);
  const tangent = spline.getTangent(t);
  const tangentLen = MathOps.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);

  if (tangentLen === 0) return null;

  const rotation = MathOps.atan2(tangent.y, tangent.x);

  return {
    typeId: bridgeTypeId,
    posX: pos.x,
    posY: pos.y,
    rotation,
    scale: 1,
    terrainZone: TerrainZone.Bridge,
    children: [],
  };
}
