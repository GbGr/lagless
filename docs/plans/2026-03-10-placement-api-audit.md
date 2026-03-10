# Object Placement API Audit Plan

Created: 2026-03-10
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Clean up object placement API — remove dead code, fix confusing naming, eliminate redundant computation.
**Architecture:** Pure refactoring of `ObjectPlacementFeature`, `PlacedObject` interface, and `LocationStage` interface. No behavioral changes — all existing tests must produce identical results (modulo field removal).
**Tech Stack:** TypeScript, @lagless/2d-map-generator

## Scope

### In Scope
- Remove dead `ori` field from `PlacedObject` interface and all producers/consumers
- Rename `LocationStage.retryOnFailure` to `optional` (same boolean direction: `optional: true` = OK to skip, `optional: false` = must place)
- Cache `computePlacementBounds` result — compute once per def, not per attempt
- Extract default orientations constant to avoid per-call allocation

### Out of Scope
- Behavioral changes to placement logic
- Changes to `SpatialGridCollisionProvider` or `TerrainQuery`
- Changes to `includeSensorsInBounds` feature (already audited and clean)
- Performance optimization of `pointInPolygon` (not a bottleneck)

## Context for Implementer

- **Patterns to follow:** Existing code style in `object-placement-feature.ts`, kebab-case filenames, Vitest tests in `__tests__/`
- **Key files:**
  - `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts` — placement logic (305 lines)
  - `libs/2d-map/2d-map-generator/src/lib/types/placed-object.ts` — `PlacedObject` interface
  - `libs/2d-map/2d-map-generator/src/lib/types/feature-configs.ts` — `LocationStage` with `retryOnFailure`
  - `libs/2d-map/2d-map-generator/src/__tests__/features/object-placement-feature.spec.ts` — 25 tests (712 lines)
- **Gotchas:**
  - `PlacedObject.ori` is set in `tryPlace` (line 283) and child creation (line 270) — remove both
  - `retryOnFailure` naming is confusing — `true` = "skip if failed", `false` = "force place". Renaming to `optional` makes this natural: `optional: true` = "can be skipped". Same boolean direction, no inversion.
  - Test files in `sort-placed-objects.spec.ts`, `create-map-colliders.spec.ts`, `ground-patch-feature.spec.ts`, `extract-canopy-zones.spec.ts`, `map-object-renderer.spec.ts` all create `PlacedObject` with `ori: 0` — must update all
  - `computePlacementBounds` must still be called per-def, NOT cached across defs

## Progress Tracking

- [x] Task 1: Remove `ori` from `PlacedObject`
- [x] Task 2: Rename `retryOnFailure` to `optional`
- [x] Task 3: Cache bounds and extract default orientations

**Total Tasks:** 3 | **Completed:** 3 | **Remaining:** 0

## Implementation Tasks

### Task 1: Remove `ori` from `PlacedObject`

**Objective:** Remove the dead `ori` field from `PlacedObject` interface and all code that sets or references it.
**Dependencies:** None

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/placed-object.ts` — remove `ori` from interface
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts` — remove `ori` from object creation (lines 270, 283)
- Modify: `libs/2d-map/2d-map-generator/src/__tests__/features/object-placement-feature.spec.ts` — remove `ori: 0` from test expectations if any
- Modify: `libs/2d-map/2d-map-generator/src/__tests__/utils/sort-placed-objects.spec.ts` — remove `ori: 0`
- Modify: `libs/2d-map/2d-map-generator/src/__tests__/physics/create-map-colliders.spec.ts` — remove `ori: 0`
- Modify: `libs/2d-map/2d-map-generator/src/__tests__/features/ground-patch-feature.spec.ts` — remove `ori: 0`
- Modify: `libs/2d-map/2d-map-generator/src/__tests__/utils/extract-canopy-zones.spec.ts` — remove `ori: 0`
- Modify: `libs/2d-map/2d-map-renderer/src/__tests__/map-object-renderer.spec.ts` — remove `ori: 0`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/bridge-feature.ts` — remove `ori: 0` from PlacedObject literal in `placeBridge` (line 68)

**Key Decisions / Notes:**
- `ori` was always set to the same value as `rotation` for parent objects. For children, `ori: childDef.ori` while `rotation: childOri` — but neither consumer ever reads `ori`.
- This is a **breaking change** for the public `PlacedObject` type — any external code creating `PlacedObject` objects will need to remove the field.
- `ori` in `ChildObjectDef` is UNRELATED and must NOT be touched — it's `childDef.ori` (orientation of the child def), not `PlacedObject.ori`.

**Definition of Done:**
- [ ] `ori` removed from `PlacedObject` interface in `placed-object.ts`
- [ ] `ori` removed from object/child creation in `object-placement-feature.ts`
- [ ] All test files updated (no `ori: 0` in mock PlacedObjects)
- [ ] All tests pass
- [ ] `grep -r 'ori:' libs/2d-map/2d-map-generator/src/lib/types/placed-object.ts` returns no matches (field removed)
- [ ] Remaining `.ori` references in `object-placement-feature.ts` are exclusively `childDef.ori` (ChildObjectDef property)

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`
- `npx vitest run --project=@lagless/2d-map-renderer`

