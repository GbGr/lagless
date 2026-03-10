# 2D Map Generation

## Overview

`@lagless/2d-map-generator` produces deterministic 2D maps from a seed using a feature pipeline. `@lagless/2d-map-renderer` renders those maps using Pixi.js. Together they provide procedural terrain, rivers, lakes, object placement, and rendering for top-down 2D games.

**Key properties:**
- **Deterministic** — same seed + same config = identical map on every client (uses `MathOps` trig, `ISeededRandom`)
- **Feature-based** — compose terrain, water, objects via independent features with automatic dependency resolution
- **Physics-integrated** — `createMapColliders()` converts placed objects into Rapier 2D rigid bodies
- **Render-ready** — `MapTerrainRenderer` and `MapObjectRenderer` output Pixi.js containers

## Installation

```bash
pnpm add @lagless/2d-map-generator @lagless/2d-map-renderer
```

Both packages are peer dependencies — they are NOT included by default. Add them when your game needs procedural map generation.

## Architecture

```
MapGenerator
  ├── addFeature(feature, config)   // register features
  └── generate(random, collision)   // run all features in dependency order
        │
        ├── BiomeFeature        → BiomeOutput (color palette)
        ├── ShoreFeature        → ShoreOutput (island shore polygon)
        ├── GrassFeature        → GrassOutput (grass area polygon)
        ├── RiverFeature        → RiverOutput (river polygons)
        ├── LakeFeature         → LakeOutput (lake polygons)
        ├── BridgeFeature       → BridgeOutput (bridge placements)
        ├── ObjectPlacementFeature → ObjectPlacementOutput (placed objects)
        ├── GroundPatchFeature  → GroundPatchOutput (ground patches)
        └── PlacesFeature       → PlacesOutput (named positions)
```

Features declare dependencies via `requires`. The generator resolves them with topological sort — no manual ordering needed. You only add the features your game needs.

## Integration Flow

The full integration spans three layers:

```
1. Simulation (runner constructor)
   └── MapGenerator.generate() → IGeneratedMap
   └── createMapColliders() → Rapier 2D physics bodies
   └── capturePreStartState() → snapshot includes map colliders

2. DI Bridge
   └── MapData class registered via extraRegistrations
   └── Systems access map data via DI constructor injection

3. Client (React/Pixi.js)
   └── MapTerrainRenderer.buildTerrain() → terrain container
   └── MapObjectRenderer.build() → ground + canopy ParticleContainers
   └── extractCanopyZones() + isInsideCanopyZone() → per-frame transparency
```

## Setting Up the Generator

### Step 1: Define Object Types and Registry

Create a file in your simulation package (e.g., `map-config/objects.ts`):

```typescript
import type { MapObjectDef, MapObjectRegistry } from '@lagless/2d-map-generator';
import { RenderLayer, ShapeType, CANOPY_SENSOR_TAG } from '@lagless/2d-map-generator';

export enum ObjectType { Tree = 0, Building = 1 }

const TREE: MapObjectDef = {
  typeId: ObjectType.Tree,
  colliders: [
    { shape: { type: ShapeType.Circle, radius: 30 } },
    // Sensor for canopy transparency zone (view-only, skipped by createMapColliders)
    { shape: { type: ShapeType.Circle, radius: 128 }, isSensor: true, tag: CANOPY_SENSOR_TAG },
  ],
  visuals: [
    { texture: 'tree-trunk', layer: RenderLayer.Ground },
    { texture: 'tree-foliage', layer: RenderLayer.Canopy },
  ],
  scaleRange: [0.1, 0.2],
  // Include sensor radius in placement bounds (prevents canopy overlap)
  includeSensorsInBounds: true,
  // Optional: minimap display
  mapDisplay: {
    shapes: [
      { collider: { type: ShapeType.Circle, radius: 30 }, color: 0x2d5a1e, scale: 1 },
    ],
  },
};

const BUILDING: MapObjectDef = {
  typeId: ObjectType.Building,
  colliders: [
    { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 20 } },
    { shape: { type: ShapeType.Cuboid, halfWidth: 30, halfHeight: 20 }, isSensor: true, tag: CANOPY_SENSOR_TAG },
  ],
  visuals: [
    { texture: 'building-floor', layer: RenderLayer.Ground },
    { texture: 'building-roof', layer: RenderLayer.Canopy },
  ],
  scaleRange: [1, 1],
  groundPatches: [
    {
      offset: { x: 0, y: 0 },
      halfExtents: { x: 32, y: 22 },
      color: 0x8b4513,
      roughness: 0.5,
      offsetDist: 2,
      order: 0,
      useAsMapShape: false,
    },
  ],
};

export const OBJECT_REGISTRY: MapObjectRegistry = new Map<number, MapObjectDef>([
  [ObjectType.Tree, TREE],
  [ObjectType.Building, BUILDING],
]);
```

