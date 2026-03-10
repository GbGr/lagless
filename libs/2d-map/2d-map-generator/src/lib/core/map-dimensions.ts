import type { MapGeneratorConfig } from '../types/map-generator-config.js';

export interface MapDimensions {
  readonly width: number;
  readonly height: number;
  readonly gridSize: number;
}

export function computeDimensions(config: MapGeneratorConfig): MapDimensions {
  return {
    width: config.baseWidth * config.scale + config.extension,
    height: config.baseHeight * config.scale + config.extension,
    gridSize: config.gridSize ?? 16,
  };
}
