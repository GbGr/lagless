import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { PlacesConfig, PlacesOutput } from '../types/feature-configs.js';

export class PlacesFeature implements IMapFeature<PlacesConfig, PlacesOutput> {
  static readonly id = FeatureId.Places;
  readonly id = FeatureId.Places;
  readonly requires: readonly FeatureId[] = [];

  generate(ctx: GenerationContext, config: PlacesConfig): PlacesOutput {
    const places = config.places.map(p => ({
      name: p.name,
      x: p.pos.x * ctx.width,
      y: p.pos.y * ctx.height,
    }));

    return { places };
  }
}
