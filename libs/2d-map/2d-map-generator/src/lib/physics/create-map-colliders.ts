import type { PlacedObject } from '../types/placed-object.js';
import type { MapObjectRegistry } from '../types/object-def.js';
import { ShapeType } from '../types/geometry.js';

export interface MapPhysicsProvider {
  createFixedBody(x: number, y: number, rotation: number): unknown;
  createCircleCollider(body: unknown, radius: number, offsetX: number, offsetY: number, isSensor: boolean, tag?: number, collisionGroup?: number): void;
  createCuboidCollider(body: unknown, halfW: number, halfH: number, offsetX: number, offsetY: number, isSensor: boolean, tag?: number, collisionGroup?: number): void;
}

export interface CreateMapCollidersOptions {
  skipTags?: readonly number[];
}

export function createMapColliders(
  physics: MapPhysicsProvider,
  objects: readonly PlacedObject[],
  registry: MapObjectRegistry,
  options?: CreateMapCollidersOptions,
): void {
  for (const obj of objects) {
    placeObject(physics, obj, registry, options);
  }
}

function placeObject(
  physics: MapPhysicsProvider,
  obj: PlacedObject,
  registry: MapObjectRegistry,
  options?: CreateMapCollidersOptions,
): void {
  const def = registry.get(obj.typeId);
  if (!def) return;

  const body = physics.createFixedBody(obj.posX, obj.posY, obj.rotation);

  const skipTags = options?.skipTags;

  for (const collider of def.colliders) {
    if (skipTags && collider.tag !== undefined && skipTags.includes(collider.tag)) continue;

    const ox = (collider.offsetX ?? 0) * obj.scale;
    const oy = (collider.offsetY ?? 0) * obj.scale;
    const isSensor = collider.isSensor ?? false;

    if (collider.shape.type === ShapeType.Circle) {
      physics.createCircleCollider(body, collider.shape.radius * obj.scale, ox, oy, isSensor, collider.tag, collider.collisionGroup);
    } else {
      physics.createCuboidCollider(body, collider.shape.halfWidth * obj.scale, collider.shape.halfHeight * obj.scale, ox, oy, isSensor, collider.tag, collider.collisionGroup);
    }
  }

  for (const child of obj.children) {
    placeObject(physics, child, registry, options);
  }
}
