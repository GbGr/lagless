# 2D Map Generator & Renderer Code Quality Refactor

Created: 2026-03-09
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Clean up code quality in `@lagless/2d-map-generator` and `@lagless/2d-map-renderer` — remove legacy API, dead code, redundant fields, improve type safety, fix file structure.
**Architecture:** Pure refactoring — no functional changes. All existing tests must continue to pass. Consumers (`map-test-runner-with-map.ts`, renderer) updated to use new API.
**Tech Stack:** TypeScript, Vitest

## Scope

### In Scope
- Remove legacy `getFeatureOutput()` method (replace with type-safe `get()`)
- Add type-safe `ctx.get(FeatureClass)` to `GenerationContext`
- Remove `features` property from `IGeneratedMap`
- Move `GeneratedMap` class from `types/` to `core/`
- Remove unused `RiverConfig.smoothness`
- Remove redundant `effX/effY` from `SpatialGridCollisionProvider`
- Remove unnecessary point copy in `river-polygon.ts` return
- Replace `any` in `rapier-provider.ts` with typed Rapier interface
- Remove duplicate re-exports from `standard-map.ts`
- Update all consumers (features, renderer, test game)

### Out of Scope
- Feature ID pattern (static + instance) — keep as-is per user decision
- `Polygon.count` field — keep for consistency
- Functional changes to generation algorithms
- New features or new tests beyond what refactoring requires

## Context for Implementer

- **Patterns to follow:** `IGeneratedMap.get<T>(feature: { readonly id: FeatureId })` — the type-safe pattern already exists on the map, extend to `GenerationContext`
- **Conventions:** ESM imports with `.js` extension, `@lagless/source` custom condition for cross-package resolution
- **Key files:**
  - `libs/2d-map/2d-map-generator/src/lib/types/generated-map.ts` — `GeneratedMap` class + `IGeneratedMap` interface
  - `libs/2d-map/2d-map-generator/src/lib/core/map-generator.ts` — `GenerationContextImpl` + `MapGenerator`
  - `libs/2d-map/2d-map-generator/src/lib/types/feature.ts` — `GenerationContext` interface
  - `libs/2d-map/2d-map-generator/src/index.ts` — barrel exports
  - `libs/2d-map/2d-map-renderer/src/lib/core/map-terrain-renderer.ts` — uses `map.get()`
  - `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts` — consumer
- **Gotchas:** `const enum` won't work across packages (vitest isolatedModules). All enums must be regular `enum`.
- **Domain context:** `GenerationContext` is the internal context passed to features during map generation. `IGeneratedMap` is the public result returned to consumers. Both have `get()` but `GenerationContext` currently uses the old `getOutput()` method.

## Feature Inventory

| File | Function/Symbol | Task # | Notes |
|------|----------------|--------|-------|
| `types/generated-map.ts` | `IGeneratedMap.getFeatureOutput()` | Task 1 | Remove |
| `types/generated-map.ts` | `IGeneratedMap.features` | Task 1 | Remove |
| `types/generated-map.ts` | `GeneratedMap` class | Task 2 | Move to `core/` |
| `types/feature.ts` | `GenerationContext.getOutput()` | Task 3 | Replace with `get()` |
| `core/map-generator.ts` | `GenerationContextImpl.getOutput()` → `get()` | Task 3 | Rename |
| `types/feature-configs.ts` | `RiverConfig.smoothness` | Task 4 | Remove |
| `collision/spatial-grid-provider.ts` | `StoredShape.effX/effY` | Task 4 | Remove, use `posX/posY` |
| `math/river-polygon.ts` | `splinePoints.map(...)` copy | Task 4 | Remove |
| `collision/rapier-provider.ts` | 5x `any` | Task 5 | Type with interface |
| `presets/standard-map.ts` | re-exports lines 13-14 | Task 4 | Remove |
| All features | `ctx.getOutput<T>(FeatureId.X)` | Task 3 | Update to `ctx.get<T>(XFeature)` |
| `types/index.ts` | barrel exports | Task 1,2 | Update |
| `index.ts` | root barrel | Task 2 | Update |

## Progress Tracking

