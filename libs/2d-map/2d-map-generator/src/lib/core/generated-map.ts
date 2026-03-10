import type { IGeneratedMap } from '../types/generated-map.js';
import { FeatureId } from '../types/feature.js';

export class GeneratedMap implements IGeneratedMap {
  private readonly _features = new Map<FeatureId, unknown>();

  constructor(
    readonly width: number,
    readonly height: number,
    readonly gridSize: number,
  ) {}

  setFeatureOutput(featureId: FeatureId, output: unknown): void {
    this._features.set(featureId, output);
  }

  get<T>(feature: { readonly id: FeatureId }): T | undefined {
    return this._features.get(feature.id) as T | undefined;
  }
}
