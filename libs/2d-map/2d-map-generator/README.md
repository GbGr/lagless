# @lagless/2d-map-generator

Deterministic 2D map generator with feature-based architecture. Produces terrain, rivers, lakes, object placements, and ground patches from a single seed.

## Quick Start

```typescript
import {
  MapGenerator, BiomeFeature, ShoreFeature, GrassFeature,
  SpatialGridCollisionProvider, ObjectPlacementFeature,
  STANDARD_BIOME, PlacementKind, TerrainZone,
  createMapColliders, CANOPY_SENSOR_TAG,
} from '@lagless/2d-map-generator';
import type { ObjectPlacementOutput } from '@lagless/2d-map-generator';

// 1. Configure generator with your game's features
const generator = new MapGenerator({ baseWidth: 720, baseHeight: 720, scale: 1, extension: 80, gridSize: 16 });
generator
  .addFeature(new BiomeFeature(), STANDARD_BIOME)
  .addFeature(new ShoreFeature(), { inset: 48, divisions: 12, variation: 4 })
  .addFeature(new GrassFeature(), { inset: 18, variation: 3 })
  .addFeature(new ObjectPlacementFeature(), {
    registry: myObjectRegistry,  // your game's object definitions
    stages: [{ kind: PlacementKind.Density, typeId: 0, density: 100, terrainZone: TerrainZone.Grass }],
  });

// 2. Generate map (deterministic — same seed = same map)
const collision = new SpatialGridCollisionProvider(1024, 1024, 64);
const map = generator.generate(prng, collision);

// 3. Access feature outputs (type-safe)
const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);

// 4. Create physics colliders from placed objects
//    skipTags prevents creating physics bodies for sensor colliders (e.g. canopy zones)
if (placement) {
  createMapColliders(physicsAdapter, placement.objects, myObjectRegistry, {
    skipTags: [CANOPY_SENSOR_TAG],
  });
}
```

