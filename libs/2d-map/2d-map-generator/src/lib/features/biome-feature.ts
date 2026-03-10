import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { BiomeConfig, BiomeOutput } from '../types/feature-configs.js';

export class BiomeFeature implements IMapFeature<BiomeConfig, BiomeOutput> {
  static readonly id = FeatureId.Biome;
  readonly id = FeatureId.Biome;
  readonly requires: readonly FeatureId[] = [];

  generate(_ctx: GenerationContext, config: BiomeConfig): BiomeOutput {
    return config;
  }
}
