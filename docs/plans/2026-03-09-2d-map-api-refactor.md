# 2D Map API Refactor Implementation Plan

Created: 2026-03-09
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Refactor `@lagless/2d-map-generator` and `@lagless/2d-map-renderer` to provide clean, intuitive APIs: numeric enums instead of strings, unified `MapObjectDef` (colliders + visuals), type-safe feature output access, one-line collider creation utility, ParticleContainer-based rendering with RenderLayer, and comprehensive README.

**Architecture:** Types refactored bottom-up (enums → interfaces → features → presets → consumers). Generator stays feature-based with DAG resolution. Renderer gains `MapObjectRenderer` using two `ParticleContainer`s (ground/canopy) attached to Pixi.js `RenderLayer`s. ECS PRNG replaces `SimpleSeededRandom`.

**Tech Stack:** TypeScript, Pixi.js 8 (ParticleContainer, Particle, RenderLayer), Rapier 2D, Vitest

## Scope

### In Scope
- Numeric enums replacing all string discriminators (ShapeType, FeatureId, PlacementKind, RenderLayer)
- Unified MapObjectDef with colliders[] + visuals[] arrays
- Type-safe `map.get(FeatureClass)` replacing `map.getFeatureOutput<T>('string')`
- `createMapColliders()` utility function
- `MapObjectRenderer` with ParticleContainer + RenderLayer
- Remove SimpleSeededRandom, use ECS PRNG directly
- Update 2d-map-test game to use new APIs
- Update all existing tests
- README.md for 2d-map-generator

### Out of Scope
- ECS MapObject component + CanopySensorSystem (requires ecs.yaml codegen, deferred)
- Frustum culling for map objects (200 objects is fine without it)
- Pre-baked terrain grid for TerrainQuery
- Path-based placement (along rivers/roads)
- Independent ground patches API

## Context for Implementer

**Patterns to follow:**
- Feature classes: `libs/2d-map/2d-map-generator/src/lib/features/biome-feature.ts` — id, requires, generate()
- Existing renderer: `libs/2d-map/2d-map-renderer/src/lib/core/map-terrain-renderer.ts` — build/destroy pattern
- Runner integration: `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts` — pre-start collider creation

**Conventions:**
- Single quotes, 2-space indent, kebab-case files
- ESM with `.js` extension in imports
- `@lagless/math` `MathOps` for trig (determinism)
- Tests in `src/__tests__/` mirroring source structure, using `createMockRandom()` helper

**Key files:**
- All types: `libs/2d-map/2d-map-generator/src/lib/types/` (7 files)
- All features: `libs/2d-map/2d-map-generator/src/lib/features/` (9 files)
- Tests: `libs/2d-map/2d-map-generator/src/__tests__/` (20 spec files)
- Presets: `libs/2d-map/2d-map-generator/src/lib/presets/` (3 files)
- Renderer: `libs/2d-map/2d-map-renderer/src/lib/core/` (2 files)

**Gotchas:**
- `PRNG` class from `@lagless/core` already structurally satisfies `ISeededRandom` (has `getFloat()`, `getRandomInt()`, `getRandomIntInclusive()`) — no adapter needed
- `ParticleContainer.addChild()` throws — must use `addParticle()`
- `Particle.alpha` setter updates `particle.color` (32-bit RGBA) — needs `dynamicProperties: { color: true }` for per-frame alpha changes
- All Particles in one ParticleContainer must share same texture source (spritesheet atlas)
- `MapObjectDef.collisionShape` is used by both `ICollisionProvider` (generation-time overlap test) and Rapier (runtime physics). The generation-time collision only uses the FIRST non-sensor collider for overlap testing.
- `BridgeFeature` creates PlacedObject with string `type` matching `bridgeTypes` config — needs typeId mapping
- Tests use `createMockRandom(seed)` from shared helper — this stays unchanged

**Domain context:**
- Map generation is deterministic: same seed → same map on all clients
- Generation happens BEFORE simulation start, but AFTER runner construction (so PRNG is available)
- Objects are static (no runtime create/delete needed yet)
- Top-down game: no Y-sort between ground objects and entities needed
- Ground layer renders under players, canopy layer renders over players

## Progress Tracking