### Step 2: Create Map Generator Factory

Create `map-config/create-map-generator.ts`:

```typescript
import {
  MapGenerator, BiomeFeature, ShoreFeature, GrassFeature,
  RiverFeature, LakeFeature, ObjectPlacementFeature,
  PlacementKind, TerrainZone, STANDARD_BIOME,
} from '@lagless/2d-map-generator';
import { OBJECT_REGISTRY, ObjectType } from './objects.js';

export function createMapGenerator(): MapGenerator {
  const generator = new MapGenerator({
    baseWidth: 720,
    baseHeight: 720,
    scale: 1.0,
    extension: 80,
    gridSize: 16,
  });

  generator
    .addFeature(new BiomeFeature(), STANDARD_BIOME)
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
    .addFeature(new LakeFeature(), {
      lakes: [{ odds: 1.0, innerRad: 30, outerRad: 200, spawnBound: { pos: { x: 0.5, y: 0.5 }, rad: 300 } }],
    })
    .addFeature(new ObjectPlacementFeature(), {
      registry: OBJECT_REGISTRY,
      stages: [
        { kind: PlacementKind.Density, typeId: ObjectType.Tree, density: 100, terrainZone: TerrainZone.Grass },
        { kind: PlacementKind.Fixed, typeId: ObjectType.Building, count: 3, terrainZone: TerrainZone.Grass },
      ],
    });

  return generator;
}
```

### Step 3: Create MapData DI Token

Create `map-data.ts` in your simulation:

```typescript
import type { IGeneratedMap, MapObjectRegistry } from '@lagless/2d-map-generator';

export class MapData {
  map!: IGeneratedMap;
  registry!: MapObjectRegistry;
}
```

### Step 4: Extend Runner with Map Generation

Create a runner subclass that generates the map and creates physics colliders:

```typescript
import { AbstractInputProvider, ECSConfig, PRNG } from '@lagless/core';
import { PhysicsConfig2d, PhysicsWorldManager2d, type RapierModule2d, RapierRigidBody2d } from '@lagless/physics2d';
import {
  SpatialGridCollisionProvider, ObjectPlacementFeature,
  createMapColliders, CANOPY_SENSOR_TAG,
} from '@lagless/2d-map-generator';
import type { ObjectPlacementOutput, MapPhysicsProvider } from '@lagless/2d-map-generator';
import { createMapGenerator } from './map-config/create-map-generator.js';
import { OBJECT_REGISTRY } from './map-config/objects.js';
import { MyGameRunner } from './schema/code-gen/MyGame.runner.js';
import { MyGameSystems } from './systems/index.js';
import { MyGameSignals } from './signals/index.js';
import { MapData } from './map-data.js';

function createPhysicsAdapter(wm: PhysicsWorldManager2d, rapier: RapierModule2d): MapPhysicsProvider {
  return {
    createFixedBody(x, y, rotation) {
      const desc = rapier.RigidBodyDesc.fixed().setTranslation(x, y).setRotation(rotation);
      return wm.createBodyFromDesc(desc);
    },
    createCircleCollider(body, radius, ox, oy, isSensor, _tag, collisionGroup) {
      let desc = rapier.ColliderDesc.ball(radius).setTranslation(ox, oy).setSensor(isSensor);
      if (collisionGroup != null) desc = desc.setCollisionGroups(collisionGroup);
      wm.createColliderFromDesc(desc, body as RapierRigidBody2d);
    },
    createCuboidCollider(body, hw, hh, ox, oy, isSensor, _tag, collisionGroup) {
      let desc = rapier.ColliderDesc.cuboid(hw, hh).setTranslation(ox, oy).setSensor(isSensor);
      if (collisionGroup != null) desc = desc.setCollisionGroups(collisionGroup);
      wm.createColliderFromDesc(desc, body as RapierRigidBody2d);
    },
  };
}

export class MyGameRunnerWithMap extends MyGameRunner {
  constructor(
    config: ECSConfig,
    inputProvider: AbstractInputProvider,
    rapier: RapierModule2d,
    physicsConfig?: PhysicsConfig2d,
  ) {
    const mapData = new MapData();

    super(
      config, inputProvider,
      MyGameSystems, MyGameSignals,
      rapier, physicsConfig, undefined,
      [[MapData, mapData]],  // Register MapData for DI
    );

    // Generate map using ECS PRNG (available after super)
    const prng = this.DIContainer.resolve(PRNG);
    const generator = createMapGenerator();
    const collision = new SpatialGridCollisionProvider(1024, 1024, 64);
    const map = generator.generate(prng, collision);
    mapData.map = map;
    mapData.registry = OBJECT_REGISTRY;

    // Create physics colliders for placed objects
    const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
    if (placement) {
      const physics = createPhysicsAdapter(this.PhysicsWorldManager, rapier);
      createMapColliders(physics, placement.objects, mapData.registry, {
        skipTags: [CANOPY_SENSOR_TAG],
      });
    }

    // CRITICAL: re-capture initial state AFTER creating static bodies
    // Without this, rollback to tick 0 restores a world without map colliders
    this.Simulation.capturePreStartState();
  }
}
```