---

### Task 2: Rename `retryOnFailure` to `optional`

**Objective:** Rename `LocationStage.retryOnFailure` to `optional` — same boolean direction, clearer name.
**Dependencies:** None

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/types/feature-configs.ts` — rename field in `LocationStage`
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts` — update `placeLocation` logic (line 147)
- Modify: `libs/2d-map/2d-map-generator/src/__tests__/features/object-placement-feature.spec.ts` — update all LocationStage usages
- Modify: `libs/2d-map/2d-map-generator/README.md` — update code example (line 107) and LocationStage table (line 172)

**Key Decisions / Notes:**
- **Same boolean direction, pure rename.** `retryOnFailure: true` → `optional: true` (can skip). `retryOnFailure: false` → `optional: false` (must place). No logic inversion needed.
- Implementation: `if (stage.retryOnFailure) return;` → `if (stage.optional) return;`
- Breaking change for `LocationStage` consumers.

**Definition of Done:**
- [ ] `retryOnFailure` renamed to `optional` in `LocationStage` interface
- [ ] `placeLocation` updated: `if (stage.optional) return;`
- [ ] All test LocationStages use `optional:` instead of `retryOnFailure:`
- [ ] All tests pass

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`

---

### Task 3: Cache bounds and extract default orientations

**Objective:** Eliminate redundant computation in `tryPlace` — cache `computePlacementBounds` per def and extract default orientations to a module constant.
**Dependencies:** None

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts`

**Key Decisions / Notes:**
- Add `const DEFAULT_ORIENTATIONS: readonly number[] = [0];` at module level
- Replace `def.orientations ?? [0]` (line 231) with `def.orientations ?? DEFAULT_ORIENTATIONS`
- Refactor `tryPlace` to accept pre-computed `bounds: PlacementBounds | undefined` as parameter instead of calling `computePlacementBounds(def)` inside
- Compute bounds once in each `placeLocation`/`placeFixed`/`placeRandom`/`placeDensity` BEFORE the attempt loop, pass into `tryPlace`
- No behavioral change — identical results for same inputs

**Definition of Done:**
- [ ] `DEFAULT_ORIENTATIONS` constant added at module level
- [ ] `tryPlace` accepts `bounds` parameter, no longer calls `computePlacementBounds`
- [ ] All placement functions compute bounds once per def (not per attempt) and pass to `tryPlace`. For `placeRandom`, bounds computed inside the per-typeId loop.
- [ ] All tests pass with identical results

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`

## Testing Strategy

- **Unit tests:** All existing 25 tests must pass unchanged (except removing `ori` field and renaming `retryOnFailure`)
- **No new tests needed:** This is a pure refactoring — behavior is preserved. Existing tests cover all paths.
- **Determinism:** Same seed must produce identical placement (minus removed `ori` field)

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| External consumers reference `PlacedObject.ori` | Low | Medium | `ori` was never documented as meaningful. All known consumers (renderer, physics, ground patches) use `rotation`. |
| External consumers reference `retryOnFailure` | Low | Medium | Only used in `LocationStage` config objects. Rename is straightforward find-and-replace. |
| Caching bounds changes behavior | Zero | N/A | `computePlacementBounds(def)` is pure — same def always returns same result. Caching is mathematically equivalent. |

## Goal Verification

### Truths

1. **No dead code:** `PlacedObject` has no field that is set but never read
2. **Clear naming:** `LocationStage.optional` correctly describes its meaning (true = can skip)
3. **No redundant computation:** `computePlacementBounds` called once per object type per placement stage, not per attempt
4. **No per-call allocations:** Default orientations use a shared constant
5. **Behavioral preservation:** Same seed + same config produces identical placement positions

### Artifacts

| Truth | Supporting Files |
|---|---|
| No dead code | `placed-object.ts` (no `ori`), `object-placement-feature.ts` (no `ori` assignment) |
| Clear naming | `feature-configs.ts` (`optional`), `object-placement-feature.ts` (`stage.optional`) |
| No redundant computation | `object-placement-feature.ts` (bounds passed as param to `tryPlace`) |
| Behavioral preservation | All existing tests pass |

### Key Links

1. `PlacedObject` → `MapObjectRenderer.build()` → only reads `rotation`, never `ori`
2. `PlacedObject` → `createMapColliders()` → only reads `rotation`
3. `LocationStage.optional` → `placeLocation()` → `if (stage.optional) return`
4. `computePlacementBounds()` → called once in `placeFixed/placeRandom/placeDensity/placeLocation` → passed to `tryPlace`
