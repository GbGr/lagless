# Specification: Universal 2D Map Generator for Lagless

## Context

Build a universal 2D map generator inspired by survev.io's map generation, adapted for Lagless ECS. Must be deterministic (same seed = same map), high-performance, and extensible. Each generation concern (shore, grass, rivers, placement) is a separate **feature module** that can be composed, replaced, or extended.

**Reference:** `/Users/pavlik228/survev` — survev source, `/docs/2d-map-spec/survev-map-generation-spec.md` — algorithm spec.

---

## 1. Library Structure

```
libs/2d-map/2d-map-generator/    @lagless/2d-map-generator   (deterministic, simulation-side)
libs/2d-map/2d-map-renderer/     @lagless/2d-map-renderer    (Pixi.js, client-side)
```

### `@lagless/2d-map-generator`
- **Build:** tsc (no decorators)
- **Dependencies:** `@lagless/math` (MathOps, Vector2)
- **Optional peer:** `@dimforge/rapier2d-deterministic-compat` (for `RapierCollisionProvider`)
- **No dependency on `@lagless/core`** — accepts PRNG via `ISeededRandom` interface

### `@lagless/2d-map-renderer`
- **Build:** tsc
- **Dependencies:** `@lagless/2d-map-generator` (types), `@lagless/math`
- **Peer:** `pixi.js` (8.x)
- Renders terrain + minimap (with object shapes). Game objects rendered by game code.

---

## 2. Feature-Based Architecture

### 2.1 Core Concept

Each map generation concern is an **IMapFeature** — a self-contained module with its own config, output type, and declared dependencies. The `MapGenerator` is a lightweight orchestrator that topologically sorts features by dependencies and runs them in order.

```
MapGeneratorConfig (dimensions only)
  + Feature[]  (shore, grass, rivers, placement, ...)
  + ISeededRandom
  + ICollisionProvider
          |
   MapGenerator.generate()
          |
   1. Resolve dependencies (topological sort)
   2. Create GenerationContext
   3. Run each feature in order → writes output to context
   4. Assemble GeneratedMap
          |
   GeneratedMap (immutable, feature outputs keyed by ID)
```

### 2.2 `IMapFeature` Interface

```typescript
export interface IMapFeature<TConfig = unknown, TOutput = unknown> {
  /** Unique string identifier */
  readonly id: string;
  /** IDs of features that must run before this one */
  readonly requires: readonly string[];
  /** Generate this feature's output */
  generate(ctx: GenerationContext, config: TConfig): TOutput;
}
```

### 2.3 `GenerationContext` — Inter-Feature Communication

```typescript
export interface GenerationContext {
  readonly width: number;
  readonly height: number;
  readonly center: Vec2;
  readonly random: ISeededRandom;
  readonly collision: ICollisionProvider;

  /** Get typed output of a previously-run feature. Throws if not available. */
  getOutput<T>(featureId: string): T;
  /** Check if a feature has produced output (for soft/optional dependencies). */
  hasFeature(featureId: string): boolean;
}
```

- **Hard dependencies** (`requires`): Generator throws at build time if a required feature is missing.
- **Soft dependencies** (`hasFeature()`): Feature degrades gracefully if optional feature absent (e.g., ObjectPlacement works with or without rivers).

### 2.4 `MapGenerator` Class

```typescript
export class MapGenerator {
  constructor(config: MapGeneratorConfig) {}

  addFeature<TConfig, TOutput>(
    feature: IMapFeature<TConfig, TOutput>,
    config: TConfig,
  ): this;

  generate(random: ISeededRandom, collision?: ICollisionProvider): GeneratedMap;
}
```

- Features added via chained `addFeature()` — TypeScript infers config type per feature.
- **Topological sort** ensures correct execution order regardless of `addFeature()` call order.
- Error messages: `'Feature "grass" requires "shore" which was not included.'`
- Default collision: `SpatialGridCollisionProvider` if none provided.

### 2.5 `GeneratedMap` — Output

```typescript
export interface GeneratedMap {
  readonly width: number;
  readonly height: number;
  readonly gridSize: number;
  readonly features: ReadonlyMap<string, unknown>;
  getFeatureOutput<T>(featureId: string): T | undefined;
}
```

