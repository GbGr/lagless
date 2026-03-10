import { createMapColliders } from '../../lib/physics/create-map-colliders.js';
import type { MapPhysicsProvider } from '../../lib/physics/create-map-colliders.js';
import type { PlacedObject } from '../../lib/types/placed-object.js';
import { TerrainZone } from '../../lib/types/placed-object.js';
import type { MapObjectRegistry } from '../../lib/types/object-def.js';
import { ShapeType } from '../../lib/types/geometry.js';

function createMockPhysics() {
  const calls: { method: string; args: unknown[] }[] = [];
  const physics: MapPhysicsProvider = {
    createFixedBody(x, y, rotation) {
      const body = { id: calls.length };
      calls.push({ method: 'createFixedBody', args: [x, y, rotation] });
      return body;
    },
    createCircleCollider(body, radius, ox, oy, isSensor, tag, collisionGroup) {
      calls.push({ method: 'createCircleCollider', args: [body, radius, ox, oy, isSensor, tag, collisionGroup] });
    },
    createCuboidCollider(body, hw, hh, ox, oy, isSensor, tag, collisionGroup) {
      calls.push({ method: 'createCuboidCollider', args: [body, hw, hh, ox, oy, isSensor, tag, collisionGroup] });
    },
  };
  return { physics, calls };
}

function makeObj(typeId: number, posX: number, posY: number, scale = 1, rotation = 0, children: PlacedObject[] = []): PlacedObject {
  return { typeId, posX, posY, rotation, scale, terrainZone: TerrainZone.Grass, children };
}

