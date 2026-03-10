import type { PlacedObject } from '../types/placed-object.js';
import type { MapObjectRegistry } from '../types/object-def.js';
import { ShapeType } from '../types/geometry.js';
import { CANOPY_SENSOR_TAG } from '../physics/canopy-sensor-tag.js';
import { sortPlacedObjects } from './sort-placed-objects.js';

export interface CanopyZoneCircle {
  type: ShapeType.Circle;
  x: number;
  y: number;
  radiusSq: number;
  objectIndex: number;
}

export interface CanopyZoneCuboid {
  type: ShapeType.Cuboid;
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  objectIndex: number;
}

export type CanopyZone = CanopyZoneCircle | CanopyZoneCuboid;

export function extractCanopyZones(
  objects: readonly PlacedObject[],
  registry: MapObjectRegistry,
  tag: number = CANOPY_SENSOR_TAG,
): CanopyZone[] {
  const sorted = sortPlacedObjects(objects);
  const zones: CanopyZone[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const obj = sorted[i];
    const def = registry.get(obj.typeId);
    if (!def) continue;

    const sensor = def.colliders.find(c => c.tag === tag && c.isSensor);
    if (!sensor) continue;

    if (sensor.shape.type === ShapeType.Circle) {
      const r = sensor.shape.radius * obj.scale;
      zones.push({ type: ShapeType.Circle, x: obj.posX, y: obj.posY, radiusSq: r * r, objectIndex: i });
    } else {
      const hw = sensor.shape.halfWidth * obj.scale;
      const hh = sensor.shape.halfHeight * obj.scale;
      zones.push({ type: ShapeType.Cuboid, x: obj.posX, y: obj.posY, halfW: hw, halfH: hh, objectIndex: i });
    }
  }

  return zones;
}

export function isInsideCanopyZone(zone: CanopyZone, px: number, py: number): boolean {
  const dx = px - zone.x;
  const dy = py - zone.y;
  if (zone.type === ShapeType.Circle) {
    return dx * dx + dy * dy < zone.radiusSq;
  }
  return Math.abs(dx) < zone.halfW && Math.abs(dy) < zone.halfH;
}