- [x] Task 1: Remove legacy API from IGeneratedMap
- [x] Task 2: Move GeneratedMap class to core/
- [x] Task 3: Type-safe get() on GenerationContext + update all features
- [x] Task 4: Dead code and redundant fields cleanup
- [x] Task 5: Type rapier-provider.ts (remove `any`)
- [x] Task 6: Update consumers (renderer, test game)

**Total Tasks:** 6 | **Completed:** 6 | **Remaining:** 0

## Implementation Tasks

### Task 1: Remove legacy API from IGeneratedMap

**Objective:** Remove `getFeatureOutput()` and `features` from the public `IGeneratedMap` interface. Keep only the type-safe `get()`.
**Dependencies:** None

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/generated-map.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/index.ts`
- Modify: `libs/2d-map/2d-map-generator/README.md`
- Test: `libs/2d-map/2d-map-generator/src/__tests__/types/generated-map.spec.ts`
- Test: `libs/2d-map/2d-map-generator/src/__tests__/core/map-generator.spec.ts` (migrate getFeatureOutput → get)

**Key Decisions / Notes:**
- Remove `getFeatureOutput<T>(featureId: FeatureId): T | undefined` from `IGeneratedMap` interface
- Remove `readonly features: ReadonlyMap<FeatureId, unknown>` from `IGeneratedMap` interface
- Remove `getFeatureOutput()` and `features` getter from `GeneratedMap` class too (no production code uses them on the concrete class). Keep only `setFeatureOutput()` (internal, used by `MapGenerator`).
- Update `generated-map.spec.ts` to remove tests for removed methods
- Update `map-generator.spec.ts` to migrate 4 `getFeatureOutput()` calls to `get()`
- Update `libs/2d-map/2d-map-generator/README.md` — remove `getFeatureOutput` example (line ~180)

**Definition of Done:**
- [ ] `IGeneratedMap` only has `width`, `height`, `gridSize`, `get<T>()`
- [ ] `GeneratedMap` class has no `getFeatureOutput()` or `features` getter
- [ ] `map-generator.spec.ts` uses `map.get()` not `map.getFeatureOutput()`
- [ ] README documents only `map.get()` access pattern
- [ ] All tests pass
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`

---

### Task 2: Move GeneratedMap class from types/ to core/

**Objective:** Move the `GeneratedMap` class (implementation) out of `types/` into `core/`. Keep the `IGeneratedMap` interface in `types/`.
**Dependencies:** Task 1

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/core/generated-map.ts` (moved from types)
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/generated-map.ts` (keep only interface)
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/index.ts` (remove GeneratedMap class export)
- Modify: `libs/2d-map/2d-map-generator/src/lib/core/map-generator.ts` (import from local)
- Modify: `libs/2d-map/2d-map-generator/src/index.ts` (export GeneratedMap from core/)
- Test: existing tests sufficient

**Key Decisions / Notes:**
- `types/generated-map.ts` becomes a pure interface file (only `IGeneratedMap`)
- `core/generated-map.ts` contains the `GeneratedMap` class
- `map-generator.ts` imports `GeneratedMap` from `./generated-map.js` (same directory)
- Root barrel `index.ts` updates export path

**Definition of Done:**
- [ ] `types/generated-map.ts` only contains `IGeneratedMap` interface
- [ ] `core/generated-map.ts` contains `GeneratedMap` class
- [ ] All imports resolve correctly
- [ ] All tests pass

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`
- `npx tsc --noEmit -p libs/2d-map/2d-map-generator/tsconfig.json`

---

### Task 3: Type-safe get() on GenerationContext + update all features