- [x] Task 1: Core type system refactor (enums + interfaces)
- [x] Task 2: Generator core refactor (MapGenerator, GeneratedMap)
- [x] Task 3: Feature classes update
- [x] Task 4: Collision providers update
- [x] Task 5: Presets + createMapColliders utility
- [x] Task 6: MapObjectRenderer (new)
- [x] Task 7: Existing renderers update
- [x] Task 8: 2d-map-test simulation update
- [x] Task 9: 2d-map-test game update
- [x] Task 10: Test suite update
- [x] Task 11: Exports update + README.md

**Total Tasks:** 11 | **Completed:** 11 | **Remaining:** 0

## Implementation Tasks

### Task 1: Core type system refactor

**Objective:** Replace all string discriminators with numeric enums. Redesign MapObjectDef to support multiple colliders and visual layers.
**Dependencies:** None

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/geometry.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/placed-object.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/object-def.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/feature-configs.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/generated-map.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/index.ts`

**Key Decisions / Notes:**

geometry.ts changes:
```typescript
// Regular enum (NOT const enum — const enum breaks across package boundaries with SWC/isolatedModules)
export enum ShapeType { Circle = 0, Cuboid = 1 }

// MapCollisionShape uses ShapeType. Offset removed from shape — lives in MapColliderDef only.
export type MapCollisionShape =
  | { type: ShapeType.Circle; radius: number }
  | { type: ShapeType.Cuboid; halfWidth: number; halfHeight: number };
```

object-def.ts changes:
```typescript
export enum RenderLayer { Ground = 0, Canopy = 1 }  // NOT const enum

export interface MapColliderDef {
  shape: MapCollisionShape;
  offsetX?: number;   // additional offset (default 0)
  offsetY?: number;
  isSensor?: boolean;  // Rapier sensor
  tag?: number;        // game-defined ColliderTag enum
  collisionGroup?: number;
}

export interface MapVisualDef {
  texture: string;     // spritesheet frame key
  layer: RenderLayer;
  offsetX?: number;
  offsetY?: number;
  anchorX?: number;    // default 0.5
  anchorY?: number;    // default 0.5
}

export interface MapObjectDef {
  typeId: number;
  colliders: MapColliderDef[];
  visuals: MapVisualDef[];
  scaleRange: [number, number];
  orientations?: number[];           // default [0]
  groundPatches?: GroundPatchDef[];
  mapDisplay?: MapDisplayDef;        // keep for minimap backward compat
}

// Registry keyed by typeId
export type MapObjectRegistry = ReadonlyMap<number, MapObjectDef>;
```

placed-object.ts — `type: string` → `typeId: number`:
```typescript
export interface PlacedObject {
  readonly typeId: number;
  // ... rest unchanged
  readonly children: ReadonlyArray<PlacedObject>;
}
```

feature.ts — FeatureId enum:
```typescript
export enum FeatureId {  // NOT const enum
  Biome = 0, Shore = 1, Grass = 2, River = 3,
  Lake = 4, Bridge = 5, ObjectPlacement = 6,
  GroundPatch = 7, Places = 8,
}

export interface IMapFeature<TConfig = unknown, TOutput = unknown> {
  readonly id: FeatureId;
  readonly requires: readonly FeatureId[];
  generate(ctx: GenerationContext, config: TConfig): TOutput;
}

export interface GenerationContext {
  // ...existing fields...
  getOutput<T>(featureId: FeatureId): T;
  hasFeature(featureId: FeatureId): boolean;
}
```

feature-configs.ts — PlacementKind enum, remove TerrainZonePref:
```typescript
export enum PlacementKind { Location = 0, Fixed = 1, Random = 2, Density = 3 }  // NOT const enum

