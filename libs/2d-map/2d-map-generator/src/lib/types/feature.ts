import type { ReadonlyVec2 } from './geometry.js';
import type { ISeededRandom } from './prng-interface.js';
import type { ICollisionProvider } from './collision-provider.js';

export enum FeatureId {
  Biome = 0,
  Shore = 1,
  Grass = 2,
  River = 3,
  Lake = 4,
  Bridge = 5,
  ObjectPlacement = 6,
  GroundPatch = 7,
  Places = 8,
}

export interface IMapFeature<TConfig = unknown, TOutput = unknown> {
  readonly id: FeatureId;
  readonly requires: readonly FeatureId[];
  generate(ctx: GenerationContext, config: TConfig): TOutput;
}

export interface GenerationContext {
  readonly width: number;
  readonly height: number;
  readonly center: ReadonlyVec2;
  readonly random: ISeededRandom;
  readonly collision: ICollisionProvider;

  get<T>(feature: { readonly id: FeatureId }): T;
  hasFeature(featureId: FeatureId): boolean;
}
