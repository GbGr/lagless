import { extractCanopyZones } from '../../lib/utils/extract-canopy-zones.js';
import type { CanopyZoneCircle } from '../../lib/utils/extract-canopy-zones.js';
import type { PlacedObject } from '../../lib/types/placed-object.js';
import { TerrainZone } from '../../lib/types/placed-object.js';
import type { MapObjectRegistry } from '../../lib/types/object-def.js';
import { ShapeType } from '../../lib/types/geometry.js';
import { CANOPY_SENSOR_TAG } from '../../lib/physics/canopy-sensor-tag.js';

function makeObj(typeId: number, posX: number, posY: number, scale = 1): PlacedObject {
  return { typeId, posX, posY, rotation: 0, scale, terrainZone: TerrainZone.Grass, children: [] };
}

const TREE_REGISTRY: MapObjectRegistry = new Map([
  [0, {
    typeId: 0,
    colliders: [
      { shape: { type: ShapeType.Circle, radius: 30 } },
      { shape: { type: ShapeType.Circle, radius: 128 }, isSensor: true, tag: CANOPY_SENSOR_TAG },
    ],
    visuals: [],
    scaleRange: [1, 1] as [number, number],
  }],
]);

describe('extractCanopyZones', () => {
  it('should extract zones with pre-squared radii', () => {
    const objects = [makeObj(0, 100, 200, 0.5)];
    const zones = extractCanopyZones(objects, TREE_REGISTRY);

    expect(zones).toHaveLength(1);
    expect(zones[0].x).toBe(100);
    expect(zones[0].y).toBe(200);
    expect((zones[0] as CanopyZoneCircle).radiusSq).toBe((128 * 0.5) * (128 * 0.5)); // radius * scale, then squared
  });

  it('should return empty array for empty input', () => {
    expect(extractCanopyZones([], TREE_REGISTRY)).toEqual([]);
  });

  it('should skip objects without canopy sensor colliders', () => {
    const noCanopyRegistry: MapObjectRegistry = new Map([
      [1, {
        typeId: 1,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 30 } }],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const objects = [makeObj(1, 10, 20)];
    const zones = extractCanopyZones(objects, noCanopyRegistry);

    expect(zones).toEqual([]);
  });

  it('should apply scale to radius', () => {
    const objects = [makeObj(0, 0, 0, 2)];
    const zones = extractCanopyZones(objects, TREE_REGISTRY);

    expect((zones[0] as CanopyZoneCircle).radiusSq).toBe((128 * 2) * (128 * 2));
  });

  it('should use CANOPY_SENSOR_TAG as default tag', () => {
    const customTagRegistry: MapObjectRegistry = new Map([
      [2, {
        typeId: 2,
        colliders: [
          { shape: { type: ShapeType.Circle, radius: 50 }, isSensor: true, tag: 99 },
        ],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const objects = [makeObj(2, 10, 20)];

    // Default tag (CANOPY_SENSOR_TAG=1) should not match tag 99
    expect(extractCanopyZones(objects, customTagRegistry)).toEqual([]);
    // Custom tag should match
    expect(extractCanopyZones(objects, customTagRegistry, 99)).toHaveLength(1);
  });

  it('should produce objectIndex matching sorted order', () => {
    // Objects out of order — sorted by posY then posX
    const objects = [
      makeObj(0, 50, 300),  // will be index 2 after sort
      makeObj(0, 10, 100),  // will be index 0 after sort
      makeObj(0, 20, 200),  // will be index 1 after sort
    ];
    const zones = extractCanopyZones(objects, TREE_REGISTRY);

    expect(zones).toHaveLength(3);
    expect(zones[0]).toMatchObject({ y: 100, objectIndex: 0 });
    expect(zones[1]).toMatchObject({ y: 200, objectIndex: 1 });
    expect(zones[2]).toMatchObject({ y: 300, objectIndex: 2 });
  });

  it('should skip objects not in registry', () => {
    const objects = [makeObj(99, 10, 20)];
    const zones = extractCanopyZones(objects, TREE_REGISTRY);

    expect(zones).toEqual([]);
  });
});