// TerrainZonePref removed — use TerrainZone directly
export interface FixedStage {
  kind: PlacementKind.Fixed;
  typeId: number;
  count: number;
  important?: boolean;
  terrainZone?: TerrainZone;
}
// LocationStage, DensityStage: same pattern (kind + typeId)
// RandomStage: spawns: string[] → spawns: number[] (array of typeIds)
export interface RandomStage {
  kind: PlacementKind.Random;
  spawns: number[];  // typeId array — was string[], migrated to match registry keys
  count: number;
  terrainZone?: TerrainZone;
}
```

generated-map.ts — type-safe accessor via FeatureId enum:
```typescript
export interface IGeneratedMap {
  readonly width: number;
  readonly height: number;
  readonly gridSize: number;
  // Simple type-safe accessor — feature classes have static `id: FeatureId`
  get<T>(feature: { readonly id: FeatureId }): T | undefined;
  getFeatureOutput<T>(featureId: FeatureId): T | undefined;
}
// Usage: map.get<BiomeOutput>(BiomeFeature)  — reads BiomeFeature.id internally
```

ChildObjectDef stays but uses typeId instead of type string.

**Definition of Done:**
- [ ] All type files compile with `tsc --noEmit`
- [ ] ShapeType, FeatureId, PlacementKind, RenderLayer enums exported
- [ ] MapObjectDef has colliders[] + visuals[] arrays
- [ ] PlacedObject uses typeId (number)
- [ ] IMapFeature uses FeatureId enum
- [ ] GeneratedMap has type-safe `get()` method

**Verify:**
```bash
cd libs/2d-map/2d-map-generator && npx tsc --noEmit 2>&1 | head -50
```

---

### Task 2: Generator core refactor

**Objective:** Update MapGenerator and GenerationContext to use FeatureId enum internally.
**Dependencies:** Task 1

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/core/map-generator.ts`

**Key Decisions / Notes:**
- Internal maps use `FeatureId` as keys instead of strings
- `GeneratedMap.get(FeatureClass)` implementation: reads `feature.id` (static FeatureId), looks up in internal Map<FeatureId, unknown>
- Each feature class has `static readonly id = FeatureId.X` — the `get()` method reads this
- `GeneratedMap.setFeatureOutput` uses FeatureId as key

**Definition of Done:**
- [ ] MapGenerator uses FeatureId for dependency validation and topological sort
- [ ] GeneratedMap stores outputs keyed by FeatureId
- [ ] `map.get(BiomeFeature)` returns `BiomeOutput | undefined` (type-safe)

**Verify:**
```bash
cd libs/2d-map/2d-map-generator && npx tsc --noEmit 2>&1 | head -50
```

---

### Task 3: Feature classes update

**Objective:** Update all 9 feature classes to use FeatureId, ShapeType, PlacementKind, and new MapObjectDef.
**Dependencies:** Task 1, Task 2

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/biome-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/shore-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/grass-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/river-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/lake-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/bridge-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/ground-patch-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/places-feature.ts`

**Key Decisions / Notes:**
- Each feature: `id = FeatureId.X` (was string), `requires = [FeatureId.Y]` (was string[])
- Add static `featureId` to each feature class for type-safe map.get() lookup
- ObjectPlacementFeature: biggest change — uses new MapObjectDef.colliders[0] for placement collision (first non-sensor collider), PlacedObject.typeId, PlacementKind enum, TerrainZone directly instead of TerrainZonePref
- **orientations fallback:** add `const orientations = def.orientations ?? [0];` before accessing orientations array — field is now optional
- Remove ZONE_PREF_MAP — stages reference TerrainZone directly
- **RandomStage.spawns:** now `number[]` — update `stage.spawns.forEach(typeId => registry.get(typeId))` accordingly
- BridgeFeature: `bridgeTypes` config changes from `{ medium: string }` to `{ medium: number }` (typeId). In `generate()`: creates PlacedObjects with `typeId: bridgeTypes[size]` where size strings ('medium','large','xlarge') are config keys mapping to numeric typeIds
- ObjectPlacementFeature: stage.type → stage.typeId, registry.get(stage.typeId)
- ChildObjectDef.type → ChildObjectDef.typeId

**Definition of Done:**
- [ ] All 9 feature classes use FeatureId enum for id and requires
- [ ] All feature classes have `static readonly id = FeatureId.X`
- [ ] ObjectPlacementFeature uses first non-sensor collider from colliders[] for overlap testing
- [ ] ObjectPlacementFeature uses `def.orientations ?? [0]` fallback
- [ ] RandomStage.spawns uses `number[]` (typeIds), lookup via `registry.get(typeId)`
- [ ] PlacementStage uses PlacementKind enum and typeId

**Verify:**
```bash
cd libs/2d-map/2d-map-generator && npx tsc --noEmit 2>&1 | head -50
```

---

### Task 4: Collision providers update

**Objective:** Update spatial grid and Rapier collision providers to use ShapeType enum.
**Dependencies:** Task 1

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/collision/spatial-grid-provider.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/collision/rapier-provider.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/math/collision-test.ts` (if it references shape types)

