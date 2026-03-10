import type { MapObjectDef, MapObjectRegistry } from '@lagless/2d-map-generator';
import { RenderLayer, ShapeType, CANOPY_SENSOR_TAG } from '@lagless/2d-map-generator';

export enum StandardObjectType { Tree = 0, Garage = 1 }

const TREE_DEF: MapObjectDef = {
  typeId: StandardObjectType.Tree,
  includeSensorsInBounds: true,
  colliders: [
    { shape: { type: ShapeType.Circle, radius: 30 } },
    { shape: { type: ShapeType.Circle, radius: 128 }, isSensor: true, tag: CANOPY_SENSOR_TAG },
  ],
  visuals: [
    { texture: 'tree-thunk', layer: RenderLayer.Ground },
    { texture: 'tree-failage', layer: RenderLayer.Canopy },
  ],
  scaleRange: [0.1, 0.2],
  mapDisplay: {
    shapes: [
      { collider: { type: ShapeType.Circle, radius: 30 }, color: 0x2d5a1e, scale: 1 },
    ],
  },
};

// Garage: 60×40 box with 4 outer walls, 1 inner partition, roof with canopy transparency
const GARAGE_DEF: MapObjectDef = {
  typeId: StandardObjectType.Garage,
  colliders: [
    // 4 outer walls (thin cuboids)
    { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 1 }, offsetY: -19 }, // top
    // bottom wall removed — garage entrance
    { shape: { type: ShapeType.Cuboid, halfWidth: 1, halfHeight: 20 }, offsetX: -29 }, // left
    { shape: { type: ShapeType.Cuboid, halfWidth: 1, halfHeight: 20 }, offsetX: 29 }, // right
    // Inner partition (partial height, centered)
    { shape: { type: ShapeType.Cuboid, halfWidth: 1, halfHeight: 8 }, offsetX: 0, offsetY: 2 },
    // Canopy sensor for roof transparency
    { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 20 }, isSensor: true, tag: CANOPY_SENSOR_TAG },
  ],
  visuals: [
    { texture: 'garage-floor', layer: RenderLayer.Ground },
    { texture: 'garage-roof', layer: RenderLayer.Canopy },
  ],
  scaleRange: [0.5, 1],
};

export const STANDARD_OBJECT_REGISTRY: MapObjectRegistry = new Map<number, MapObjectDef>([
  [StandardObjectType.Garage, GARAGE_DEF],
  [StandardObjectType.Tree, TREE_DEF],
]);