**Key points:**
- Map is generated in the runner constructor, BEFORE `start()` is called
- Uses ECS `PRNG` for determinism — same seed (from `serverHello.seed` in multiplayer) = same map
- `capturePreStartState()` MUST be called after creating static bodies — otherwise rollback loses them
- `MapData` is registered via `extraRegistrations` so systems can access map data through DI
- `skipTags: [CANOPY_SENSOR_TAG]` prevents creating physics bodies for view-only sensor colliders

## MapGenerator Configuration

```typescript
const generator = new MapGenerator({
  baseWidth: 720,    // map width before scaling (pixels)
  baseHeight: 720,   // map height before scaling (pixels)
  scale: 1.0,        // multiplier applied to base dimensions
  extension: 80,     // extra border around the map (water area)
  gridSize: 16,      // terrain grid cell size for rendering
});
```

The actual map dimensions are `(baseWidth + 2 * extension) * scale` by `(baseHeight + 2 * extension) * scale`.

## Object Definitions

### MapObjectDef

| Field | Type | Description |
|-------|------|-------------|
| `typeId` | `number` | Unique identifier for this object type |
| `colliders` | `MapColliderDef[]` | Physics collision shapes |
| `visuals` | `MapVisualDef[]` | Texture references with render layer |
| `scaleRange` | `[min, max]` | Random scale range applied during placement |
| `orientations` | `number[]?` | Allowed rotation angles (default: `[0]`) |
| `groundPatches` | `GroundPatchDef[]?` | Ground patches drawn under the object |
| `mapDisplay` | `MapDisplayDef?` | Minimap display shapes |
| `children` | `ChildObjectDef[]?` | Child objects spawned relative to parent |
| `includeSensorsInBounds` | `boolean?` | Include sensor colliders in placement AABB (default: false) |

### MapColliderDef

| Field | Type | Description |
|-------|------|-------------|
| `shape` | `MapCollisionShape` | `{ type: ShapeType.Circle, radius }` or `{ type: ShapeType.Cuboid, halfWidth, halfHeight }` |
| `offsetX` | `number?` | Offset from object center |
| `offsetY` | `number?` | Offset from object center |
| `isSensor` | `boolean?` | Sensor collider (no physics response) |
| `tag` | `number?` | Tag for filtering (e.g., `CANOPY_SENSOR_TAG`) |
| `collisionGroup` | `number?` | Rapier collision group bitmask |

### MapVisualDef

| Field | Type | Description |
|-------|------|-------------|
| `texture` | `string` | Texture key (resolved by `getTexture` callback in renderer) |
| `layer` | `RenderLayer` | `RenderLayer.Ground` (under entities) or `RenderLayer.Canopy` (over entities) |
| `offsetX/Y` | `number?` | Visual offset from object center |
| `anchorX/Y` | `number?` | Sprite anchor (default: 0.5, 0.5) |

## Placement Stages

Stages define how and where objects are placed. All stages run during `ObjectPlacementFeature.generate()`.

| Kind | Description | Key Fields |
|------|-------------|------------|
| `PlacementKind.Location` | Place at a specific position | `typeId`, `pos: {x, y}`, `rad`, `optional` |
| `PlacementKind.Fixed` | Place exact count randomly | `typeId`, `count`, `important?`, `terrainZone?` |
| `PlacementKind.Random` | Choose N types from a list | `spawns: number[]`, `choose`, `terrainZone?` |
| `PlacementKind.Density` | Count proportional to map area | `typeId`, `density`, `terrainZone?` |