**Key Decisions / Notes:**
- Replace `shape.type === 'circle'` with `shape.type === ShapeType.Circle`
- Replace `shape.type === 'aabb'` with `shape.type === ShapeType.Cuboid`
- Collision provider interface unchanged (still accepts MapCollisionShape)

**Definition of Done:**
- [ ] SpatialGridCollisionProvider uses ShapeType enum
- [ ] RapierCollisionProvider uses ShapeType enum
- [ ] No string comparisons remain for shape types

**Verify:**
```bash
cd libs/2d-map/2d-map-generator && npx tsc --noEmit 2>&1 | head -50
```

---

### Task 5: Presets + createMapColliders utility

**Objective:** Update standard presets to new format. Add `createMapColliders()` utility.
**Dependencies:** Task 1, Task 3

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/presets/standard-objects.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/presets/standard-map.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/physics/create-map-colliders.ts`
- Test: `libs/2d-map/2d-map-generator/src/__tests__/physics/create-map-colliders.spec.ts`

**Key Decisions / Notes:**

standard-objects.ts new format:
```typescript
export enum StandardObjectType { Tree = 0 }  // NOT const enum

const TREE_DEF: MapObjectDef = {
  typeId: StandardObjectType.Tree,
  colliders: [
    { shape: { type: ShapeType.Circle, radius: 3 } },
  ],
  visuals: [
    { texture: 'tree-trunk', layer: RenderLayer.Ground },
    { texture: 'tree-foliage', layer: RenderLayer.Canopy },
  ],
  scaleRange: [0.8, 1.2],
  mapDisplay: {
    shapes: [{ collider: { type: ShapeType.Circle, radius: 3 }, color: 0x2d5a1e, scale: 1 }],
  },
};
```

createMapColliders function — takes Rapier types as generics to avoid direct Rapier dependency:
```typescript
export interface MapPhysicsProvider {
  createFixedBody(x: number, y: number, rotation: number): unknown;
  createCircleCollider(body: unknown, radius: number, offsetX: number, offsetY: number, isSensor: boolean, tag?: number, collisionGroup?: number): void;
  createCuboidCollider(body: unknown, halfW: number, halfH: number, offsetX: number, offsetY: number, isSensor: boolean, tag?: number, collisionGroup?: number): void;
}

// Recurses into obj.children — each child gets its own body with inherited parent transform
export function createMapColliders(
  physics: MapPhysicsProvider,
  objects: readonly PlacedObject[],
  registry: MapObjectRegistry,
): void;
```

This avoids importing Rapier directly into the generator package. The game creates an adapter:
```typescript
// In runner-provider:
const physics: MapPhysicsProvider = {
  createFixedBody: (x, y, rot) => {
    const desc = rapier.RigidBodyDesc.fixed().setTranslation(x, y).setRotation(rot);
    return wm.createBodyFromDesc(desc);
  },
  createCircleCollider: (body, r, ox, oy, sensor, tag, group) => {
    let desc = rapier.ColliderDesc.ball(r).setTranslation(ox, oy).setSensor(sensor);
    if (group != null) desc = desc.setCollisionGroups(group);
    wm.createColliderFromDesc(desc, body);
  },
  createCuboidCollider: (body, hw, hh, ox, oy, sensor, tag, group) => {
    let desc = rapier.ColliderDesc.cuboid(hw, hh).setTranslation(ox, oy).setSensor(sensor);
    if (group != null) desc = desc.setCollisionGroups(group);
    wm.createColliderFromDesc(desc, body);
  },
};
createMapColliders(physics, placement.objects, registry);
```

**Definition of Done:**
- [ ] STANDARD_OBJECT_REGISTRY uses new MapObjectDef format with typeId, colliders[], visuals[]
- [ ] createMapColliders creates bodies for all placed objects with correct shapes, offsets, scale, sensors, tag, collisionGroup
- [ ] createMapColliders recursively handles PlacedObject.children
- [ ] createMapColliders has unit test with mock physics provider (including children test)
- [ ] createStandardGenerator works with new format

**Verify:**
```bash
npx vitest run --project=@lagless/2d-map-generator src/__tests__/physics/create-map-colliders.spec.ts
```

---

### Task 6: MapObjectRenderer

**Objective:** Create ParticleContainer-based renderer with ground/canopy layers.
**Dependencies:** Task 1

**Files:**
- Create: `libs/2d-map/2d-map-renderer/src/lib/core/map-object-renderer.ts`
- Test: `libs/2d-map/2d-map-renderer/src/__tests__/map-object-renderer.spec.ts`

**Key Decisions / Notes:**

```typescript
export class MapObjectRenderer {
  readonly ground: ParticleContainer;  // attach to RenderLayer
  readonly canopy: ParticleContainer;  // attach to RenderLayer

