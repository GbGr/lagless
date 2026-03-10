import { sortPlacedObjects } from '../../lib/utils/sort-placed-objects.js';
import type { PlacedObject } from '../../lib/types/placed-object.js';
import { TerrainZone } from '../../lib/types/placed-object.js';

function makeObj(posX: number, posY: number): PlacedObject {
  return { typeId: 0, posX, posY, rotation: 0, scale: 1, terrainZone: TerrainZone.Grass, children: [] };
}

describe('sortPlacedObjects', () => {
  it('should sort by posY ascending', () => {
    const objects = [makeObj(0, 30), makeObj(0, 10), makeObj(0, 20)];
    const sorted = sortPlacedObjects(objects);

    expect(sorted.map(o => o.posY)).toEqual([10, 20, 30]);
  });

  it('should use posX as tiebreaker when posY is equal', () => {
    const objects = [makeObj(50, 10), makeObj(20, 10), makeObj(30, 10)];
    const sorted = sortPlacedObjects(objects);

    expect(sorted.map(o => o.posX)).toEqual([20, 30, 50]);
  });

  it('should not mutate the original array', () => {
    const objects = [makeObj(0, 30), makeObj(0, 10)];
    const sorted = sortPlacedObjects(objects);

    expect(sorted).not.toBe(objects);
    expect(objects[0].posY).toBe(30); // original unchanged
  });

  it('should return empty array for empty input', () => {
    const sorted = sortPlacedObjects([]);
    expect(sorted).toEqual([]);
  });
});