Feature outputs keyed by feature ID. Renderer and game code access specific outputs by ID with type parameter. Custom features add their own outputs without modifying the interface.

### 2.6 `MapGeneratorConfig` — Minimal Core

Only what every map needs:

```typescript
export interface MapGeneratorConfig {
  baseWidth: number;     // 512
  baseHeight: number;    // 512
  scale: number;         // 1.19-1.28
  extension: number;     // 112
  gridSize?: number;     // 16
}
```

Everything else (shore inset, biome colors, river widths, spawn rules) lives in feature configs.

---

## 3. Built-in Features

### 3.1 `BiomeFeature`

ID: `'biome'` | Requires: nothing | Pure data passthrough for renderer.

```typescript
export interface BiomeConfig {
  background: number;  water: number;  waterRipple: number;
  beach: number;  riverbank: number;  grass: number;  underground: number;
  custom?: Record<string, number>;
}
export type BiomeOutput = BiomeConfig;
```

### 3.2 `ShoreFeature`

ID: `'shore'` | Requires: nothing

```typescript
export interface ShoreConfig {
  inset: number;       // 48 — distance from map edge
  divisions: number;   // 64 — subdivisions per side
  variation: number;   // 3 — random offset amplitude
}
export interface ShoreOutput {
  readonly polygon: Polygon;
  readonly bounds: AABB;
}
```

Algorithm: `generateJaggedAabbPoints()` — ref `survev/shared/utils/terrainGen.ts:15-56`.

### 3.3 `GrassFeature`

ID: `'grass'` | Requires: `'shore'`

```typescript
export interface GrassConfig {
  inset: number;       // 18 — beach width
  variation: number;   // 2
}
export interface GrassOutput {
  readonly polygon: Polygon;
  readonly bounds: AABB;
  readonly area: number;
}
```

Algorithm: For each shore point, offset toward center by `inset + random variation`. Ref `survev/shared/utils/terrainGen.ts:92-98`.

### 3.4 `RiverFeature`

ID: `'river'` | Requires: nothing (soft dep on `'grass'` for validation)

```typescript
export interface RiverConfig {
  weights: Array<{ weight: number; widths: number[] }>;
  subdivisionPasses: number;  // 5-6
  smoothness: number;         // 0.45
  masks: Array<{ pos?: Vec2; rad: number }>;
}
export interface RiverOutput {
  readonly rivers: ReadonlyArray<GeneratedRiver>;
  readonly normalRivers: ReadonlyArray<GeneratedRiver>;  // non-looped only
}
```

Algorithm: Midpoint subdivision + Catmull-Rom spline + polygon generation with endpoint widening. Ref `survev/server/src/game/riverCreator.ts`, `survev/shared/utils/river.ts`.

### 3.5 `LakeFeature`

ID: `'lake'` | Requires: nothing

```typescript
export interface LakeConfig {
  lakes: Array<{
    odds: number;
    innerRad: number;  outerRad: number;
    spawnBound: { pos: Vec2; rad: number };
  }>;
}
export interface LakeOutput {
  readonly lakes: ReadonlyArray<GeneratedRiver>;
}
```

Algorithm: 20 points on circle with variation, spline smoothing → 33 points, looped river. Ref `survev/server/src/game/riverCreator.ts:184-238`.

### 3.6 `BridgeFeature`

ID: `'bridge'` | Requires: `'river'`

```typescript
export interface BridgeConfig {
  bridgeTypes: { medium: string; large: string; xlarge: string };
  maxPerSize: { medium: number; large: number; xlarge: number };
}
export interface BridgeOutput {
  readonly bridges: ReadonlyArray<PlacedObject>;
}
```

### 3.7 `ObjectPlacementFeature`

ID: `'objectPlacement'` | Requires: nothing (soft deps on shore, grass, river, lake)

The most complex feature. Uses `PlacementStage[]` — a flat ordered list replacing the monolithic spawn config.