  constructor(options?: { dynamicCanopyAlpha?: boolean });

  /**
   * Build particles from placed objects. Objects pre-sorted by Y.
   * Each visual layer of each object → one Particle in the appropriate container.
   */
  build(
    objects: readonly PlacedObject[],
    registry: MapObjectRegistry,
    getTexture: (frameKey: string) => Texture,
  ): void;

  /**
   * Update canopy alpha for objects where a flag changed (e.g., player inside sensor).
   * Called per-frame from useTick().
   */
  setCanopyAlpha(objectIndex: number, alpha: number): void;

  destroy(): void;
}
```

- Two ParticleContainers: ground (`dynamicProperties: { color: false }` — static), canopy (`dynamicProperties: { color: true }` — dynamic alpha)
- Objects sorted by `posY` ascending before adding particles (correct draw order for top-down)
- `_canopyParticleMap`: `Map<number, Particle>` mapping objectIndex → canopy Particle for alpha updates
- Test mocks Pixi.js ParticleContainer/Particle

**Definition of Done:**
- [ ] MapObjectRenderer creates ground and canopy ParticleContainers
- [ ] Objects sorted by Y before particle creation
- [ ] setCanopyAlpha changes particle alpha
- [ ] destroy cleans up both containers

**Verify:**
```bash
npx vitest run --project=@lagless/2d-map-renderer src/__tests__/map-object-renderer.spec.ts
```

---

### Task 7: Existing renderers update

**Objective:** Update MapTerrainRenderer and MinimapRenderer to use type-safe feature access.
**Dependencies:** Task 1, Task 2

**Files:**
- Modify: `libs/2d-map/2d-map-renderer/src/lib/core/map-terrain-renderer.ts`
- Modify: `libs/2d-map/2d-map-renderer/src/lib/core/minimap-renderer.ts`
- Modify: `libs/2d-map/2d-map-renderer/src/index.ts`

**Key Decisions / Notes:**
- Replace `map.getFeatureOutput<BiomeOutput>('biome')` with `map.get(BiomeFeature)` (import feature classes)
- MinimapRenderer.addObjectShapes: adapt to new MapObjectDef (colliders[] instead of collisionShape, typeId instead of type)
- MinimapRenderer mapDisplay uses ShapeType enum
- Export MapObjectRenderer from index.ts

**Definition of Done:**
- [ ] MapTerrainRenderer uses type-safe map.get() calls
- [ ] MinimapRenderer uses type-safe map.get() and new MapObjectDef format
- [ ] MapObjectRenderer exported from @lagless/2d-map-renderer

**Verify:**
```bash
cd libs/2d-map/2d-map-renderer && npx tsc --noEmit 2>&1 | head -50
```

---

### Task 8: 2d-map-test simulation update

**Objective:** Remove SimpleSeededRandom, use ECS PRNG. Update runner to use new APIs.
**Dependencies:** Task 1, Task 5

**Files:**
- Delete: `2d-map-test/2d-map-test-simulation/src/lib/simple-seeded-random.ts`
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts`
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/map-data.ts`
- Modify: `2d-map-test/2d-map-test-simulation/src/index.ts`

**Key Decisions / Notes:**

map-test-runner-with-map.ts changes:
```typescript
// Before:
const random = new SimpleSeededRandom(numericSeed);
const map = generator.generate(random, collision);