### Examples

```typescript
stages: [
  // Place 1 tree per 100 sq. units of grass area
  { kind: PlacementKind.Density, typeId: 0, density: 100, terrainZone: TerrainZone.Grass },

  // Place exactly 3 buildings on grass
  { kind: PlacementKind.Fixed, typeId: 1, count: 3, terrainZone: TerrainZone.Grass },

  // Place a spawn point at (100, 100) within 20px radius; skip if placement fails
  { kind: PlacementKind.Location, typeId: 2, pos: { x: 100, y: 100 }, rad: 20, optional: true },

  // Randomly pick 5 objects from types [0, 1, 2]
  { kind: PlacementKind.Random, spawns: [0, 1, 2], choose: 5 },
]
```

### Terrain Zones

Restrict placement to specific terrain types:

| Zone | Value | Description |
|------|-------|-------------|
| `TerrainZone.Grass` | 0 | Main land area |
| `TerrainZone.Beach` | 1 | Shore/beach area |
| `TerrainZone.RiverShore` | 2 | Riverbank |
| `TerrainZone.River` | 3 | Inside river |
| `TerrainZone.Lake` | 4 | Inside lake |
| `TerrainZone.Bridge` | 5 | On a bridge |
| `TerrainZone.WaterEdge` | 6 | Water edge |

## Collision Providers

Collision providers prevent object overlap during placement. Two options:

```typescript
import { SpatialGridCollisionProvider, RapierCollisionProvider } from '@lagless/2d-map-generator';

// Fast grid-based provider (recommended for most cases)
const collision = new SpatialGridCollisionProvider(mapWidth, mapHeight, cellSize);

// Rapier-based provider (more accurate, slower — use when shapes need exact overlap testing)
const collision = new RapierCollisionProvider(rapier);
```

## Terrain Query

Classify world positions into terrain zones at runtime:

```typescript
import { TerrainQuery, TerrainZone } from '@lagless/2d-map-generator';
import type { ShoreOutput, GrassOutput, RiverOutput, LakeOutput } from '@lagless/2d-map-generator';
import { ShoreFeature, GrassFeature, RiverFeature, LakeFeature } from '@lagless/2d-map-generator';

const terrain = new TerrainQuery({
  shore: map.get<ShoreOutput>(ShoreFeature),
  grass: map.get<GrassOutput>(GrassFeature),
  river: map.get<RiverOutput>(RiverFeature),
  lake: map.get<LakeOutput>(LakeFeature),
});

const zone = terrain.classify(playerX, playerY); // TerrainZone.Grass, .Beach, etc.
```

Useful for terrain-dependent game logic (speed modifiers, footstep sounds, spawn restrictions).

## Physics Integration

### MapPhysicsProvider Adapter

`createMapColliders()` uses a `MapPhysicsProvider` adapter to create physics bodies. This decouples the generator from Rapier's API:

```typescript
import { createMapColliders, CANOPY_SENSOR_TAG } from '@lagless/2d-map-generator';
import type { MapPhysicsProvider } from '@lagless/2d-map-generator';

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

// Create colliders, skipping canopy sensors (view-only)
createMapColliders(physics, placement.objects, registry, {
  skipTags: [CANOPY_SENSOR_TAG],
});
```

### skipTags Option

| Option | Type | Description |
|--------|------|-------------|
| `skipTags` | `readonly number[]` | Skip colliders whose `tag` is in this list |

Use `skipTags: [CANOPY_SENSOR_TAG]` to prevent creating physics bodies for canopy transparency sensors — they are view-only and don't need physics responses.

### capturePreStartState (CRITICAL)

Static map bodies must be created BEFORE calling `capturePreStartState()`:

```typescript
// 1. Generate map + create colliders (in runner constructor)
// 2. Re-capture initial snapshot:
this.Simulation.capturePreStartState();
// 3. Start simulation:
runner.start();
```

Without this, rollback to tick 0/1 restores a physics world without map colliders.

## Rendering

### MapTerrainRenderer

Renders terrain layers (background, beach, grass, rivers, lakes, grid, ground patches):

```typescript
import { MapTerrainRenderer } from '@lagless/2d-map-renderer';

const terrain = new MapTerrainRenderer();
const terrainContainer = terrain.buildTerrain(map);
viewport.addChildAt(terrainContainer, 0); // add at bottom of display list

// Cleanup:
terrain.destroy();
```

### MapObjectRenderer

Renders placed objects as two `ParticleContainer` layers — ground (under entities) and canopy (over entities):

