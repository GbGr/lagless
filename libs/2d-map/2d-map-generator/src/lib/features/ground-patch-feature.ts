import { MathOps } from '@lagless/math';
import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { GroundPatchConfig, GroundPatchOutput, ObjectPlacementOutput } from '../types/feature-configs.js';
import { ObjectPlacementFeature } from './object-placement-feature.js';
import type { GeneratedGroundPatch } from '../types/generated-river.js';

export class GroundPatchFeature implements IMapFeature<GroundPatchConfig, GroundPatchOutput> {
  static readonly id = FeatureId.GroundPatch;
  readonly id = FeatureId.GroundPatch;
  readonly requires: readonly FeatureId[] = [FeatureId.ObjectPlacement];

  generate(ctx: GenerationContext, config: GroundPatchConfig): GroundPatchOutput {
    const placement = ctx.get<ObjectPlacementOutput>(ObjectPlacementFeature);
    const patches: GeneratedGroundPatch[] = [];

    if (config.registry) {
      for (const obj of placement.objects) {
        const def = config.registry.get(obj.typeId);
        if (!def?.groundPatches) continue;

        for (const gpDef of def.groundPatches) {
          const scale = obj.scale;
          const rawOx = gpDef.offset.x * scale;
          const rawOy = gpDef.offset.y * scale;
          const cos = MathOps.cos(obj.rotation);
          const sin = MathOps.sin(obj.rotation);
          const ox = rawOx * cos - rawOy * sin;
          const oy = rawOx * sin + rawOy * cos;
          const hx = gpDef.halfExtents.x * scale;
          const hy = gpDef.halfExtents.y * scale;

          patches.push({
            minX: obj.posX + ox - hx,
            minY: obj.posY + oy - hy,
            maxX: obj.posX + ox + hx,
            maxY: obj.posY + oy + hy,
            color: gpDef.color,
            roughness: gpDef.roughness,
            offsetDist: gpDef.offsetDist,
            order: gpDef.order,
            useAsMapShape: gpDef.useAsMapShape,
          });
        }
      }
    }

    if (config.extraPatches) {
      for (const gpDef of config.extraPatches) {
        patches.push({
          minX: ctx.center.x + gpDef.offset.x - gpDef.halfExtents.x,
          minY: ctx.center.y + gpDef.offset.y - gpDef.halfExtents.y,
          maxX: ctx.center.x + gpDef.offset.x + gpDef.halfExtents.x,
          maxY: ctx.center.y + gpDef.offset.y + gpDef.halfExtents.y,
          color: gpDef.color,
          roughness: gpDef.roughness,
          offsetDist: gpDef.offsetDist,
          order: gpDef.order,
          useAsMapShape: gpDef.useAsMapShape,
        });
      }
    }

    return { patches };
  }
}