// After — PRNG available from runner construction:
// But generateMapData is called BEFORE super() — PRNG not available yet.
// Solution: generate map AFTER super(), before createMapColliders.
```

**Important**: Currently `generateMapData()` is called before `super()` to pass MapData as extraRegistration. With ECS PRNG, we need PRNG from the runner (available after super). Restructure:
1. Call super() with empty MapData placeholder
2. Generate map using `this.DIContainer.resolve(PRNG)`
3. Create colliders
4. capturePreStartState()

OR: keep generateMapData as static, accept ISeededRandom parameter, call it after construction with runner.PRNG. The runner constructor changes to:
```typescript
constructor(...) {
  super(..., [[MapData, null]]);  // placeholder
  const prng = this.DIContainer.resolve(PRNG);
  const mapData = generateMapData(prng);
  this.DIContainer.register(MapData, mapData);  // replace placeholder
  createMapColliders(physics, mapData...);
  this.Simulation.capturePreStartState();
}
```

Actually simpler: call super without MapData, then register it:
```typescript
constructor(...) {
  super(config, inputProvider, Systems, Signals, rapier, physicsConfig);
  const prng = this.DIContainer.resolve(PRNG);
  const mapData = generateMapData(prng);
  this.DIContainer.register(MapData, mapData);
  createMapColliders(...);
  this.Simulation.capturePreStartState();
}
```

Remove SimpleSeededRandom import and file. Remove seedToUint32 helper.

**Definition of Done:**
- [ ] SimpleSeededRandom deleted
- [ ] Map generation uses ECS PRNG from runner
- [ ] createMapColliders uses new utility function
- [ ] Exports updated (no SimpleSeededRandom)
- [ ] Determinism verified: calling generateMapData twice with same PRNG state produces identical PlacedObject arrays (same count, positions, typeIds)

**Verify:**
```bash
cd 2d-map-test/2d-map-test-simulation && npx tsc --noEmit 2>&1 | head -50
```

---

### Task 9: 2d-map-test game update

**Objective:** Update game view to use MapObjectRenderer with RenderLayer.
**Dependencies:** Task 6, Task 7, Task 8

**Files:**
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx`
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/game-view.tsx` (add ParticleContainer to extend)

**Key Decisions / Notes:**

game-view.tsx — add to extend():
```typescript
import { ParticleContainer, RenderLayer } from 'pixi.js';
extend({ ..., ParticleContainer, RenderLayer });
```

map-test-view.tsx — replace manual sprite creation with MapObjectRenderer:
```typescript
useEffect(() => {
  const terrain = new MapTerrainRenderer();
  const terrainContainer = terrain.buildTerrain(map);

  const objectRenderer = new MapObjectRenderer();
  const placement = map.get(ObjectPlacementFeature);
  if (placement) {
    objectRenderer.build(placement.objects, mapData.registry, (key) => Assets.get(key));
  }

  // RenderLayer setup
  const groundLayer = new RenderLayer();
  const canopyLayer = new RenderLayer();

  viewport.addChild(terrainContainer);
  viewport.addChild(groundLayer);
  // entities go between ground and canopy (via scene graph order)
  viewport.addChild(canopyLayer);

  groundLayer.attach(objectRenderer.ground);
  canopyLayer.attach(objectRenderer.canopy);

  return () => {
    terrain.destroy();
    objectRenderer.destroy();
  };
}, [viewport, mapData]);
```

**Definition of Done:**
- [ ] Map objects rendered via MapObjectRenderer with ParticleContainer
- [ ] Ground and canopy layers use RenderLayer
- [ ] No manual Sprite creation for map objects
- [ ] `tsc --noEmit` passes for game package
- [ ] MapObjectRenderer.build() called with placement.objects and registry
- [ ] RenderLayer instances added to viewport in correct order (terrain, groundLayer, canopyLayer)

**Verify:**
```bash
cd 2d-map-test/2d-map-test-game && npx tsc --noEmit 2>&1 | head -50
```

---

### Task 10: Test suite update

**Objective:** Update all 20 spec files to use new enums and types.
**Dependencies:** Task 1-5

**Files:**
- Modify: All files in `libs/2d-map/2d-map-generator/src/__tests__/`
- Key changes in: `features/object-placement-feature.spec.ts`, `core/map-generator.spec.ts`, `types/generated-map.spec.ts`, `collision/spatial-grid.spec.ts`

**Key Decisions / Notes:**
- Replace `type: 'circle'` with `type: ShapeType.Circle` in all shape literals
- Replace `type: 'aabb'` with `type: ShapeType.Cuboid`
- Replace string feature IDs with FeatureId enum
- Replace `kind: 'fixed'` etc with PlacementKind enum
- `makeSimpleDef('tree')` → `makeSimpleDef(0)` with `typeId` and `colliders[]`
- `obj.type` assertions → `obj.typeId` assertions
- `createMockRandom()` stays unchanged (ISeededRandom interface unchanged)
- `feature.id` assertions: `expect(feature.id).toBe(FeatureId.ObjectPlacement)` etc
- Add test for type-safe `map.get(FeatureClass)` in generated-map.spec.ts

**Definition of Done:**
- [ ] All 20 spec files updated and passing
- [ ] No string shape types or feature IDs in tests
- [ ] New createMapColliders test passing

**Verify:**
```bash
npx vitest run --project=@lagless/2d-map-generator
```

---

### Task 11: Exports update + README.md

**Objective:** Update package exports, create comprehensive README.
**Dependencies:** Task 1-10

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/index.ts`
- Create: `libs/2d-map/2d-map-generator/README.md`