```typescript
export interface ObjectPlacementConfig {
  registry: MapObjectRegistry;
  stages: PlacementStage[];
}

export type PlacementStage =
  | LocationStage       // fixed position + radius, max 5000 attempts
  | FixedStage          // fixed count per type
  | RandomStage         // choose N from M types
  | DensityStage;       // count proportional to map area

export interface LocationStage {
  kind: 'location';
  type: string;  pos: Vec2;  rad: number;
  retryOnFailure: boolean;  maxAttempts?: number;
}
export interface FixedStage {
  kind: 'fixed';
  type: string;  count: number;
  important?: boolean;  // 5000 attempts instead of 500
  terrainZone?: TerrainZonePref;
}
export interface RandomStage {
  kind: 'random';
  spawns: string[];  choose: number;
  terrainZone?: TerrainZonePref;
}
export interface DensityStage {
  kind: 'density';
  type: string;  density: number;  // count per 250000 area units
  terrainZone?: TerrainZonePref;
}
export type TerrainZonePref = 'grass' | 'beach' | 'river' | 'riverShore' | 'lakeCenter' | 'waterEdge';

export interface ObjectPlacementOutput {
  readonly objects: ReadonlyArray<PlacedObject>;
}
```

Internally builds a `TerrainQuery` from whatever terrain features are available in context. If no terrain features → spawns randomly within map bounds.

### 3.8 `GroundPatchFeature`

ID: `'groundPatch'` | Requires: `'objectPlacement'`

Collects ground patches from placed objects' `MapObjectDef.groundPatches`.

```typescript
export interface GroundPatchConfig { extraPatches?: GroundPatchDef[]; }
export interface GroundPatchOutput {
  readonly patches: ReadonlyArray<GeneratedGroundPatch>;
}
```

### 3.9 `PlacesFeature`

ID: `'places'` | Requires: nothing

Converts normalized positions to world coordinates.

```typescript
export interface PlacesConfig {
  places: Array<{ name: string; pos: Vec2 }>;  // normalized 0-1
}
export interface PlacesOutput {
  readonly places: ReadonlyArray<{ name: string; x: number; y: number }>;
}
```

---

## 4. Shared Types

```typescript
// Geometry
export interface Vec2 { readonly x: number; readonly y: number; }
export interface AABB { readonly min: Vec2; readonly max: Vec2; }
export interface Polygon {
  readonly points: Float32Array;  // flat [x0,y0,x1,y1,...]
  readonly count: number;
}
export type MapCollisionShape =
  | { type: 'circle'; offsetX: number; offsetY: number; radius: number }
  | { type: 'aabb'; halfWidth: number; halfHeight: number };

// PRNG
export interface ISeededRandom {
  getFloat(): number;
  getRandomInt(from: number, to: number): number;
  getRandomIntInclusive(from: number, to: number): number;
}

// Collision
export interface ICollisionProvider {
  addShape(id: number, shape: MapCollisionShape, posX: number, posY: number, rotation: number, scale: number): void;
  testShape(shape: MapCollisionShape, posX: number, posY: number, rotation: number, scale: number): boolean;
  removeShape(id: number): void;
  clear(): void;
}

// Placed objects
export interface PlacedObject {
  readonly type: string;
  readonly posX: number;  readonly posY: number;
  readonly rotation: number;  readonly scale: number;
  readonly ori: number;
  readonly terrainZone: TerrainZone;
  readonly children: ReadonlyArray<PlacedObject>;
}
export enum TerrainZone { Grass, Beach, RiverShore, River, Lake, Bridge, WaterEdge }

// Object definitions
export interface MapObjectDef {
  type: string;
  collisionShape: MapCollisionShape;
  scaleRange: [number, number];
  orientations: number[];
  groundPatches?: GroundPatchDef[];
  mapDisplay?: MapDisplayDef;
  children?: ChildObjectDef[];
  metadata?: Record<string, unknown>;
}
export interface ChildObjectDef {
  type: string;  offset: Vec2;  scale: number;  ori: number;  inheritOri?: boolean;
}
export interface GroundPatchDef {
  offset: Vec2;  halfExtents: Vec2;  color: number;
  roughness: number;  offsetDist: number;
  order: 0 | 1;  useAsMapShape: boolean;
}
export interface MapDisplayDef {
  shapes: Array<{ collider: MapCollisionShape; color: number; scale: number }>;
}
export type MapObjectRegistry = ReadonlyMap<string, MapObjectDef>;

// Generated river (shared between RiverFeature and LakeFeature)
export interface GeneratedRiver {
  readonly splinePoints: Float32Array;
  readonly waterWidth: number;  readonly shoreWidth: number;
  readonly looped: boolean;  readonly center: Vec2;
  readonly waterPoly: Polygon;  readonly shorePoly: Polygon;
  readonly aabb: AABB;
}

export interface GeneratedGroundPatch {
  readonly minX: number; readonly minY: number;
  readonly maxX: number; readonly maxY: number;
  readonly color: number;  readonly roughness: number;  readonly offsetDist: number;
  readonly order: 0 | 1;  readonly useAsMapShape: boolean;
}
```

