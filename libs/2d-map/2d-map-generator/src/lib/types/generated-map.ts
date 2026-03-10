import { FeatureId } from './feature.js';

export interface IGeneratedMap {
  readonly width: number;
  readonly height: number;
  readonly gridSize: number;
  get<T>(feature: { readonly id: FeatureId }): T | undefined;
}