describe('createMapColliders', () => {
  it('should create a fixed body and circle collider for each object', () => {
    const registry: MapObjectRegistry = new Map([
      [0, {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 5 } }],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const objects: PlacedObject[] = [makeObj(0, 10, 20)];
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, objects, registry);

    expect(calls[0]).toEqual({ method: 'createFixedBody', args: [10, 20, 0] });
    expect(calls[1]).toEqual({
      method: 'createCircleCollider',
      args: [{ id: 0 }, 5, 0, 0, false, undefined, undefined],
    });
  });

  it('should scale collider radius by object scale', () => {
    const registry: MapObjectRegistry = new Map([
      [0, {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 4 } }],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const objects: PlacedObject[] = [makeObj(0, 0, 0, 2)];
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, objects, registry);

    expect(calls[1].args[1]).toBe(8); // radius * scale
  });

  it('should handle cuboid colliders', () => {
    const registry: MapObjectRegistry = new Map([
      [1, {
        typeId: 1,
        colliders: [{ shape: { type: ShapeType.Cuboid, halfWidth: 3, halfHeight: 4 } }],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const objects: PlacedObject[] = [makeObj(1, 5, 5)];
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, objects, registry);

    expect(calls[1].method).toBe('createCuboidCollider');
    expect(calls[1].args[1]).toBe(3); // halfWidth
    expect(calls[1].args[2]).toBe(4); // halfHeight
  });

  it('should pass tag and collisionGroup', () => {
    const registry: MapObjectRegistry = new Map([
      [0, {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 2 }, tag: 5, collisionGroup: 0xFF00 }],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const objects: PlacedObject[] = [makeObj(0, 0, 0)];
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, objects, registry);

    expect(calls[1].args[5]).toBe(5);      // tag
    expect(calls[1].args[6]).toBe(0xFF00); // collisionGroup
  });

  it('should handle sensor colliders', () => {
    const registry: MapObjectRegistry = new Map([
      [0, {
        typeId: 0,
        colliders: [
          { shape: { type: ShapeType.Circle, radius: 3 } },
          { shape: { type: ShapeType.Circle, radius: 10 }, isSensor: true },
        ],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const objects: PlacedObject[] = [makeObj(0, 0, 0)];
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, objects, registry);

    // body + 2 colliders
    expect(calls).toHaveLength(3);
    expect(calls[1].args[4]).toBe(false); // first: not sensor
    expect(calls[2].args[4]).toBe(true);  // second: sensor
  });

  it('should recurse into children', () => {
    const registry: MapObjectRegistry = new Map([
      [0, {
        typeId: 0,
        colliders: [{ shape: { type: ShapeType.Circle, radius: 3 } }],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
      [1, {
        typeId: 1,
        colliders: [{ shape: { type: ShapeType.Cuboid, halfWidth: 2, halfHeight: 2 } }],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const child = makeObj(1, 15, 25, 0.5);
    const parent = makeObj(0, 10, 20, 1, 0, [child]);
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, [parent], registry);

    // parent: body + circle collider, child: body + cuboid collider
    expect(calls).toHaveLength(4);
    expect(calls[0].method).toBe('createFixedBody');
    expect(calls[0].args).toEqual([10, 20, 0]);
    expect(calls[2].method).toBe('createFixedBody');
    expect(calls[2].args).toEqual([15, 25, 0]);
    expect(calls[3].method).toBe('createCuboidCollider');
  });

  it('should skip objects not in registry', () => {
    const registry: MapObjectRegistry = new Map();
    const objects: PlacedObject[] = [makeObj(99, 0, 0)];
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, objects, registry);

    expect(calls).toHaveLength(0);
  });

  it('should skip colliders with tags in skipTags', () => {
    const SENSOR_TAG = 1;
    const registry: MapObjectRegistry = new Map([
      [0, {
        typeId: 0,
        colliders: [
          { shape: { type: ShapeType.Circle, radius: 30 } },
          { shape: { type: ShapeType.Circle, radius: 128 }, isSensor: true, tag: SENSOR_TAG },
        ],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const objects: PlacedObject[] = [makeObj(0, 10, 20)];
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, objects, registry, { skipTags: [SENSOR_TAG] });

    // body + 1 collider (sensor skipped)
    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe('createFixedBody');
    expect(calls[1].method).toBe('createCircleCollider');
    expect(calls[1].args[4]).toBe(false); // not sensor — the sensor one was skipped
  });

  it('should not skip colliders when skipTags is not provided', () => {
    const SENSOR_TAG = 1;
    const registry: MapObjectRegistry = new Map([
      [0, {
        typeId: 0,
        colliders: [
          { shape: { type: ShapeType.Circle, radius: 30 } },
          { shape: { type: ShapeType.Circle, radius: 128 }, isSensor: true, tag: SENSOR_TAG },
        ],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const objects: PlacedObject[] = [makeObj(0, 10, 20)];
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, objects, registry);

    // body + 2 colliders (nothing skipped)
    expect(calls).toHaveLength(3);
    expect(calls[1].args[4]).toBe(false);
    expect(calls[2].args[4]).toBe(true);
  });

  it('should skip colliders with skipTags in recursive children', () => {
    const SENSOR_TAG = 1;
    const registry: MapObjectRegistry = new Map([
      [0, {
        typeId: 0,
        colliders: [
          { shape: { type: ShapeType.Circle, radius: 5 } },
          { shape: { type: ShapeType.Circle, radius: 50 }, isSensor: true, tag: SENSOR_TAG },
        ],
        visuals: [],
        scaleRange: [1, 1] as [number, number],
      }],
    ]);
    const child = makeObj(0, 15, 25);
    const parent = makeObj(0, 10, 20, 1, 0, [child]);
    const { physics, calls } = createMockPhysics();

    createMapColliders(physics, [parent], registry, { skipTags: [SENSOR_TAG] });

    // parent: body + 1 collider (sensor skipped), child: body + 1 collider (sensor skipped)
    expect(calls).toHaveLength(4);
    expect(calls.filter(c => c.method === 'createFixedBody')).toHaveLength(2);
    expect(calls.filter(c => c.method === 'createCircleCollider')).toHaveLength(2);
  });
});
