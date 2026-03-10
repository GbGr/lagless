# 2D Map Generator Implementation Plan

Created: 2026-03-07
Status: VERIFIED
Approved: Yes
Iterations: 1
Worktree: No
Type: Feature

## Summary

**Goal:** Implement a universal, deterministic 2D map generator (`@lagless/2d-map-generator`) with feature-based architecture inspired by survev.io, plus a Pixi.js renderer (`@lagless/2d-map-renderer`). All 4 phases: terrain, rivers, object placement, minimap.

**Architecture:** Feature-based pipeline. Each generation concern (shore, grass, rivers, placement) is an `IMapFeature` module. `MapGenerator` orchestrates them via topological sort. `GeneratedMap` holds keyed outputs. Renderer reads feature outputs it knows about, skips absent ones.

**Tech Stack:** TypeScript (tsc, no decorators), `@lagless/math` (MathOps, Vector2, IVector2Like), Pixi.js 8 (renderer only), optional `@dimforge/rapier2d-deterministic-compat`.

## Scope

### In Scope
- `@lagless/2d-map-generator` — all types, core orchestrator, 9 built-in features, 2 collision providers, math utils, presets
- `@lagless/2d-map-renderer` — MapTerrainRenderer, MinimapRenderer (scaffolded, no tests)
- Unit tests for all generator code
- Integration in existing `2d-map-test` app

### Out of Scope
- Tests for renderer (visual code)
- ECS integration systems (game-specific)
- Camera system (exists in game code)
- Sound/particles tied to terrain zones
- Performance optimization pass (Float32Array migration, Uint32Array SpatialGrid) — follow-up

## Context for Implementer

> Write for an implementer who has never seen the codebase.