> **Note:** Object definitions and generator presets are game-specific — define them in your game project, not in this library. See the [Object Definitions](#object-definitions) section for the `MapObjectDef` format.

## Architecture

```
MapGenerator
  ├── addFeature(feature, config)   // register features
  └── generate(random, collision)   // run all features in dependency order
        │
        ├── BiomeFeature        → BiomeOutput (colors)
        ├── ShoreFeature        → ShoreOutput (shore polygon)
        ├── GrassFeature        → GrassOutput (grass polygon)
        ├── RiverFeature        → RiverOutput (river polygons)
        ├── LakeFeature         → LakeOutput (lake polygons)
        ├── BridgeFeature       → BridgeOutput (bridge placements)
        ├── ObjectPlacementFeature → ObjectPlacementOutput (placed objects)
        ├── GroundPatchFeature  → GroundPatchOutput (ground patches)
        └── PlacesFeature       → PlacesOutput (named positions)
```

Features declare dependencies via `requires`. The generator resolves them with topological sort — no manual ordering needed.

## Custom Generator

```typescript
import {
  MapGenerator, BiomeFeature, ShoreFeature, GrassFeature,
  RiverFeature, ObjectPlacementFeature,
  PlacementKind, TerrainZone,
} from '@lagless/2d-map-generator';

const generator = new MapGenerator({
  baseWidth: 720,
  baseHeight: 720,
  scale: 1.0,
  extension: 80,
  gridSize: 16,
});

generator
  .addFeature(new BiomeFeature(), {
    background: 0x80af49,
    water: 0x3d85c6,
    waterRipple: 0x3478b2,
    beach: 0xcdb35b,
    riverbank: 0x905e24,
    grass: 0x80af49,
    underground: 0x1b0d00,
  })
  .addFeature(new ShoreFeature(), { inset: 48, divisions: 12, variation: 4 })
  .addFeature(new GrassFeature(), { inset: 18, variation: 3 })
  .addFeature(new RiverFeature(), {
    weights: [
      { weight: 0.25, widths: [8, 4] },
      { weight: 0.75, widths: [4] },
    ],
    subdivisionPasses: 5,
    masks: [],
  })
  .addFeature(new ObjectPlacementFeature(), {
    registry: myObjectRegistry,
    stages: [
      { kind: PlacementKind.Density, typeId: 0, density: 100, terrainZone: TerrainZone.Grass },
      { kind: PlacementKind.Fixed, typeId: 1, count: 10 },
      { kind: PlacementKind.Location, typeId: 2, pos: { x: 100, y: 100 }, rad: 20, optional: true },
    ],
  });

const map = generator.generate(random, collision);
```

## Object Definitions

Objects are defined via `MapObjectDef` with separate collider and visual arrays:

```typescript
import { ShapeType, RenderLayer } from '@lagless/2d-map-generator';
import type { MapObjectDef, MapObjectRegistry } from '@lagless/2d-map-generator';

import { CANOPY_SENSOR_TAG } from '@lagless/2d-map-generator';

const TREE: MapObjectDef = {
  typeId: 0,
  colliders: [
    { shape: { type: ShapeType.Circle, radius: 3 } },
    // Sensor collider for canopy transparency zone (view-only, skipped by createMapColliders via skipTags)
    { shape: { type: ShapeType.Circle, radius: 128 }, isSensor: true, tag: CANOPY_SENSOR_TAG },
  ],
  visuals: [
    { texture: 'tree-trunk', layer: RenderLayer.Ground },
    { texture: 'tree-foliage', layer: RenderLayer.Canopy },
  ],
  scaleRange: [0.1, 0.2],
};

const BUILDING: MapObjectDef = {
  typeId: 1,
  colliders: [
    { shape: { type: ShapeType.Cuboid, halfWidth: 10, halfHeight: 8 } },
    { shape: { type: ShapeType.Circle, radius: 15 }, isSensor: true, tag: 1 },
  ],
  visuals: [
    { texture: 'building-floor', layer: RenderLayer.Ground },
    { texture: 'building-roof', layer: RenderLayer.Canopy },
  ],
  scaleRange: [1, 1],
  groundPatches: [
    {
      offset: { x: 0, y: 0 },
      halfExtents: { x: 12, y: 10 },
      color: 0x8b4513,
      roughness: 0.5,
      offsetDist: 2,
      order: 0,
      useAsMapShape: false,
    },
  ],
};

const registry: MapObjectRegistry = new Map([
  [0, TREE],
  [1, BUILDING],
]);
```

## Placement Stages

| Kind | Description | Key Fields |
|------|-------------|------------|
| `PlacementKind.Location` | Place at specific position | `typeId`, `pos`, `rad`, `optional` |
| `PlacementKind.Fixed` | Place exact count | `typeId`, `count`, `important?` |
| `PlacementKind.Random` | Choose N from a list | `spawns: number[]`, `choose` |
| `PlacementKind.Density` | Count proportional to map area | `typeId`, `density` |

All stages support optional `terrainZone` to restrict placement to a terrain type.

## Accessing Feature Outputs

```typescript
import {
  BiomeFeature, ShoreFeature, GrassFeature,
  RiverFeature, ObjectPlacementFeature,
} from '@lagless/2d-map-generator';
import type { BiomeOutput, ShoreOutput, ObjectPlacementOutput } from '@lagless/2d-map-generator';

const map = generator.generate(random, collision);

// Type-safe access via feature class:
const biome = map.get<BiomeOutput>(BiomeFeature);
const shore = map.get<ShoreOutput>(ShoreFeature);
const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
```

## Collision Providers

Generation-time collision providers prevent object overlap during placement:

```typescript
import { SpatialGridCollisionProvider } from '@lagless/2d-map-generator';

// Fast grid-based provider (recommended)
const collision = new SpatialGridCollisionProvider(mapWidth, mapHeight, cellSize);
const map = generator.generate(random, collision);
```

`RapierCollisionProvider` is also available for Rapier-based overlap testing.

## Physics Integration

`createMapColliders` converts placed objects into physics bodies via a `MapPhysicsProvider` adapter:

```typescript
import { createMapColliders, CANOPY_SENSOR_TAG } from '@lagless/2d-map-generator';
import type { MapPhysicsProvider, CreateMapCollidersOptions } from '@lagless/2d-map-generator';

// Implement the adapter for your physics engine:
const physics: MapPhysicsProvider = {
  createFixedBody(x, y, rotation) {
    const desc = rapier.RigidBodyDesc.fixed().setTranslation(x, y).setRotation(rotation);
    return worldManager.createBodyFromDesc(desc);
  },
  createCircleCollider(body, radius, ox, oy, isSensor, tag, collisionGroup) {
    let desc = rapier.ColliderDesc.ball(radius).setTranslation(ox, oy).setSensor(isSensor);
    if (collisionGroup != null) desc = desc.setCollisionGroups(collisionGroup);
    worldManager.createColliderFromDesc(desc, body);
  },
  createCuboidCollider(body, hw, hh, ox, oy, isSensor, tag, collisionGroup) {
    let desc = rapier.ColliderDesc.cuboid(hw, hh).setTranslation(ox, oy).setSensor(isSensor);
    if (collisionGroup != null) desc = desc.setCollisionGroups(collisionGroup);
    worldManager.createColliderFromDesc(desc, body);
  },
};

// skipTags: skip colliders with matching tags (e.g. canopy sensors — view-only, no physics needed)
createMapColliders(physics, placement.objects, registry, {
  skipTags: [CANOPY_SENSOR_TAG],
});
```

Handles circle/cuboid shapes, offset, scale, rotation, sensors, tags, collision groups, and recursive children.

### Options

| Option | Type | Description |
|--------|------|-------------|
| `skipTags` | `readonly number[]` | Skip colliders whose `tag` is in this list. Use to prevent creating physics bodies for view-only sensors (e.g. `CANOPY_SENSOR_TAG`). |

## Terrain Query

Classify world positions into terrain zones:

```typescript
import { TerrainQuery, TerrainZone } from '@lagless/2d-map-generator';

const terrain = new TerrainQuery({
  shore: map.get<ShoreOutput>(ShoreFeature),
  grass: map.get<GrassOutput>(GrassFeature),
  river: map.get<RiverOutput>(RiverFeature),
  lake: map.get<LakeOutput>(LakeFeature),
});

const zone = terrain.classify(x, y); // TerrainZone.Grass, .Beach, .River, etc.
```

## Utilities

### sortPlacedObjects

Sorts placed objects by position (Y then X). Used internally by both `MapObjectRenderer.build()` and `extractCanopyZones()` to guarantee consistent object indices.

```typescript
import { sortPlacedObjects } from '@lagless/2d-map-generator';

const sorted = sortPlacedObjects(placement.objects);
// sorted[i] index matches MapObjectRenderer particle index and CanopyZone.objectIndex
```

### extractCanopyZones

Extracts canopy zone data from placed objects for view-layer distance checks. Returns pre-computed zones with squared radii for fast per-frame comparisons.

```typescript
import { extractCanopyZones, isInsideCanopyZone, CANOPY_SENSOR_TAG } from '@lagless/2d-map-generator';
import type { CanopyZone } from '@lagless/2d-map-generator';

const zones: CanopyZone[] = extractCanopyZones(placement.objects, registry);
// Default tag = CANOPY_SENSOR_TAG. Custom: extractCanopyZones(objects, registry, myTag)

// Two zone variants:
// CanopyZoneCircle: { type: 'circle', x, y, radiusSq, objectIndex }
// CanopyZoneCuboid: { type: 'cuboid', x, y, halfWidth, halfHeight, objectIndex }
```

**How it works:** Calls `sortPlacedObjects()` internally, iterates sorted objects, finds sensor colliders with matching `tag` and `isSensor: true`, extracts position + scaled dimensions. Supports both `ShapeType.Circle` and `ShapeType.Cuboid` sensors.

### isInsideCanopyZone

Checks whether a point is inside a canopy zone. Handles both circle and cuboid zone types:

```typescript
import { isInsideCanopyZone } from '@lagless/2d-map-generator';

const inside = isInsideCanopyZone(zone, playerX, playerY); // true if inside
```

### CANOPY_SENSOR_TAG

Constant (`= 1`) used as a tag on sensor colliders in object definitions to mark canopy transparency zones. Used by:
- `extractCanopyZones()` — default tag parameter
- `createMapColliders()` with `skipTags` — prevents creating physics bodies for canopy sensors

## Rendering

Use `@lagless/2d-map-renderer` for Pixi.js rendering:

```typescript
import { MapTerrainRenderer, MapObjectRenderer } from '@lagless/2d-map-renderer';

// Terrain (shore, grass, rivers, lakes)
const terrain = new MapTerrainRenderer();
viewport.addChild(terrain.buildTerrain(map));

// Objects (two ParticleContainers: ground + canopy)
const objects = new MapObjectRenderer({ dynamicCanopyAlpha: true });
objects.build(placement.objects, registry, (key) => Assets.get(key) ?? Texture.EMPTY);
viewport.addChild(objects.ground);   // under entities
viewport.addChild(objects.canopy);   // over entities

// Canopy transparency — set alpha for a specific object by sorted index:
objects.setCanopyAlpha(objectIndex, 0.3);  // transparent
objects.setCanopyAlpha(objectIndex, 1.0);  // opaque
```

### Canopy Transparency (View-Layer Distance Checks)

Canopy transparency is a **view-only** concern — it must NOT live in ECS or affect determinism. Use `extractCanopyZones()` to pre-compute zones once, then check distances per frame:

```typescript
import { extractCanopyZones, isInsideCanopyZone } from '@lagless/2d-map-generator';
import type { ObjectPlacementOutput } from '@lagless/2d-map-generator';

// Pre-compute once (e.g. in useMemo):
const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
const canopyZones = placement ? extractCanopyZones(placement.objects, registry) : [];

// Per frame (e.g. in useTick):
const px = playerX, py = playerY;
for (const zone of canopyZones) {
  const inside = isInsideCanopyZone(zone, px, py);
  objectRenderer.setCanopyAlpha(zone.objectIndex, inside ? 0.3 : 1.0);
}
```

**Performance:** O(N) per frame with N ≈ 100-200 objects — just multiply + compare per object, negligible cost.

## Determinism

All generation is deterministic. Requirements:
- Use `ISeededRandom` (ECS `PRNG` satisfies this structurally)
- Trigonometry uses `MathOps` (WASM-backed, cross-platform identical)
- Same seed + same config = identical map on every client

## Enums

| Enum | Values |
|------|--------|
| `ShapeType` | `Circle = 0`, `Cuboid = 1` |
| `FeatureId` | `Biome = 0` through `Places = 8` |
| `PlacementKind` | `Location = 0`, `Fixed = 1`, `Random = 2`, `Density = 3` |
| `RenderLayer` | `Ground = 0`, `Canopy = 1` |
| `TerrainZone` | `Grass = 0`, `Beach = 1`, `RiverShore = 2`, `River = 3`, `Lake = 4`, `Bridge = 5`, `WaterEdge = 6` |