```typescript
import { MapObjectRenderer } from '@lagless/2d-map-renderer';
import { ObjectPlacementFeature } from '@lagless/2d-map-generator';
import type { ObjectPlacementOutput } from '@lagless/2d-map-generator';
import { Assets, Texture } from 'pixi.js';

const objectRenderer = new MapObjectRenderer({ dynamicCanopyAlpha: true });

const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
if (placement) {
  objectRenderer.build(
    placement.objects,
    registry,
    (textureKey) => Assets.get<Texture>(textureKey) ?? Texture.EMPTY,
  );

  viewport.addChild(objectRenderer.ground);  // under entities
  // ... add entity views here ...
  viewport.addChild(objectRenderer.canopy);  // over entities
}

// Cleanup:
objectRenderer.destroy();
```

**Display order:** terrain → `objectRenderer.ground` → entity sprites → `objectRenderer.canopy`

### Canopy Transparency

Canopy transparency is a **view-only** concern — it must NOT live in ECS or affect determinism. When a player is under a tree/building canopy, the canopy becomes transparent so the player remains visible.

```typescript
import { extractCanopyZones, isInsideCanopyZone } from '@lagless/2d-map-generator';
import type { ObjectPlacementOutput } from '@lagless/2d-map-generator';

// Pre-compute once (e.g., in useMemo):
const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
const canopyZones = placement ? extractCanopyZones(placement.objects, registry) : [];

// Per frame (e.g., in useTick):
const px = playerX, py = playerY;
for (const zone of canopyZones) {
  const inside = isInsideCanopyZone(zone, px, py);
  objectRenderer.setCanopyAlpha(zone.objectIndex, inside ? 0.3 : 1.0);
}
```

**How it works:**
1. `extractCanopyZones()` finds all sensor colliders tagged with `CANOPY_SENSOR_TAG` (default tag)
2. Returns `CanopyZone[]` with pre-computed `radiusSq` (for circles) or `halfWidth/halfHeight` (for cuboids)
3. `isInsideCanopyZone()` performs the appropriate distance check based on zone type
4. `objectRenderer.setCanopyAlpha()` sets the alpha of the canopy particle at that index

**Performance:** O(N) per frame with N objects — just a distance comparison per object, negligible cost.

### MinimapRenderer

Renders a simplified minimap:

```typescript
import { MinimapRenderer } from '@lagless/2d-map-renderer';
import { ObjectPlacementFeature } from '@lagless/2d-map-generator';
import type { ObjectPlacementOutput } from '@lagless/2d-map-generator';

const minimap = new MinimapRenderer();
const minimapContainer = minimap.buildMinimap(map, 200); // 200px size

// Add object dots to minimap (uses mapDisplay shapes from object definitions)
const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
if (placement) {
  minimap.addObjectShapes(placement.objects, registry);
}

stage.addChild(minimapContainer);

// Cleanup:
minimap.destroy();
```

Objects only show on the minimap if their `MapObjectDef` has a `mapDisplay` property with shapes.

## Accessing Feature Outputs

```typescript
import type { BiomeOutput, ShoreOutput, GrassOutput, RiverOutput, ObjectPlacementOutput } from '@lagless/2d-map-generator';
import { BiomeFeature, ShoreFeature, GrassFeature, RiverFeature, ObjectPlacementFeature } from '@lagless/2d-map-generator';

const map = generator.generate(random, collision);

// Type-safe access via feature class:
const biome = map.get<BiomeOutput>(BiomeFeature);       // color palette
const shore = map.get<ShoreOutput>(ShoreFeature);       // island polygon
const grass = map.get<GrassOutput>(GrassFeature);       // grass polygon + area
const river = map.get<RiverOutput>(RiverFeature);       // river polygons
const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature); // placed objects
```

## Biome Colors

Use `STANDARD_BIOME` for default colors, or define custom:

```typescript
import { STANDARD_BIOME } from '@lagless/2d-map-generator';

// Standard biome (green grass, blue water, sandy beach):
generator.addFeature(new BiomeFeature(), STANDARD_BIOME);

// Custom biome:
generator.addFeature(new BiomeFeature(), {
  background: 0x80af49,
  water: 0x3d85c6,
  waterRipple: 0x3478b2,
  beach: 0xcdb35b,
  riverbank: 0x905e24,
  grass: 0x80af49,
  underground: 0x1b0d00,
});
```

## Ground Patches

Objects can define `groundPatches` — colored rectangles drawn under the object (e.g., building foundations, dirt patches):