---

## 5. Collision Providers

### `SpatialGridCollisionProvider` (built-in default)
- `Uint32Array` grid with linked-list cells, `Float64Array` packed shapes
- cellSize = 32, query dedup via incrementing queryId
- AABB/Circle only, no rotation support for AABBs

### `RapierCollisionProvider` (optional, accurate)
- Creates Rapier2D World internally with sensor colliders
- Uses `intersectionTest` for overlap queries
- Supports rotated AABBs, compound shapes
- Requires initialized Rapier WASM module

```typescript
import RAPIER from '@dimforge/rapier2d-deterministic-compat';
const map = generator.generate(prng, new RapierCollisionProvider(RAPIER));
```

---

## 6. Rendering

### 6.1 `MapTerrainRenderer`

Reads feature outputs that it knows about, skips absent ones:

```typescript
export class MapTerrainRenderer {
  buildTerrain(map: GeneratedMap, options?: { canvasMode?: boolean }): Container {
    const biome = map.getFeatureOutput<BiomeOutput>('biome');
    const shore = map.getFeatureOutput<ShoreOutput>('shore');
    const grass = map.getFeatureOutput<GrassOutput>('grass');
    const rivers = map.getFeatureOutput<RiverOutput>('river');
    const patches = map.getFeatureOutput<GroundPatchOutput>('groundPatch');

    // Draws only layers that have data. No shore → no beach/ocean layers.
    // Layer order: background → beach → grass → patches(0) → river shores →
    //             river water → ocean → grid → patches(1)
  }

  updateCamera(screenOriginX, screenOriginY, scaleX, scaleY): void;
  destroy(): void;
}
```

**Performance:** Terrain drawn once into `PIXI.Graphics`, cached. Camera updates only transform container `position`/`scale`.

### 6.2 `MinimapRenderer`

```typescript
export class MinimapRenderer {
  buildMinimap(map: GeneratedMap, size: number): RenderTexture;
  addObjectShapes(objects: ReadonlyArray<PlacedObject>, registry: MapObjectRegistry): void;
  addPlaceLabels(places: ReadonlyArray<{ name: string; x: number; y: number }>): void;
  destroy(): void;
}
```

### 6.3 Custom Feature Rendering

Games with custom features add their own renderer layers:

```typescript
const swamps = map.getFeatureOutput<SwampOutput>('swamp');
if (swamps) {
  for (const s of swamps.swamps) drawPolygon(gfx, s.polygon, s.color);
}
```

---

## 7. Usage Examples

### Simple: Shore + Grass only

```typescript
const generator = new MapGenerator({ baseWidth: 512, baseHeight: 512, scale: 1.19, extension: 112 })
  .addFeature(new BiomeFeature(), STANDARD_BIOME)
  .addFeature(new ShoreFeature(), { inset: 48, divisions: 64, variation: 3 })
  .addFeature(new GrassFeature(), { inset: 18, variation: 2 });

const map = generator.generate(prng);
```

### Full survev-style map