**Key Decisions / Notes:**
- Export new enums: ShapeType, FeatureId, PlacementKind, RenderLayer
- Export new interfaces: MapColliderDef, MapVisualDef, MapPhysicsProvider
- Export createMapColliders
- Remove old string type exports (TerrainZonePref)

README structure:
1. Overview — what the library does
2. Quick Start — minimal example
3. Architecture — feature DAG, generation flow
4. API Reference — MapGenerator, features, types, enums
5. Object Definitions — MapObjectDef with colliders + visuals examples (tree, building)
6. Collision Providers — SpatialGrid vs Rapier
7. Physics Integration — createMapColliders
8. Rendering — MapObjectRenderer (brief, links to 2d-map-renderer)
9. Determinism — seed, MathOps, ISeededRandom

**Definition of Done:**
- [ ] All new types and functions exported from package
- [ ] README.md covers all APIs with code examples
- [ ] Package compiles and all tests pass

**Verify:**
```bash
npx vitest run --project=@lagless/2d-map-generator && cd libs/2d-map/2d-map-generator && npx tsc --noEmit
```

---

## Testing Strategy

- **Unit tests:** All existing 20 specs updated for new types. New specs for `createMapColliders` and `MapObjectRenderer`.
- **Integration:** 2d-map-test-game typecheck verifies full pipeline compiles.
- **Manual:** Run 2d-map-test game (`pnpm exec nx serve @lagless/2d-map-test-game`) to verify map renders correctly.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Enum runtime overhead | Low | Low | Using regular `enum` (not `const enum`) for SWC/isolatedModules cross-package safety. Negligible overhead for map gen. |
| ParticleContainer texture sharing | Low | Medium | All map object textures must be in one spritesheet atlas. Document this requirement. |
| PRNG sequence change breaks determinism | Low | High | Map generation consumes PRNG BEFORE simulation — all clients do this identically. Verify with determinism test (same seed → same PlacedObject[]). |
| BridgeFeature bridgeTypes string→number | Medium | Low | BridgeConfig.bridgeTypes becomes `Record<string, number>` mapping size→typeId. Sizes stay as string keys in config. |

## Goal Verification

### Truths
1. No string comparisons remain in shape type checking — all use ShapeType enum
2. Feature output access is type-safe — `map.get(BiomeFeature)` returns `BiomeOutput`
3. MapObjectDef supports multiple colliders (solid + sensor) and multiple visual layers (ground + canopy)
4. Map collider creation is a single function call, not 15+ lines of boilerplate
5. Map objects render via ParticleContainer with ground/canopy RenderLayer separation
6. SimpleSeededRandom is deleted — ECS PRNG used directly
7. All 20+ tests pass with new types

### Artifacts
1. Enums: `libs/2d-map/2d-map-generator/src/lib/types/geometry.ts` (ShapeType), `feature.ts` (FeatureId), `feature-configs.ts` (PlacementKind), `object-def.ts` (RenderLayer)
2. Type-safe access: `libs/2d-map/2d-map-generator/src/lib/types/generated-map.ts`
3. Collider utility: `libs/2d-map/2d-map-generator/src/lib/physics/create-map-colliders.ts`
4. Object renderer: `libs/2d-map/2d-map-renderer/src/lib/core/map-object-renderer.ts`
5. README: `libs/2d-map/2d-map-generator/README.md`

### Key Links
1. MapObjectDef.colliders[] → createMapColliders() → Rapier bodies
2. MapObjectDef.visuals[] → MapObjectRenderer.build() → ParticleContainers
3. IMapFeature.id (FeatureId) → GeneratedMap.get(FeatureClass) → typed output
4. ECS PRNG → ISeededRandom → MapGenerator.generate() → deterministic map