```typescript
groundPatches: [
  {
    offset: { x: 0, y: 0 },        // offset from object center
    halfExtents: { x: 12, y: 10 }, // half-size of the rectangle
    color: 0x8b4513,                // fill color
    roughness: 0.5,                 // edge roughness (0 = smooth)
    offsetDist: 2,                  // random edge offset distance
    order: 0,                       // 0 = under grid, 1 = over grid
    useAsMapShape: false,           // whether to use as map boundary shape
  },
]
```

Add `GroundPatchFeature` to your generator to enable ground patches:

```typescript
import { GroundPatchFeature } from '@lagless/2d-map-generator';

generator.addFeature(new GroundPatchFeature(), { registry: OBJECT_REGISTRY });
```

## Utilities

### sortPlacedObjects

Sorts placed objects by position (Y then X). Used internally by both `MapObjectRenderer.build()` and `extractCanopyZones()` to guarantee consistent object indices.

```typescript
import { sortPlacedObjects } from '@lagless/2d-map-generator';

const sorted = sortPlacedObjects(placement.objects);
// sorted[i] index matches MapObjectRenderer particle index and CanopyZone.objectIndex
```

### CANOPY_SENSOR_TAG

Constant (`= 1`) used as a tag on sensor colliders to mark canopy transparency zones. Used by:
- `extractCanopyZones()` — default tag parameter
- `createMapColliders()` with `skipTags` — prevents creating physics bodies for canopy sensors

## Determinism Notes

All map generation is deterministic:
- Uses `ISeededRandom` interface — the ECS `PRNG` satisfies this structurally
- Trigonometry uses `MathOps` (WASM-backed, cross-platform identical)
- Same seed + same config = identical map on every client
- Map generation happens ONCE before simulation starts, not during ticks
- In multiplayer, the seed comes from `serverHello.seed` — guaranteed identical for all clients

## Enums Reference

| Enum | Values |
|------|--------|
| `ShapeType` | `Circle = 0`, `Cuboid = 1` |
| `PlacementKind` | `Location = 0`, `Fixed = 1`, `Random = 2`, `Density = 3` |
| `RenderLayer` | `Ground = 0`, `Canopy = 1` |
| `TerrainZone` | `Grass = 0`, `Beach = 1`, `RiverShore = 2`, `River = 3`, `Lake = 4`, `Bridge = 5`, `WaterEdge = 6` |

## Full Client Example

```typescript
// In your game view component:
import { FC, useEffect, useMemo, useRef } from 'react';
import { useTick } from '@pixi/react';
import { Assets, Texture } from 'pixi.js';
import { MapTerrainRenderer, MapObjectRenderer } from '@lagless/2d-map-renderer';
import { ObjectPlacementFeature, extractCanopyZones, isInsideCanopyZone } from '@lagless/2d-map-generator';
import type { ObjectPlacementOutput } from '@lagless/2d-map-generator';

export const MapView: FC<{ runner: MyGameRunner; viewport: Viewport }> = ({ runner, viewport }) => {
  const mapData = useMemo(() => runner.DIContainer.resolve(MapData), [runner]);
  const objectRendererRef = useRef<MapObjectRenderer | null>(null);

  // Build terrain + objects once
  useEffect(() => {
    const terrain = new MapTerrainRenderer();
    viewport.addChildAt(terrain.buildTerrain(mapData.map), 0);

    const objRenderer = new MapObjectRenderer({ dynamicCanopyAlpha: true });
    objectRendererRef.current = objRenderer;
    const placement = mapData.map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
    if (placement) {
      objRenderer.build(placement.objects, mapData.registry, (key) => Assets.get<Texture>(key) ?? Texture.EMPTY);
      viewport.addChild(objRenderer.ground);
      viewport.addChild(objRenderer.canopy);
    }

    return () => { terrain.destroy(); objRenderer.destroy(); };
  }, [viewport, mapData]);

  // Pre-compute canopy zones
  const canopyZones = useMemo(() => {
    const placement = mapData.map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
    return placement ? extractCanopyZones(placement.objects, mapData.registry) : [];
  }, [mapData]);

  // Per-frame canopy transparency
  useTick(() => {
    const objRenderer = objectRendererRef.current;
    if (!objRenderer) return;
    const px = playerX, py = playerY; // get from transform
    for (const zone of canopyZones) {
      objRenderer.setCanopyAlpha(zone.objectIndex, isInsideCanopyZone(zone, px, py) ? 0.3 : 1.0);
    }
  });

  return null;
};
```