```typescript
const generator = new MapGenerator({ baseWidth: 512, baseHeight: 512, scale: 1.19, extension: 112 })
  .addFeature(new BiomeFeature(), STANDARD_BIOME)
  .addFeature(new ShoreFeature(), { inset: 48, divisions: 64, variation: 3 })
  .addFeature(new GrassFeature(), { inset: 18, variation: 2 })
  .addFeature(new RiverFeature(), {
    weights: [{ weight: 0.25, widths: [8, 4] }, { weight: 0.20, widths: [16, 8, 4] }],
    subdivisionPasses: 5, smoothness: 0.45, masks: [],
  })
  .addFeature(new LakeFeature(), {
    lakes: [{ odds: 0.5, innerRad: 30, outerRad: 50, spawnBound: { pos: { x: 0.5, y: 0.5 }, rad: 100 } }],
  })
  .addFeature(new BridgeFeature(), {
    bridgeTypes: { medium: 'bridge_md', large: 'bridge_lg', xlarge: '' },
    maxPerSize: { medium: 3, large: 2, xlarge: 0 },
  })
  .addFeature(new ObjectPlacementFeature(), {
    registry: myRegistry,
    stages: [
      { kind: 'location', type: 'club_complex', pos: { x: 0.5, y: 0.5 }, rad: 150, retryOnFailure: true },
      { kind: 'fixed', type: 'warehouse', count: 2, important: true },
      { kind: 'random', spawns: ['mansion', 'police', 'bank'], choose: 2 },
      { kind: 'density', type: 'tree', density: 320, terrainZone: 'grass' },
      { kind: 'density', type: 'stone', density: 350, terrainZone: 'grass' },
    ],
  })
  .addFeature(new GroundPatchFeature(), {})
  .addFeature(new PlacesFeature(), {
    places: [{ name: 'The Killpit', pos: { x: 0.53, y: 0.64 } }],
  });

const map = generator.generate(prng, new RapierCollisionProvider(RAPIER));
```

### Custom feature

```typescript
export class SwampFeature implements IMapFeature<SwampConfig, SwampOutput> {
  readonly id = 'swamp';
  readonly requires = ['grass'];

  generate(ctx: GenerationContext, config: SwampConfig): SwampOutput {
    const grass = ctx.getOutput<GrassOutput>('grass');
    // Generate swamp patches within grass bounds...
    return { swamps };
  }
}

generator.addFeature(new SwampFeature(), { count: 3, radius: 30, color: 0x3a5f2b });
```

### Preset convenience

```typescript
// Provided in presets/standard-map.ts
const generator = createStandardGenerator({ scale: 'small' });
generator.addFeature(new ObjectPlacementFeature(), myPlacementConfig);
const map = generator.generate(prng);
```

### ECS integration

```typescript
@ECSSystem()
class MapInitSystem implements IECSSystem {
  constructor(private readonly _prng: PRNG) {}
  update(tick: number): void {
    if (tick !== 1) return;
    const map = createStandardGenerator().generate(this._prng);
    MapStore.set(map);
    const placement = map.getFeatureOutput<ObjectPlacementOutput>('objectPlacement');
    for (const obj of placement?.objects ?? []) {
      // spawn ECS entities, create Rapier colliders — game-specific
    }
  }
}
```

---

## 8. File Structure

### `@lagless/2d-map-generator`

```
src/
  index.ts
  lib/
    types/
      geometry.ts                 Vec2, AABB, Polygon, MapCollisionShape
      prng-interface.ts           ISeededRandom
      collision-provider.ts       ICollisionProvider
      feature.ts                  IMapFeature, GenerationContext
      generated-map.ts            GeneratedMap
      placed-object.ts            PlacedObject, TerrainZone
      object-def.ts               MapObjectDef, MapObjectRegistry, ChildObjectDef, etc.
      map-generator-config.ts     MapGeneratorConfig
    core/
      map-generator.ts            MapGenerator (addFeature, generate, dependency resolution)
      map-dimensions.ts           computeDimensions()
      terrain-query.ts            TerrainQuery (zone classification, used by placement)
    features/
      biome-feature.ts
      shore-feature.ts
      grass-feature.ts
      river-feature.ts
      lake-feature.ts
      bridge-feature.ts
      object-placement-feature.ts (PlacementStage types + feature)
      ground-patch-feature.ts
      places-feature.ts
    math/
      jagged-aabb.ts              generateJaggedAabbPoints()
      catmull-rom.ts              catmullRom(), derivative
      spline.ts                   Spline class (arc-length, tangent, normal)
      river-polygon.ts            river polygon from spline
      polygon-utils.ts            pointInPolygon, distToSegment
      collision-test.ts           AABB/Circle overlap tests
    collision/
      spatial-grid-provider.ts    SpatialGridCollisionProvider
      rapier-provider.ts          RapierCollisionProvider
    presets/
      standard-map.ts             createStandardGenerator()
      standard-biome.ts           STANDARD_BIOME constant
  __tests__/
    features/
      shore-feature.spec.ts
      grass-feature.spec.ts
      river-feature.spec.ts
      object-placement-feature.spec.ts
    math/
      jagged-aabb.spec.ts
      catmull-rom.spec.ts
      spline.spec.ts
    core/
      map-generator.spec.ts       dependency resolution + determinism
      terrain-query.spec.ts
    collision/
      spatial-grid.spec.ts
```

