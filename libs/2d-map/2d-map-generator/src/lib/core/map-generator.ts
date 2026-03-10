import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { ISeededRandom } from '../types/prng-interface.js';
import type { ICollisionProvider } from '../types/collision-provider.js';
import type { MapGeneratorConfig } from '../types/map-generator-config.js';
import type { ReadonlyVec2 } from '../types/geometry.js';
import { GeneratedMap } from './generated-map.js';
import { computeDimensions } from './map-dimensions.js';

interface FeatureEntry {
  feature: IMapFeature;
  config: unknown;
}

class GenerationContextImpl implements GenerationContext {
  readonly width: number;
  readonly height: number;
  readonly center: ReadonlyVec2;
  readonly random: ISeededRandom;
  readonly collision: ICollisionProvider;

  private readonly _outputs = new Map<FeatureId, unknown>();

  constructor(
    width: number,
    height: number,
    random: ISeededRandom,
    collision: ICollisionProvider,
  ) {
    this.width = width;
    this.height = height;
    this.center = { x: width / 2, y: height / 2 };
    this.random = random;
    this.collision = collision;
  }

  get<T>(feature: { readonly id: FeatureId }): T {
    if (!this._outputs.has(feature.id)) {
      throw new Error(`Feature output "${FeatureId[feature.id]}" is not available. It may not have been run yet.`);
    }
    return this._outputs.get(feature.id) as T;
  }

  hasFeature(featureId: FeatureId): boolean {
    return this._outputs.has(featureId);
  }

  setOutput(featureId: FeatureId, output: unknown): void {
    this._outputs.set(featureId, output);
  }
}

export class MapGenerator {
  private readonly _config: MapGeneratorConfig;
  private readonly _entries: FeatureEntry[] = [];

  constructor(config: MapGeneratorConfig) {
    this._config = config;
  }

  addFeature<TConfig, TOutput>(
    feature: IMapFeature<TConfig, TOutput>,
    config: TConfig,
  ): this {
    this._entries.push({ feature, config });
    return this;
  }

  generate(random: ISeededRandom, collision?: ICollisionProvider): GeneratedMap {
    const featureMap = new Map<FeatureId, FeatureEntry>();
    for (const entry of this._entries) {
      featureMap.set(entry.feature.id, entry);
    }

    // Validate dependencies
    for (const entry of this._entries) {
      for (const req of entry.feature.requires) {
        if (!featureMap.has(req)) {
          throw new Error(
            `Feature "${FeatureId[entry.feature.id]}" requires "${FeatureId[req]}" which was not included.`,
          );
        }
      }
    }

    // Topological sort (Kahn's algorithm)
    const sorted = this._topologicalSort(featureMap);

    // Compute dimensions
    const dims = computeDimensions(this._config);

    // Create collision provider (placeholder noop if none provided)
    const coll = collision ?? createNoopCollision();

    // Create context and run features
    const ctx = new GenerationContextImpl(dims.width, dims.height, random, coll);
    const result = new GeneratedMap(dims.width, dims.height, dims.gridSize);

    for (const entry of sorted) {
      const output = entry.feature.generate(ctx, entry.config);
      ctx.setOutput(entry.feature.id, output);
      result.setFeatureOutput(entry.feature.id, output);
    }

    return result;
  }

  private _topologicalSort(featureMap: Map<FeatureId, FeatureEntry>): FeatureEntry[] {
    const inDegree = new Map<FeatureId, number>();
    const adjacency = new Map<FeatureId, FeatureId[]>();

    for (const [id] of featureMap) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }

    for (const [id, entry] of featureMap) {
      for (const req of entry.feature.requires) {
        const adj = adjacency.get(req);
        const deg = inDegree.get(id);
        if (adj && deg !== undefined) {
          adj.push(id);
          inDegree.set(id, deg + 1);
        }
      }
    }

    const queue: FeatureId[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sorted: FeatureEntry[] = [];
    while (queue.length > 0) {
      const id = queue.shift() as FeatureId;
      const entry = featureMap.get(id);
      if (entry) {
        sorted.push(entry);
      }

      const neighbors = adjacency.get(id);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) {
            queue.push(neighbor);
          }
        }
      }
    }

    if (sorted.length !== featureMap.size) {
      throw new Error('Circular dependency detected among features.');
    }

    return sorted;
  }
}

function createNoopCollision(): ICollisionProvider {
  return {
    addShape() { return; },
    testShape() { return false; },
    removeShape() { return; },
    clear() { return; },
  };
}