**Objective:** Replace `ctx.getOutput<T>(FeatureId.X)` with `ctx.get<T>(XFeature)` in all features. Add `get()` to `GenerationContext` interface. Remove `getOutput()`.
**Dependencies:** Task 1

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/feature.ts` — add `get<T>()`, remove `getOutput<T>()`
- Modify: `libs/2d-map/2d-map-generator/src/lib/core/map-generator.ts` — rename in `GenerationContextImpl`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/grass-feature.ts` — `ctx.getOutput<ShoreOutput>(FeatureId.Shore)` → `ctx.get<ShoreOutput>(ShoreFeature)`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/bridge-feature.ts` — update call
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts` — update 4 calls
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/ground-patch-feature.ts` — update call
- Test: `libs/2d-map/2d-map-generator/src/__tests__/core/map-generator.spec.ts` — rename `getOutput:` → `get:` in mock
- Test: `libs/2d-map/2d-map-generator/src/__tests__/features/grass-feature.spec.ts` — rename mock
- Test: `libs/2d-map/2d-map-generator/src/__tests__/features/river-feature.spec.ts` — rename mock
- Test: `libs/2d-map/2d-map-generator/src/__tests__/features/lake-feature.spec.ts` — rename mock
- Test: `libs/2d-map/2d-map-generator/src/__tests__/features/bridge-feature.spec.ts` — rename mock
- Test: `libs/2d-map/2d-map-generator/src/__tests__/features/places-feature.spec.ts` — rename mock
- Test: `libs/2d-map/2d-map-generator/src/__tests__/features/object-placement-feature.spec.ts` — rename mock
- Test: `libs/2d-map/2d-map-generator/src/__tests__/features/ground-patch-feature.spec.ts` — rename mock

**Key Decisions / Notes:**
- Signature: `get<T>(feature: { readonly id: FeatureId }): T` (throws if not found, same as current `getOutput`)
- **Intentional asymmetry:** `GenerationContext.get()` throws (features declare deps, missing = bug), `IGeneratedMap.get()` returns `T | undefined` (consumers may query optional features)
- `hasFeature(featureId: FeatureId)` stays as-is (still takes raw FeatureId — only used in `ObjectPlacementFeature` for optional deps)
- Features now import their dependency feature classes (e.g., `GrassFeature` imports `ShoreFeature`), not just `FeatureId`
- `GenerationContextImpl` internal methods rename: `setOutput` stays (internal), `getOutput` → `get`

**Definition of Done:**
- [ ] `GenerationContext.getOutput` removed, replaced by `get<T>(feature)`
- [ ] All features use `ctx.get<ShoreOutput>(ShoreFeature)` pattern
- [ ] All 8 feature test files have mock `get:` instead of `getOutput:`
- [ ] All tests pass
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`

---

### Task 4: Dead code and redundant fields cleanup

**Objective:** Remove unused code and redundant data.
**Dependencies:** None

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/feature-configs.ts` — remove `smoothness` from `RiverConfig`
- Modify: `libs/2d-map/2d-map-generator/src/lib/collision/spatial-grid-provider.ts` — remove `effX/effY`, use `posX/posY`
- Modify: `libs/2d-map/2d-map-generator/src/lib/math/river-polygon.ts` — remove `splinePoints.map()` copy in return
- Modify: `libs/2d-map/2d-map-generator/src/lib/presets/standard-map.ts` — remove lines 13-14 re-exports, remove `smoothness: 0.45` from river config
- Modify: `libs/2d-map/2d-map-generator/README.md` — remove `smoothness` from config example
- Test: `libs/2d-map/2d-map-generator/src/__tests__/features/river-feature.spec.ts` — remove `smoothness` from 3 test configs

**Key Decisions / Notes:**
- `RiverConfig.smoothness` is declared but never read in `RiverFeature.generate()`. Remove from interface.
- `standard-map.ts` has `createStandardGenerator` which passes `smoothness: 0.45` to RiverFeature config — remove that too.
- `StoredShape.effX/effY` are assigned `posX/posY` and used everywhere instead of `posX/posY` directly. Replace all `effX/effY` with `posX/posY` and drop the fields.
- `river-polygon.ts` line 81: `splinePoints.map(p => ({ x: p.x, y: p.y }))` copies readonly points into new objects — unnecessary since `ReadonlyVec2` is structural and already immutable. Pass `splinePoints` directly.

**Definition of Done:**
- [ ] `RiverConfig` no longer has `smoothness`
- [ ] `StoredShape` no longer has `effX/effY`
- [ ] `generateRiverPolygon` return doesn't copy splinePoints
- [ ] `standard-map.ts` has no re-exports
- [ ] All tests pass

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`

---

### Task 5: Type rapier-provider.ts (remove `any`)