**Patterns to follow:**
- **Build setup:** Use `libs/math/package.json` as the reference — no explicit nx targets, tsc build inferred by `@nx/js/typescript` plugin from `tsconfig.lib.json`. Do NOT copy `libs/physics-shared/package.json` build targets (it uses SWC/@swc/helpers which we don't need).
- **Exports pattern:** Use `libs/physics-shared/package.json` ONLY for the `@lagless/source` exports structure, not build config.
- Test location: `src/__tests__/` subdirectories (see `libs/physics-shared/src/lib/__tests__/`)
- Vitest workspace: add new entries to `vitest.workspace.ts` at repo root
- pnpm workspace: add `libs/2d-map/*` to `pnpm-workspace.yaml`

**Conventions:**
- `@lagless/source` export condition in package.json exports
- `workspace:*` for cross-package deps
- ESM, `.js` extensions in internal imports of built libs
- kebab-case file names
- Vitest globals (`describe`, `it`, `expect` — no import needed)

**Key files:**
- `libs/math/src/lib/math-ops.ts` — deterministic MathOps (sin, cos, atan2, sqrt, clamp, lerp)
- `libs/math/src/lib/vector2.ts` — Vector2 class with ToNew/ToRef/InPlace pattern, IVector2Like interface
- `libs/math/package.json` — build setup reference (no explicit nx targets, tsc inferred)
- `libs/physics-shared/package.json` — `@lagless/source` exports pattern reference ONLY
- `survev/shared/utils/terrainGen.ts` — shore/grass generation, jagged AABB algorithm
- `survev/shared/utils/spline.ts` — Catmull-Rom spline, arc-length parameterization
- `survev/shared/utils/river.ts` — River polygon generation from spline
- `survev/server/src/game/riverCreator.ts` — River subdivision, lake generation
- `survev/server/src/game/map.ts` — MapGrid (spatial grid), placement pipeline

**Gotchas:**
- `MathOps.init()` must be called (async) before using trig functions — tests need `beforeAll(async () => await MathOps.init())`
- `MathOps.clamp(NaN, min, max)` returns NaN — always check finiteness first
- The survev reference uses `v2.create()` / `v2.add()` utilities; our code uses `Vector2` class methods or `IVector2Like` plain objects
- `tsconfig.base.json` has `experimentalDecorators: true` globally, but the generator doesn't use decorators
- **Nested package paths:** packages are 3 levels deep (`libs/2d-map/2d-map-generator/`), so `tsconfig.json` extends `../../../tsconfig.base.json`, and vitest cacheDir uses `../../../node_modules/.vite/...`
- **IVector2Like has mutable x/y** — define a local `ReadonlyVec2 = { readonly x: number; readonly y: number }` for use in output types (Polygon, AABB, PlacedObject) to prevent accidental mutation of shared data between features

**Domain context:**
- Shore = jagged polygon at map edge separating land from ocean
- Grass = shore polygon inset by `grassInset` toward center (beach = space between shore and grass)
- Rivers = subdivided splines with water/shore polygon pairs, endpoints widen
- Lakes = looped rivers (circular splines)
- Object placement uses spatial grid collision detection to avoid overlaps
- Ground patches = colored rectangles with jagged edges, tied to placed buildings

**Reference spec:** `plans/scalable-chasing-church.md` — full API spec with interfaces, types, and examples

## Deviations from Reference Spec

| # | Spec says | Plan does | Rationale |
|---|-----------|-----------|-----------|
| 1 | `Polygon.points: Float32Array` | `Polygon.points: ReadonlyVec2[]` | User chose Vec2[] for simpler port. Float32Array is a follow-up optimization. |
| 2 | `GeneratedRiver.splinePoints: Float32Array` | `GeneratedRiver.splinePoints: ReadonlyVec2[]` | Consistent with Polygon decision — all point data uses Vec2[]. |
| 3 | `Vec2: { readonly x; readonly y }` | `ReadonlyVec2` (local alias) + `IVector2Like` for mutable | IVector2Like from @lagless/math for input, ReadonlyVec2 for outputs to prevent mutation. |
| 4 | SpatialGrid: `Uint32Array` grid, `Float64Array` packed shapes | SpatialGrid: `Map` + arrays | Simpler, matches Vec2[] decision. Typed-array version is a follow-up alongside Float32Array migration. |

## Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Package layout | Nested `libs/2d-map/*` | Group related packages. Add `libs/2d-map/*` to workspace. |
| 2 | Polygon data | `Vec2[]` in `Polygon` wrapper | Simpler port from survev. Can migrate to Float32Array later. |
| 3 | Vec2 type | `ReadonlyVec2` for outputs, `IVector2Like` for inputs | Prevents mutation of shared polygon data. IVector2Like from @lagless/math for computation. |
| 4 | Collision providers | Both SpatialGrid + Rapier | Full spec compliance. Rapier is optional peer dep. |
| 5 | Renderer | Scaffolded alongside generator | No tests for visual code. Basic terrain rendering for integration. |

## Progress Tracking

- [x] Task 1: Package scaffolding & workspace config
- [x] Task 2: Core types & interfaces
- [x] Task 3: MapGenerator orchestrator
- [x] Task 4: Math utilities (jagged-aabb, polygon-utils)
- [x] Task 5: Terrain features (Biome, Shore, Grass)
- [x] Task 6: SpatialGridCollisionProvider
- [x] Task 7: Spline math (Catmull-Rom, Spline class, river polygon)
- [x] Task 8: River & Lake features
- [x] Task 9: TerrainQuery (zone classification)
- [x] Task 10: ObjectPlacementFeature
- [x] Task 11: GroundPatchFeature & BridgeFeature
- [x] Task 12: RapierCollisionProvider
- [x] Task 13: PlacesFeature & Presets
- [x] Task 14: Renderer — MapTerrainRenderer
- [x] Task 15: Renderer — River, ground patch layers & MinimapRenderer
- [x] Task 16: Integration in 2d-map-test

**Total Tasks:** 16 | **Completed:** 16 | **Remaining:** 0

---

## Implementation Tasks

### Task 1: Package scaffolding & workspace config

**Objective:** Scaffold both `@lagless/2d-map-generator` and `@lagless/2d-map-renderer` packages with proper build config, and wire them into the monorepo.

**Dependencies:** None

**Files:**
- Create: `libs/2d-map/2d-map-generator/package.json`
- Create: `libs/2d-map/2d-map-generator/tsconfig.json`
- Create: `libs/2d-map/2d-map-generator/tsconfig.lib.json`
- Create: `libs/2d-map/2d-map-generator/tsconfig.spec.json`
- Create: `libs/2d-map/2d-map-generator/vitest.config.mts`
- Create: `libs/2d-map/2d-map-generator/src/index.ts`
- Create: `libs/2d-map/2d-map-renderer/package.json`
- Create: `libs/2d-map/2d-map-renderer/tsconfig.json`
- Create: `libs/2d-map/2d-map-renderer/tsconfig.lib.json`
- Create: `libs/2d-map/2d-map-renderer/src/index.ts`
- Modify: `pnpm-workspace.yaml` (add `libs/2d-map/*`)
- Modify: `vitest.workspace.ts` (add `'libs/2d-map/2d-map-generator'` — full nested path)

**Key Decisions / Notes:**
- Generator: no explicit nx build targets — relies on `@nx/js/typescript` plugin to infer `build` from `tsconfig.lib.json` (same as `@lagless/math`). Deps: `@lagless/math`. Optional peer: `@dimforge/rapier2d-deterministic-compat`.
- Renderer: same tsc pattern. Deps: `@lagless/2d-map-generator`, `@lagless/math`. Peer: `pixi.js` 8.x.
- Both use `@lagless/source` export condition.
- **Nested package paths:** tsconfig extends `../../../tsconfig.base.json` (3 levels up). Vitest cacheDir: `../../../node_modules/.vite/libs/2d-map/2d-map-generator`. Vitest workspace entry: `'libs/2d-map/2d-map-generator'` (full path, not `'libs/2d-map'`).
- Create shared test helper: `src/__tests__/helpers/mock-random.ts` — deterministic `ISeededRandom` implementation for all feature tests to import.

**Definition of Done:**
- [ ] Both packages exist with valid package.json, tsconfig files
- [ ] `pnpm install` succeeds
- [ ] `pnpm exec nx build @lagless/2d-map-generator` succeeds
- [ ] `npx vitest run --project=@lagless/2d-map-generator` runs (0 tests, 0 failures)
- [ ] Generator's `src/index.ts` exports an empty barrel
- [ ] tsconfig.json extends `../../../tsconfig.base.json` correctly

**Verify:**
- `pnpm install && pnpm exec nx build @lagless/2d-map-generator`
- `npx vitest run --project=@lagless/2d-map-generator`

---

### Task 2: Core types & interfaces

**Objective:** Define all shared types for the generator: geometry, PRNG interface, collision provider interface, feature interface, generated map, placed object, object definitions, map config, and the GeneratedRiver type.

**Dependencies:** Task 1

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/types/geometry.ts` — ReadonlyVec2, AABB, Polygon, MapCollisionShape
- Create: `libs/2d-map/2d-map-generator/src/lib/types/prng-interface.ts` — ISeededRandom
- Create: `libs/2d-map/2d-map-generator/src/lib/types/collision-provider.ts` — ICollisionProvider
- Create: `libs/2d-map/2d-map-generator/src/lib/types/feature.ts` — IMapFeature, GenerationContext
- Create: `libs/2d-map/2d-map-generator/src/lib/types/generated-map.ts` — GeneratedMap interface + implementation class
- Create: `libs/2d-map/2d-map-generator/src/lib/types/placed-object.ts` — PlacedObject, TerrainZone enum
- Create: `libs/2d-map/2d-map-generator/src/lib/types/object-def.ts` — MapObjectDef, MapObjectRegistry, etc
- Create: `libs/2d-map/2d-map-generator/src/lib/types/map-generator-config.ts` — MapGeneratorConfig
- Create: `libs/2d-map/2d-map-generator/src/lib/types/generated-river.ts` — GeneratedRiver, GeneratedGroundPatch
- Modify: `libs/2d-map/2d-map-generator/src/index.ts` — export all types

**Key Decisions / Notes:**
- `ReadonlyVec2` = `{ readonly x: number; readonly y: number }` — local type for all output interfaces. Accepts `IVector2Like` from @lagless/math (which is a superset with mutable fields).
- `Polygon` = `{ readonly points: ReadonlyVec2[]; readonly count: number }` (Vec2[] variant, not Float32Array)
- `AABB` = `{ readonly min: ReadonlyVec2; readonly max: ReadonlyVec2 }`
- `MapCollisionShape` = discriminated union: `{ type: 'circle' | 'aabb', ... }`
- `ISeededRandom` = `{ getFloat(): number; getRandomInt(from, to): number; getRandomIntInclusive(from, to): number }`. Note: intentionally minimal — `@lagless/core` PRNG has additional methods (getFloat53) that satisfy this interface via structural typing.
- `TerrainZone` = numeric enum (Grass=0, Beach=1, ...)
- `GeneratedMap` class implements the interface with a `Map<string, unknown>` internally
- `GeneratedRiver` uses `ReadonlyVec2[]` for splinePoints, waterPoly.points, shorePoly.points (NOT Float32Array — matches Polygon decision)

**Definition of Done:**
- [ ] All type files compile without errors
- [ ] Types are exported from index.ts
- [ ] `pnpm exec nx build @lagless/2d-map-generator` succeeds
- [ ] Unit test for GeneratedMap class: getFeatureOutput returns correct typed data

**Verify:**
- `pnpm exec nx build @lagless/2d-map-generator`
- `npx vitest run --project=@lagless/2d-map-generator`

---

### Task 3: MapGenerator orchestrator

**Objective:** Implement the `MapGenerator` class — the core orchestrator that accepts features, resolves dependencies via topological sort, and runs them in order to produce a `GeneratedMap`.

**Dependencies:** Task 2

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/core/map-generator.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/core/map-dimensions.ts` — `computeDimensions()` helper
- Create: `libs/2d-map/2d-map-generator/src/__tests__/core/map-generator.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`

**Key Decisions / Notes:**
- `addFeature(feature, config)` stores feature + config, returns `this` for chaining
- `generate(random, collision?)` does: validate deps → topo sort → create GenerationContext → run features in order → assemble GeneratedMap
- Topological sort: Kahn's algorithm (BFS). Error on missing required feature or cycles.
- `GenerationContext` implementation: wraps width/height/center/random/collision + output map. `getOutput<T>(id)` throws if feature not yet run. `hasFeature(id)` for soft deps.
- `computeDimensions(config)` = `{ width: baseWidth * scale + extension, height: baseHeight * scale + extension }`
- Default collision: `SpatialGridCollisionProvider` if none provided (placeholder — implemented in Task 6)
- Error messages: `'Feature "grass" requires "shore" which was not included.'`

**Definition of Done:**
- [ ] MapGenerator.addFeature() chains correctly
- [ ] Topological sort orders features by dependencies
- [ ] Missing dependency throws with clear error message
- [ ] Circular dependency detected and throws
- [ ] generate() runs features in dependency order and returns GeneratedMap
- [ ] GenerationContext.getOutput() returns correct typed data
- [ ] GenerationContext.hasFeature() returns correct boolean
- [ ] Determinism test: two generate() calls with same seed, same features, same config produce GeneratedMap instances where every feature output is deeply equal (compared via `expect().toEqual()` on each feature output)

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/core/map-generator.spec.ts`

---

### Task 4: Math utilities (jagged-aabb, polygon-utils)

**Objective:** Implement core math functions needed by terrain features: jagged AABB point generation and polygon utilities (point-in-polygon, polygon area, distance to segment).

**Dependencies:** Task 2

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/math/jagged-aabb.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/math/polygon-utils.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/math/collision-test.ts` — AABB/Circle overlap tests
- Create: `libs/2d-map/2d-map-generator/src/__tests__/math/jagged-aabb.spec.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/math/polygon-utils.spec.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/math/collision-test.spec.ts`

**Key Decisions / Notes:**
- `generateJaggedAabbPoints(aabb, divisionsX, divisionsY, variation, random)` — direct port from `survev/shared/utils/terrainGen.ts:15-56`. Returns `IVector2Like[]`.
- Counter-clockwise winding: bottom→right→top→left. Corner points are NOT offset.
- `pointInPolygon(point, polygon)` — ray casting algorithm. AABB pre-check for early exit.
- `polygonArea(points)` — shoelace formula.
- `distToSegmentSq(point, segA, segB)` — squared distance from point to line segment.
- `testCircleCircle`, `testCircleAabb`, `testAabbAabb` — basic overlap tests for collision provider.
- All functions use `IVector2Like` for input, `MathOps` for trig where needed.

**Definition of Done:**
- [ ] `generateJaggedAabbPoints` produces correct point count: 4 corners + 4 * divisions intermediate points
- [ ] Corner points are at exact AABB corners (no offset)
- [ ] Intermediate points have offsets within [-variation, +variation] range
- [ ] Winding order is counter-clockwise
- [ ] `pointInPolygon` correctly classifies inside/outside points for convex and concave polygons
- [ ] `polygonArea` returns correct area for known shapes (square, triangle)
- [ ] All collision test functions produce correct overlap results

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/math/`

---

### Task 5: Terrain features (Biome, Shore, Grass)

**Objective:** Implement the three terrain-generating features: BiomeFeature (pure data passthrough), ShoreFeature (jagged AABB polygon), GrassFeature (shore inset toward center).

**Dependencies:** Task 3, Task 4

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/features/biome-feature.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/features/shore-feature.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/features/grass-feature.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/features/biome-feature.spec.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/features/shore-feature.spec.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/features/grass-feature.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`

**Key Decisions / Notes:**
- `BiomeFeature`: id=`'biome'`, requires=`[]`. Config = color palette. Output = same as config (passthrough).
- `ShoreFeature`: id=`'shore'`, requires=`[]`. Uses `generateJaggedAabbPoints()`. Output: `{ polygon: Polygon, bounds: AABB }`.
  - Shore AABB: min=(inset, inset), max=(width-inset, height-inset). Uses config.divisions for both X and Y.
- `GrassFeature`: id=`'grass'`, requires=`['shore']`. For each shore point, offset toward center by `inset + random(-variation, variation)`.
  - Algorithm from `survev/shared/utils/terrainGen.ts:92-98`: direction = normalize(center - point), offset = grassInset + random variation.
  - Output: `{ polygon: Polygon, bounds: AABB, area: number }`. Area computed via `polygonArea()`.
- All features implement `IMapFeature<TConfig, TOutput>`.
- Tests use the shared mock `ISeededRandom` from `__tests__/helpers/mock-random.ts`.

**Definition of Done:**
- [ ] BiomeFeature passes through config as output
- [ ] ShoreFeature generates correct polygon with jagged edges
- [ ] GrassFeature generates polygon inset from shore toward center
- [ ] Grass polygon has same point count as shore polygon
- [ ] Grass area is smaller than shore area
- [ ] Features work correctly through MapGenerator pipeline (integration test)
- [ ] Deterministic: same seed produces identical polygons

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/features/`

---

### Task 6: SpatialGridCollisionProvider

**Objective:** Implement the built-in spatial grid collision provider for overlap detection during object placement.

**Dependencies:** Task 2

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/collision/spatial-grid-provider.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/collision/spatial-grid.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`

**Key Decisions / Notes:**
- Based on survev's `MapGrid` class from `survev/server/src/game/map.ts:114-181`.
- `cellSize = 32`. Grid dimensions = `Math.floor(width / cellSize)` x `Math.floor(height / cellSize)`.
- Uses `Map` + arrays approach (deviation from spec's `Uint32Array/Float64Array` — see Deviations table). Typed-array version is a follow-up alongside Float32Array polygon migration.
- Shape data stored in a `Map<number, {shape, posX, posY, rotation, scale}>`.
- `addShape(id, shape, posX, posY, rotation, scale)` — compute AABB, add to grid cells.
- `testShape(shape, posX, posY, rotation, scale)` — compute AABB, check grid cells for overlaps. Uses queryId for dedup (avoid testing same shape twice).
- `removeShape(id)` — remove from grid cells.
- Overlap tests: circle-circle, circle-AABB, AABB-AABB using functions from `collision-test.ts`.
- No rotation support for AABBs initially (axis-aligned only).
- Large objects (50+ units) will span many cells — acceptable for initial implementation. The Rapier provider (Task 12) handles large objects more efficiently.

**Definition of Done:**
- [ ] addShape registers a shape in the grid
- [ ] testShape returns true when new shape overlaps existing shapes
- [ ] testShape returns false when no overlap
- [ ] removeShape removes shape from grid
- [ ] clear() empties all shapes
- [ ] Circle-circle overlap detected correctly
- [ ] Circle-AABB overlap detected correctly
- [ ] AABB-AABB overlap detected correctly
- [ ] Shapes at grid cell boundaries are handled correctly
- [ ] QueryId dedup prevents double-testing shapes in multiple cells

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/collision/spatial-grid.spec.ts`

---

### Task 7: Spline math (Catmull-Rom, Spline class, river polygon)

**Objective:** Implement Catmull-Rom interpolation, the Spline class with arc-length parameterization, and river polygon generation from splines.

**Dependencies:** Task 2

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/math/catmull-rom.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/math/spline.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/math/river-polygon.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/math/catmull-rom.spec.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/math/spline.spec.ts`

**Key Decisions / Notes:**
- `catmullRom(t, p0, p1, p2, p3)` and `catmullRomDerivative(t, p0, p1, p2, p3)` — direct port from `survev/shared/utils/spline.ts:38-56`.
- `getControlPoints(t, points, looped)` — selects 4 control points for a given t parameter. Port from `survev/shared/utils/spline.ts:5-35`.
- `Spline` class — port from `survev/shared/utils/spline.ts:62-192`:
  - Constructor: copies points, builds arc-length lookup table (4 samples per point)
  - `getPos(t)`, `getTangent(t)`, `getNormal(t)` — Catmull-Rom evaluation
  - `getClosestTtoPoint(pos)` — closest point on spline (segment search + refinement)
  - `getTfromArcLen(arcLen)`, `getArcLen(t)` — arc-length parameterization
- `generateRiverPolygon(splinePoints, waterWidth, looped, otherRivers, mapBounds)` — port from `survev/shared/utils/river.ts` River constructor logic. Generates `waterPoly`, `shorePoly`, `waterWidths`, `shoreWidths`, AABB.
  - Non-looped: endpoint widening (`(1 + end^3 * 1.5) * width`)
  - Looped: radial offset from center (lake smoothing)
  - Map edge normal adjustment for flush ends

**Definition of Done:**
- [ ] catmullRom(0, ...) returns p1, catmullRom(1, ...) returns p2
- [ ] Spline.getPos(0) ≈ first point, getPos(1) ≈ last point
- [ ] Spline.getNormal returns perpendicular to tangent
- [ ] Spline.getClosestTtoPoint finds correct nearest point
- [ ] Arc-length functions are consistent: `getArcLen(getTfromArcLen(x)) ≈ x`
- [ ] River polygon generation produces correct water/shore polygons
- [ ] Non-looped rivers have widened endpoints
- [ ] River polygon endpoints at map edges are clipped/aligned to the map boundary AABB (test with river starting at (0, y) and ending at (width, y2))

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/math/`

---

### Task 8: River & Lake features

**Objective:** Implement RiverFeature (midpoint-subdivision rivers with weighted config) and LakeFeature (looped circular rivers).

**Dependencies:** Task 3, Task 7

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/features/river-feature.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/features/lake-feature.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/features/river-feature.spec.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/features/lake-feature.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`

**Key Decisions / Notes:**
- `RiverFeature`: id=`'river'`, requires=`[]` (soft dep on `'grass'` for validation).
  - Config: `weights` (weighted random river width sets), `subdivisionPasses` (5-6), `smoothness` (0.45), `masks`.
  - Algorithm: port from `survev/server/src/game/riverCreator.ts`:
    1. Weighted random select river width set
    2. For each width: random start/end on map edge, midpoint subdivision, mask validation
    3. Build `GeneratedRiver` via river-polygon.ts
  - Output: `{ rivers: GeneratedRiver[], normalRivers: GeneratedRiver[] }`
- `LakeFeature`: id=`'lake'`, requires=`[]`.
  - Config: array of lake definitions (odds, innerRad, outerRad, spawnBound)
  - Algorithm from `survev/server/src/game/riverCreator.ts:184-238`: 20 points on circle with variation, Catmull-Rom smoothing → 33 points, looped.
  - Output: `{ lakes: GeneratedRiver[] }`
- `GeneratedRiver` uses `ReadonlyVec2[]` for splinePoints and polygon points (NOT Float32Array — matches Polygon decision from Deviations table).

**Definition of Done:**
- [ ] RiverFeature generates rivers with correct subdivision
- [ ] River points are within map bounds
- [ ] Rivers respect mask exclusion zones
- [ ] Weighted random selection works correctly
- [ ] LakeFeature generates looped circular rivers
- [ ] Lake points form a roughly circular shape
- [ ] Lake output is a valid GeneratedRiver with looped=true
- [ ] Deterministic: same seed = same rivers/lakes

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/features/river-feature.spec.ts`
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/features/lake-feature.spec.ts`

---

### Task 9: TerrainQuery (zone classification)

**Objective:** Implement TerrainQuery — a utility that classifies a world position into a terrain zone (grass, beach, river, lake, etc.) by querying available terrain feature outputs.

**Dependencies:** Task 5, Task 7, Task 8

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/core/terrain-query.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/core/terrain-query.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`

**Key Decisions / Notes:**
- `TerrainQuery` is built from available feature outputs in GenerationContext.
- `classify(x, y): TerrainZone` — returns the zone for a given position:
  - If inside river waterPoly → River
  - If inside river shorePoly (but not waterPoly) → RiverShore
  - If inside lake → Lake
  - If inside grass polygon → Grass
  - If inside shore polygon (but not grass) → Beach
  - Otherwise → WaterEdge (ocean)
- Uses `pointInPolygon()` from polygon-utils.
- For rivers, also checks proximity to spline for "near river" classification.
- Graceful degradation: if no shore feature → all positions are Grass. If no rivers → skip river checks.
- Performance: AABB pre-check before polygon containment tests.

**Definition of Done:**
- [ ] Positions inside grass polygon classified as Grass
- [ ] Positions between shore and grass classified as Beach
- [ ] Positions outside shore classified as WaterEdge
- [ ] Positions inside river waterPoly classified as River
- [ ] Positions inside river shorePoly classified as RiverShore
- [ ] Works with no terrain features (defaults to Grass)
- [ ] AABB pre-check skips polygon test for distant points

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/core/terrain-query.spec.ts`

---

### Task 10: ObjectPlacementFeature

**Objective:** Implement the ObjectPlacementFeature — the most complex feature. Handles all placement stage types (location, fixed, random, density) with collision checking and terrain zone preferences.

**Dependencies:** Task 3, Task 6, Task 9

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/features/object-placement-feature.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`

**Key Decisions / Notes:**
- Config: `{ registry: MapObjectRegistry, stages: PlacementStage[] }`
- Stage types (from spec):
  - `LocationStage`: fixed position + radius, max 5000 attempts
  - `FixedStage`: fixed count, 500 attempts per object (5000 if important). Placement is best-effort — placed count may be less than requested if all attempts fail.
  - `RandomStage`: choose N from M types
  - `DensityStage`: count = density * (mapArea / 250000)
- For each placement attempt:
  1. Generate random position (within terrain zone preference if specified)
  2. Get MapObjectDef from registry for collision shape, scale range, orientations
  3. Random scale from scaleRange, random orientation from orientations
  4. Test collision via `ICollisionProvider.testShape()`
  5. If no collision, add shape to collision provider and create PlacedObject
  6. Handle children: for each ChildObjectDef, compute child position/rotation, add to collision, create child PlacedObject
- TerrainQuery used for zone-preference filtering.
- Output: `{ objects: PlacedObject[] }`

**Definition of Done:**
- [ ] LocationStage places object near specified position
- [ ] FixedStage attempts to place specified count, with at most 500 attempts per object (5000 if important). Placed count may be less than requested if all attempts fail.
- [ ] RandomStage correctly selects N from M types
- [ ] DensityStage computes count proportional to map area
- [ ] Collision checking prevents overlaps
- [ ] Terrain zone preferences filter placement positions
- [ ] Children placed at correct offsets from parent
- [ ] Important flag increases max attempts
- [ ] Works without terrain features (random placement within map bounds)
- [ ] Deterministic: same seed = same placements

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/features/object-placement-feature.spec.ts`

---

### Task 11: GroundPatchFeature & BridgeFeature

**Objective:** Implement GroundPatchFeature (collects ground patches from placed objects) and BridgeFeature (places bridges at river crossings).

**Dependencies:** Task 8, Task 10

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/features/ground-patch-feature.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/features/bridge-feature.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/features/ground-patch-feature.spec.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/features/bridge-feature.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`

**Key Decisions / Notes:**
- `GroundPatchFeature`: id=`'groundPatch'`, requires=`['objectPlacement']`.
  - Iterates placed objects, looks up MapObjectDef.groundPatches in registry.
  - For each ground patch def: compute world-space AABB (offset from object pos, apply rotation/scale).
  - Output: `{ patches: GeneratedGroundPatch[] }`. Fields: minX/Y, maxX/Y, color, roughness, offsetDist, order, useAsMapShape.
  - Config: `{ extraPatches?: GroundPatchDef[] }` for manual patches.
- `BridgeFeature`: id=`'bridge'`, requires=`['river']`.
  - Config: bridge types per size category, max per size.
  - Algorithm: for each normal (non-looped) river, sample spline at intervals to find suitable bridge positions.
  - Bridge size based on river width: 5-8 = medium, 9-19 = large, 20+ = xlarge.
  - Output: `{ bridges: PlacedObject[] }`.

**Definition of Done:**
- [ ] GroundPatchFeature collects patches from placed objects
- [ ] Patch world coordinates computed correctly from object position + offset
- [ ] Extra patches added from config
- [ ] BridgeFeature places bridges on rivers
- [ ] Bridge size matches river width category
- [ ] Max bridge count per size respected
- [ ] Bridge rotation aligned perpendicular to river

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/features/ground-patch-feature.spec.ts`
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/features/bridge-feature.spec.ts`

---

### Task 12: RapierCollisionProvider

**Objective:** Implement the optional Rapier-based collision provider for accurate overlap detection with rotation support.

**Dependencies:** Task 2

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/collision/rapier-provider.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/collision/rapier-provider.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`

**Key Decisions / Notes:**
- Accepts initialized Rapier WASM module in constructor: `new RapierCollisionProvider(RAPIER)`.
- Creates internal `RAPIER.World` with zero gravity.
- `addShape()`: creates a sensor collider (no physics response) at the given position/rotation.
- `testShape()`: creates temp collider, uses `world.intersectionTest()` to check overlaps, removes temp.
- `removeShape()`: removes collider by stored handle.
- Supports rotated AABBs (cuboid colliders) unlike SpatialGrid.
- Test needs `@dimforge/rapier2d-deterministic-compat` installed — skip tests if not available.

**Definition of Done:**
- [ ] addShape creates sensor collider in Rapier world
- [ ] testShape detects overlapping shapes
- [ ] testShape returns false for non-overlapping shapes
- [ ] removeShape removes collider
- [ ] clear() empties all colliders
- [ ] Rotated AABB overlaps detected correctly
- [ ] Circle overlaps detected correctly

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/collision/rapier-provider.spec.ts`

---

### Task 13: PlacesFeature & Presets

**Objective:** Implement PlacesFeature (converts normalized positions to world coordinates) and preset convenience functions.

**Dependencies:** Task 5

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/features/places-feature.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/presets/standard-map.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/presets/standard-biome.ts`
- Create: `libs/2d-map/2d-map-generator/src/__tests__/features/places-feature.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`

**Key Decisions / Notes:**
- `PlacesFeature`: id=`'places'`, requires=`[]`.
  - Config: `{ places: Array<{ name: string; pos: IVector2Like }> }` — positions normalized 0-1.
  - Output: `{ places: Array<{ name: string; x: number; y: number }> }` — world coordinates.
  - Conversion: `x = pos.x * ctx.width`, `y = pos.y * ctx.height`.
- `STANDARD_BIOME` constant: default color palette matching survev standard biome.
- `createStandardGenerator(options?)`: convenience function that creates a MapGenerator with standard config and adds Biome+Shore+Grass+River+Lake features with default configs.
  - Options: `{ scale?: 'small' | 'large' }` — affects map scale factor.

**Definition of Done:**
- [ ] PlacesFeature converts normalized positions to world coords
- [ ] STANDARD_BIOME has all required color fields
- [ ] createStandardGenerator returns configured MapGenerator
- [ ] Standard generator produces valid GeneratedMap with terrain features

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator src/__tests__/features/places-feature.spec.ts`

---

### Task 14: Renderer — MapTerrainRenderer

**Objective:** Implement the MapTerrainRenderer that reads feature outputs and draws terrain layers using Pixi.js 8 Graphics.

**Dependencies:** Task 5 (needs types), Task 1 (renderer package)

**Files:**
- Create: `libs/2d-map/2d-map-renderer/src/lib/core/map-terrain-renderer.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/layers/background-layer.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/layers/beach-layer.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/layers/grass-layer.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/layers/ocean-layer.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/layers/grid-layer.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/utils/polygon-draw.ts`
- Modify: `libs/2d-map/2d-map-renderer/src/index.ts`

**Key Decisions / Notes:**
- `MapTerrainRenderer.buildTerrain(map, options?)` — reads biome/shore/grass outputs, creates Container with layers.
- Layer order (bottom to top): background → beach → grass (if canvasMode) → ocean → grid.
  - Beach layer: draw shore polygon, cut grass polygon as hole.
  - Ocean layer: draw full-map rect, cut shore polygon as hole.
  - Grid layer: lines every gridSize units, black alpha=0.15.
- `updateCamera(screenOriginX, screenOriginY, scaleX, scaleY)` — sets container position/scale.
- `destroy()` — cleans up Pixi resources.
- Uses `PIXI.Graphics` for polygon drawing. Terrain drawn once, cached.
- `polygonDraw.ts`: utility to draw a polygon (moveTo first point, lineTo rest, closePath).
- No tests (visual code).

**Definition of Done:**
- [ ] MapTerrainRenderer creates Container with children in correct z-order (verified by `buildTerrain` returning Container with children.length >= 4)
- [ ] Polygon drawing utility works for arbitrary point arrays
- [ ] Camera update transforms container position/scale
- [ ] destroy() cleans up resources
- [ ] Compiles without errors: `pnpm exec nx build @lagless/2d-map-renderer`

**Verify:**
- `pnpm exec nx build @lagless/2d-map-renderer`

---

### Task 15: Renderer — River, ground patch layers & MinimapRenderer

**Objective:** Add river rendering layers to MapTerrainRenderer and implement MinimapRenderer.

**Dependencies:** Task 14

**Files:**
- Create: `libs/2d-map/2d-map-renderer/src/lib/layers/river-shore-layer.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/layers/river-water-layer.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/layers/ground-patch-layer.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/utils/jagged-aabb-draw.ts`
- Create: `libs/2d-map/2d-map-renderer/src/lib/core/minimap-renderer.ts`
- Modify: `libs/2d-map/2d-map-renderer/src/lib/core/map-terrain-renderer.ts` — add river/patch layers
- Modify: `libs/2d-map/2d-map-renderer/src/index.ts`

**Key Decisions / Notes:**
- Full layer order: background → beach → grass → patches(order=0) → river shores → river water → ocean → grid → patches(order=1).
- River shore layer: draw each river's shorePoly with riverbank color.
- River water layer: draw each river's waterPoly with water color.
- Ground patch layer: draw jagged AABB rectangles (uses `generateJaggedAabbPoints` from generator math).
  - Divisions computed from roughness: `divisionsX = round(width * roughness / offsetDist)`.
- `MinimapRenderer`:
  - `buildMinimap(map, size)` → renders terrain to `RenderTexture` at given size.
  - `addObjectShapes(objects, registry)` — draws simplified shapes (circles/rects) for objects that have mapDisplay.
  - `addPlaceLabels(places)` — draws text labels.
  - `destroy()` — cleans up.
- No tests (visual code).

**Definition of Done:**
- [ ] River layers render shore and water polygons
- [ ] Ground patch layers render jagged rectangles
- [ ] Layer ordering correct (patches order 0 under grid, order 1 over grid)
- [ ] MinimapRenderer creates render texture
- [ ] Object shapes drawn on minimap
- [ ] Place labels drawn on minimap
- [ ] Compiles without errors

**Verify:**
- `pnpm exec nx build @lagless/2d-map-renderer`

---

### Task 16: Integration in 2d-map-test

**Objective:** Create a minimal standalone demo in `2d-map-test-game` that generates and renders a map, verifying the full pipeline visually.

**Dependencies:** Task 13, Task 15

**Files:**
- Modify: `2d-map-test/2d-map-test-game/package.json` — add deps on `@lagless/2d-map-generator`, `@lagless/2d-map-renderer`
- Create: demo page/route in `2d-map-test/2d-map-test-game/src/` that generates and renders a map

**Key Decisions / Notes:**
- Create a **separate route/component** that only demonstrates map generation + rendering. Do NOT modify the existing simulation or game logic.
- Use `createStandardGenerator()` with some object placements (basic tree/stone defs).
- Create a simple `MapObjectRegistry` with minimal definitions for visual testing.
- Use `SpatialGridCollisionProvider`.
- Display: generated terrain + rivers, minimap, camera panning.
- This is visual verification only — no automated tests.

**Definition of Done:**
- [ ] Demo route generates and displays a map
- [ ] Shore, beach, grass layers visible
- [ ] Rivers and lakes visible (if present)
- [ ] Grid lines visible
- [ ] App compiles and runs without errors

**Verify:**
- `pnpm exec nx serve @lagless/2d-map-test-game` (visual check)

---

## Testing Strategy

- **Unit tests:** Every feature, math utility, collision provider, and core class has unit tests. Use vitest with `@lagless/math` MathOps.init() in beforeAll.
- **Shared test helper:** `src/__tests__/helpers/mock-random.ts` — deterministic `ISeededRandom` for all tests.
- **Determinism test:** MapGenerator with same seed + same features = deeply equal output per feature (compared via `expect().toEqual()`). In `map-generator.spec.ts`.
- **Integration:** 2d-map-test app for visual verification (standalone demo route).
- **No tests for:** Renderer code (visual), integration app code.
- **Run:** `npx vitest run --project=@lagless/2d-map-generator`

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MathOps determinism differs from survev's Math.* | Medium | High | Use MathOps for all trig in generator. Accept minor visual differences from survev reference. |
| River polygon generation edge cases (map bounds, intersections) | Medium | Medium | Port survev's clipRayToPoly and map-edge normal logic carefully. Test river at map boundaries specifically. |
| Rapier WASM initialization in tests | Low | Medium | Use `beforeAll` with RAPIER.init(). Skip tests if WASM not available. |
| SpatialGrid missing shapes at cell boundaries | Medium | Medium | Ensure shapes are added to ALL cells their AABB overlaps. Test with shapes on boundaries. |
| Large task count (16 tasks) | Medium | Low | Tasks are ordered by dependency. Each is independently testable. Can pause after any phase. |
| IVector2Like mutation of shared polygon data | Medium | High | Use `ReadonlyVec2` for all output types. Features MUST clone before modifying points from getOutput(). |

## Goal Verification

### Truths
1. A MapGenerator with BiomeFeature + ShoreFeature + GrassFeature produces a GeneratedMap with correct terrain polygons
2. Adding RiverFeature generates rivers with water/shore polygons from subdivided splines
3. ObjectPlacementFeature places objects without overlaps, respecting terrain zones and stage configurations
4. SpatialGridCollisionProvider correctly detects shape overlaps in a spatial grid
5. Same seed + same features = identical GeneratedMap (determinism)
6. MapTerrainRenderer produces a Pixi.js Container with terrain layers in correct z-order
7. Features can be composed in any valid dependency order — MapGenerator resolves via topological sort

### Artifacts
1. `libs/2d-map/2d-map-generator/` — full generator library with types, core, features, math, collision, presets
2. `libs/2d-map/2d-map-renderer/` — renderer library with terrain/minimap renderers
3. `libs/2d-map/2d-map-generator/src/__tests__/` — comprehensive test suite

### Key Links
1. MapGenerator → IMapFeature.generate() → GenerationContext → GeneratedMap
2. ShoreFeature → generateJaggedAabbPoints() → Polygon
3. RiverFeature → Spline → generateRiverPolygon() → GeneratedRiver
4. ObjectPlacementFeature → TerrainQuery + ICollisionProvider → PlacedObject[]
5. MapTerrainRenderer → GeneratedMap.getFeatureOutput() → Pixi.js Container

## Open Questions
None — all decisions made during planning.
