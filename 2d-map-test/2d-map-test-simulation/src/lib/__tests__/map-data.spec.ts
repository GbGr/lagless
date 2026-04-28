import { MapData } from '../map-data.js';
import type { IGeneratedMap } from '@lagless/2d-map-generator';
import type { MapObjectRegistry } from '@lagless/2d-map-generator';

describe('MapData', () => {
  const mockMap: IGeneratedMap = {
    width: 800,
    height: 800,
    gridSize: 16,
    get: () => undefined,
  };

  const mockRegistry: MapObjectRegistry = new Map();

  it('should store map and registry as readonly properties', () => {
    const data = new MapData();
    data.map = mockMap;
    data.registry = mockRegistry;

    expect(data.map).toBe(mockMap);
    expect(data.registry).toBe(mockRegistry);
  });

  it('should expose map dimensions', () => {
    const data = new MapData();
    data.map = mockMap;
    data.registry = mockRegistry;

    expect(data.map.width).toBe(800);
    expect(data.map.height).toBe(800);
  });
});