**Objective:** Define a minimal typed interface for the Rapier module to eliminate all `eslint-disable` comments and `any` usage.
**Dependencies:** None

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/collision/rapier-provider.ts` — add interface, use it
- Test: `libs/2d-map/2d-map-generator/src/__tests__/collision/rapier-provider.spec.ts`

**Key Decisions / Notes:**
- Define `RapierModule2dLike` interface with only the methods used: `Vector2(x, y)`, `World(gravity)`, `RigidBodyDesc.fixed().setTranslation().setRotation()`, `ColliderDesc.ball()/.cuboid()`, `Ball(r)`, `Cuboid(hw, hh)`, `world.createRigidBody()`, `world.createCollider()`, `world.removeRigidBody()`, `world.getRigidBody()`, `world.intersectionsWithShape()`, `world.step()`
- Keep interface in same file (private implementation detail)
- Remove all `eslint-disable-next-line` comments

**Definition of Done:**
- [ ] Zero `eslint-disable` comments in rapier-provider.ts
- [ ] Zero `any` usage
- [ ] Test mock satisfies typed interface (passes to constructor without errors)
- [ ] All tests pass
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`
- `pnpm exec nx lint @lagless/2d-map-generator`

---

### Task 6: Update consumers (renderer, test game)

**Objective:** Update `@lagless/2d-map-renderer` and `2d-map-test-simulation` to use the cleaned API. Fix any breakage from Tasks 1-5.
**Dependencies:** Tasks 1, 2, 3, 4, 5

**Files:**
- Modify: `libs/2d-map/2d-map-renderer/src/lib/core/map-terrain-renderer.ts` — ensure `map.get()` calls work
- Modify: `libs/2d-map/2d-map-renderer/src/lib/core/minimap-renderer.ts` — same
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts` — ensure imports resolve
- Test: `2d-map-test/2d-map-test-simulation/src/lib/__tests__/map-data.spec.ts` — update mock IGeneratedMap (add `get`, remove `features`/`getFeatureOutput`)
- Test: `npx vitest run --project=@lagless/2d-map-renderer`

**Key Decisions / Notes:**
- Renderer already uses `map.get<T>(FeatureClass)` — should work without changes
- Test game already uses the new API — verify imports still resolve after `GeneratedMap` move
- Check that `index.ts` barrel exports include everything consumers need
- Run both test suites + typecheck

**Definition of Done:**
- [ ] Renderer builds and tests pass
- [ ] Test game typechecks
- [ ] All generator tests pass
- [ ] No diagnostics errors across both packages

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`
- `npx vitest run --project=@lagless/2d-map-renderer`
- `npx tsc --noEmit -p 2d-map-test/2d-map-test-simulation/tsconfig.json`

---

## Testing Strategy

- **Unit:** All existing tests must pass — no functional changes
- **Type safety:** `tsc --noEmit` on generator, renderer, and test game
- **Lint:** `nx lint` on generator to verify no eslint-disable remains
- **No new tests needed** — this is removing dead code and renaming methods, not adding behavior

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking consumer imports after GeneratedMap move | Medium | Low | Re-export from barrel `index.ts`, run tsc on all consumers |
| Rapier interface missing method used by tests | Low | Low | Read test mock before defining interface |
| `smoothness` removal breaks config in user code | Low | Low | Search for `smoothness` in all files before removing |

## Goal Verification

### Truths
1. `IGeneratedMap` has no `getFeatureOutput()` or `features` property
2. `GeneratedMap` class lives in `core/generated-map.ts`, not `types/`
3. All feature classes use `ctx.get<T>(FeatureClass)` instead of `ctx.getOutput<T>(FeatureId.X)`
4. `RiverConfig` has no `smoothness` field
5. `SpatialGridCollisionProvider` has no `effX/effY` fields
6. `RapierCollisionProvider` has zero `any` and zero `eslint-disable` comments
7. All tests pass, all typechecks pass

### Artifacts
- `libs/2d-map/2d-map-generator/src/lib/types/generated-map.ts` — clean interface only
- `libs/2d-map/2d-map-generator/src/lib/core/generated-map.ts` — class implementation
- `libs/2d-map/2d-map-generator/src/lib/collision/rapier-provider.ts` — typed, no `any`

### Key Links
- `GenerationContext.get()` → `GenerationContextImpl.get()` → features use it
- `IGeneratedMap.get()` → `GeneratedMap.get()` → renderer uses it
- `rapier-provider.ts` → `RapierModule2dLike` interface → test mock must match