### `@lagless/2d-map-renderer`

```
src/
  index.ts
  lib/
    core/
      map-terrain-renderer.ts
      minimap-renderer.ts
    layers/
      background-layer.ts
      beach-layer.ts
      grass-layer.ts
      ground-patch-layer.ts
      river-shore-layer.ts
      river-water-layer.ts
      ocean-layer.ts
      grid-layer.ts
    utils/
      polygon-draw.ts
      jagged-aabb-draw.ts
```

---

## 9. Performance

### Generation (target: <50ms for 720x720 + ~1000 objects)

| Component | Strategy |
|-----------|----------|
| Polygons | `Float32Array` flat buffers |
| SpatialGrid | `Uint32Array` linked lists, zero-alloc query dedup |
| Rapier provider | Single World with sensors, `intersectionTest` |
| Point-in-polygon | AABB pre-check + ray-casting at edges |
| Trig | `MathOps.*` (WASM deterministic) |

### Rendering
Terrain drawn once, cached. Camera = container transform only. Minimap = `RenderTexture` once.

### Memory (~80KB typical)
Shore/grass polygons ~4KB, 3 rivers ~15KB, 1000 objects ~50KB, patches ~10KB.

---

## 10. Implementation Phases

### Phase 1: Core + Terrain MVP
1. Scaffold both packages
2. Types (geometry, feature, prng, collision-provider, generated-map, config)
3. `MapGenerator` (addFeature, dependency resolution, generate)
4. Math: `jagged-aabb.ts`, `polygon-utils.ts`
5. Features: `BiomeFeature`, `ShoreFeature`, `GrassFeature`
6. Renderer: `MapTerrainRenderer` (background, beach, grass, ocean, grid)
7. Integration test in `2d-map-test`

### Phase 2: Rivers
1. Math: `catmull-rom.ts`, `spline.ts`, `river-polygon.ts`
2. Features: `RiverFeature`, `LakeFeature`
3. Renderer: river layers
4. Tests

### Phase 3: Object Placement
1. `SpatialGridCollisionProvider`, `RapierCollisionProvider`
2. `TerrainQuery`
3. `ObjectPlacementFeature` with all stage types + composite children
4. `GroundPatchFeature`
5. Renderer: ground patch layers
6. `BridgeFeature`

### Phase 4: Minimap + Polish
1. `MinimapRenderer` (terrain + object shapes + labels)
2. `PlacesFeature`
3. Presets (`createStandardGenerator`, `STANDARD_BIOME`)
4. READMEs, performance profiling

---

## 11. Verification

### Tests
- **Unit:** Each feature independently testable with mock context
- **Determinism:** `map-generator.spec.ts` — 2 runs with same seed = identical output
- **Dependencies:** Missing feature throws clear error, soft deps degrade gracefully
- **Placement:** Count correctness, no overlaps, children placed correctly
- **Run:** `npx vitest run --project=@lagless/2d-map-generator`

### Integration
- `2d-map-test`: generate + render in browser, visual check
- Dev-player: 2 clients verify identical maps

---

## 12. Key Reference Files

| File | What |
|------|------|
| `survev/shared/utils/terrainGen.ts` | Shore/grass, jagged AABB |
| `survev/shared/utils/river.ts` | River polygon from spline |
| `survev/shared/utils/spline.ts` | Catmull-Rom spline |
| `survev/server/src/game/riverCreator.ts` | River subdivision, lakes |
| `survev/server/src/game/map.ts` | Placement pipeline, spawn strategies |
| `survev/shared/defs/maps/baseDefs.ts` | Map config reference |
| `lagless/libs/core/src/lib/mem/managers/prng-manager.ts` | PRNG interface |
| `lagless/libs/math/src/lib/math-ops.ts` | Deterministic MathOps |
| `lagless/libs/physics-shared/package.json` | Package scaffolding pattern |
