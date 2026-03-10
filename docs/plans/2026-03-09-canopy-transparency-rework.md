# Canopy Transparency Rework Implementation Plan

Created: 2026-03-09
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Move canopy transparency from ECS/physics sensor approach to pure view-layer distance checks, fixing desync and performance bugs.
**Architecture:** Remove all ECS infrastructure for canopy overlap (CanopyMarker, CanopyOverlapSystem, sensor entities/bodies). Add `extractCanopyZones()` utility to generator library. View layer pre-computes canopy zones once and does simple distance checks per frame.
**Tech Stack:** TypeScript, Pixi.js (view), @lagless/2d-map-generator (utility)

## Scope

### In Scope
- Remove CanopyOverlapSystem from simulation systems
- Remove canopy entity creation (`_createCanopyEntities`) from runner
- Remove CanopyMarker component and CanopyMarkerFilter from ECS schema + regenerate
- Add `extractCanopyZones()` utility to `@lagless/2d-map-generator`
- Rewrite view to use distance-based canopy alpha checks
- Clean up unused imports and DI resolutions

### Out of Scope
- Changing `CANOPY_SENSOR_TAG`, `skipTags`, `sortPlacedObjects` — all still used
- Changing `MapObjectRenderer.setCanopyAlpha()` API — already correct
- Multi-player canopy visibility — remains local-only by design
- Configurable alpha value — hardcoded 0.3 is fine for now

## Context for Implementer

> Write for an implementer who has never seen the codebase.

- **Patterns to follow:**
  - ECS codegen: edit `ecs.yaml`, run `pnpm exec nx g @lagless/codegen:ecs --configPath <path>`. Generated files in `code-gen/` — never edit manually.
  - Generator library utilities: see `sort-placed-objects.ts` for pattern (pure function, no side effects, works with `PlacedObject[]` + `MapObjectRegistry`)
  - View pattern: `useMemo` for one-time computation, `useTick` for per-frame work (see existing camera follow code)

- **Conventions:**
  - File naming: kebab-case. Tests: `__tests__/<name>.spec.ts`
  - Generator library tests: `libs/2d-map/2d-map-generator/src/__tests__/`
  - Imports use `.js` extension for ESM

- **Key files:**
  - `2d-map-test/2d-map-test-simulation/src/lib/schema/ecs.yaml` — ECS schema (codegen source)
  - `2d-map-test/2d-map-test-simulation/src/lib/systems/index.ts` — system registration order
  - `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts` — runner with map generation
  - `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx` — game view component
  - `libs/2d-map/2d-map-generator/src/lib/utils/sort-placed-objects.ts` — pattern for new utility
  - `libs/2d-map/2d-map-renderer/src/lib/core/map-object-renderer.ts` — renderer with `setCanopyAlpha()`

- **Gotchas:**
  - Removing CanopyMarker from ecs.yaml changes component IDs for components declared after it. CanopyMarker is the last component, so no ID shifts.
  - `sortPlacedObjects` MUST be used for sorted index consistency between `extractCanopyZones()` and `MapObjectRenderer.build()`.
  - After removing CanopyMarker from schema, `MapTest.core.ts` and `MapTest.runner.ts` are regenerated — review for correctness.
  - The tree def in `objects.ts` still has the sensor collider — it's metadata read by `extractCanopyZones()` and skipped by `createMapColliders` via `skipTags`.

- **Domain context:**
  - Canopy transparency is a VIEW-ONLY concern — only the local player sees transparent canopies. Storing overlap state in ECS ArrayBuffer was wrong because it gets hashed and compared across clients for determinism verification. Different rollback timing between clients causes different sensor collision events → different hashes → desync.
  - The fix moves ALL canopy logic to the view layer where it can't affect determinism.

## Runtime Environment

- **Start command:** `pnpm exec nx serve @lagless/2d-map-test-server` (terminal 1) + `pnpm exec nx serve @lagless/2d-map-test-game` (terminal 2)
- **Port:** Game client on Vite dev server
- **Health check:** Open browser, verify no desync in dev-player with 2+ instances

## Feature Inventory

| Old File / Function | Purpose | Task # | Action |
|---|---|---|---|
| `canopy-overlap.system.ts` — `CanopyOverlapSystem` | Process sensor events, update `overlapMask` | Task 1 | Delete file |
| `systems/index.ts` — `CanopyOverlapSystem` import | Register system in pipeline | Task 1 | Remove import + entry |
| `ecs.yaml` — `CanopyMarker` component | ECS component for overlap tracking | Task 1 | Remove + regenerate |
| `ecs.yaml` — `CanopyMarkerFilter` | Filter for canopy entities | Task 1 | Remove + regenerate |
| `map-test-runner-with-map.ts` — `_createCanopyEntities()` | Create ECS entities with Rapier sensor bodies | Task 1 | Remove method + call |
| `map-test-runner-with-map.ts` — unused imports | `Prefab, sortPlacedObjects, CANOPY_SENSOR_TAG, Transform2d, PhysicsRefs, CanopyMarker, ShapeType` | Task 1 | Remove unused ones |
| `map-test-view.tsx` — ECS canopy iteration | Read `overlapMask` from ECS, call `setCanopyAlpha` | Task 3 | Replace with distance checks |
| `map-test-view.tsx` — `CanopyMarker/CanopyMarkerFilter` DI | Resolve ECS components for canopy | Task 3 | Replace with `extractCanopyZones()` |
| — (new) `extractCanopyZones()` | Extract canopy zones from map data | Task 2 | Create in generator lib |

## Progress Tracking

- [x] Task 1: Remove ECS canopy infrastructure
- [x] Task 2: Add extractCanopyZones() utility to generator library
- [x] Task 3: View-layer canopy transparency via distance checks

**Total Tasks:** 3 | **Completed:** 3 | **Remaining:** 0

## Implementation Tasks

### Task 1: Remove ECS Canopy Infrastructure

**Objective:** Remove all ECS and physics infrastructure for canopy overlap detection from the simulation. This eliminates the desync source and Rapier sensor body overhead.
**Dependencies:** None

**Files:**
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/schema/ecs.yaml` — remove CanopyMarker component and CanopyMarkerFilter
- Regenerate: `2d-map-test/2d-map-test-simulation/src/lib/schema/code-gen/*` — run codegen
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/systems/index.ts` — remove CanopyOverlapSystem
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts` — remove `_createCanopyEntities()`, clean imports
- Delete: `2d-map-test/2d-map-test-simulation/src/lib/systems/canopy-overlap.system.ts`

**Key Decisions / Notes:**
- In `ecs.yaml`: remove the `CanopyMarker:` block (lines 12-14) and the `CanopyMarkerFilter:` block (lines 39-43)
- Run codegen: `pnpm exec nx g @lagless/codegen:ecs --configPath 2d-map-test/2d-map-test-simulation/src/lib/schema/ecs.yaml`
- In `systems/index.ts`: remove import and array entry for `CanopyOverlapSystem`
- In `map-test-runner-with-map.ts`:
  - Remove the entire `_createCanopyEntities()` private method
  - Remove the call `this._createCanopyEntities(placement, mapData, rapier);` (line 73)
  - Keep `createMapColliders` call WITH `skipTags: [CANOPY_SENSOR_TAG]` — still needed to prevent Rapier from creating sensor bodies
  - Remove unused imports: `Prefab`, `Transform2d`, `PhysicsRefs`, `CanopyMarker`, `sortPlacedObjects`, `ShapeType`
  - Keep: `CANOPY_SENSOR_TAG` (used in skipTags), `createMapColliders`, `ObjectPlacementFeature`, etc.
- Delete `canopy-overlap.system.ts` entirely
- **Note:** After codegen, `@lagless/2d-map-test-game` will have broken imports for `CanopyMarker` and `CanopyMarkerFilter`. This is expected — resolved in Task 3. Do NOT typecheck the game package until Task 3 is complete.

**Definition of Done:**
- [ ] `CanopyMarker` and `CanopyMarkerFilter` removed from ecs.yaml
- [ ] Codegen runs successfully, generated files updated
- [ ] `CanopyOverlapSystem` removed from systems array
- [ ] `_createCanopyEntities()` method and call removed from runner
- [ ] `canopy-overlap.system.ts` file deleted
- [ ] TypeScript compilation passes: `pnpm exec nx typecheck @lagless/2d-map-test-simulation`
- [ ] No unused imports remain in modified files

**Verify:**
- `pnpm exec nx g @lagless/codegen:ecs --configPath 2d-map-test/2d-map-test-simulation/src/lib/schema/ecs.yaml`
- `pnpm exec nx typecheck @lagless/2d-map-test-simulation`

---

### Task 2: Add extractCanopyZones() Utility

**Objective:** Create a pure utility function in `@lagless/2d-map-generator` that extracts canopy zone data from placement objects, ready for view-layer distance checks.
**Dependencies:** None (parallel with Task 1)

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/utils/extract-canopy-zones.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts` — export new utility
- Create: `libs/2d-map/2d-map-generator/src/__tests__/utils/extract-canopy-zones.spec.ts`

**Key Decisions / Notes:**
- Follow `sort-placed-objects.ts` pattern: pure function, no side effects
- Interface:
  ```typescript
  export interface CanopyZone {
    x: number;
    y: number;
    radiusSq: number;     // pre-squared for fast distance checks
    objectIndex: number;  // sorted index matching MapObjectRenderer
  }

  export function extractCanopyZones(
    objects: readonly PlacedObject[],
    registry: MapObjectRegistry,
    tag?: number,  // defaults to CANOPY_SENSOR_TAG
  ): CanopyZone[];
  ```
- Implementation: call `sortPlacedObjects(objects)`, iterate sorted array, find sensor colliders with matching tag, extract position + scaled radius squared
- `objectIndex` is the sorted array index — matches `MapObjectRenderer.build()` which also uses `sortPlacedObjects()`
- Only supports `ShapeType.Circle` sensors (skip non-circle)
- Default `tag` parameter to `CANOPY_SENSOR_TAG` for ergonomic API

**Definition of Done:**
- [ ] `extractCanopyZones()` returns correct zones with pre-squared radii
- [ ] `objectIndex` matches renderer sorted order
- [ ] Tests cover: basic extraction, empty input, objects without canopy sensors, scale applied to radius, default tag parameter
- [ ] Exported from `@lagless/2d-map-generator` index
- [ ] All tests pass: `npx vitest run --project=@lagless/2d-map-generator`

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`
- `pnpm exec nx typecheck @lagless/2d-map-generator`

---

### Task 3: View-Layer Canopy Transparency

**Objective:** Replace ECS-based canopy iteration in `map-test-view.tsx` with distance-based alpha checks using `extractCanopyZones()`.
**Dependencies:** Task 1, Task 2

**Files:**
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx`

**Key Decisions / Notes:**
- Remove imports: `CanopyMarker`, `CanopyMarkerFilter` from `@lagless/2d-map-test-simulation`
- Add imports: `extractCanopyZones` from `@lagless/2d-map-generator`, `CANOPY_SENSOR_TAG` + `ShapeType` NOT needed (defaults handled by utility)
- Add `useMemo` for canopy zones:
  ```typescript
  const canopyZones = useMemo(() => {
    const placement = mapData.map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
    return placement ? extractCanopyZones(placement.objects, mapData.registry) : [];
  }, [mapData]);
  ```
- Remove DI resolutions for `canopyFilter` and `canopyMarker`
- Replace canopy iteration block in `useTick` with distance checks:
  ```typescript
  const objRenderer = objectRendererRef.current;
  if (objRenderer) {
    const px = smoother.x, py = smoother.y;
    for (const zone of canopyZones) {
      const dx = px - zone.x;
      const dy = py - zone.y;
      const inside = dx * dx + dy * dy < zone.radiusSq;
      objRenderer.setCanopyAlpha(zone.objectIndex, inside ? 0.3 : 1.0);
    }
  }
  ```
- Performance: O(N) with N ≈ 100-200 trees, just multiply+compare per tree — negligible cost
- No ECS state modified → no determinism impact → no desync

**Definition of Done:**
- [ ] No imports of `CanopyMarker` or `CanopyMarkerFilter` remain
- [ ] No `DIContainer.resolve()` calls for `CanopyMarker` or `CanopyMarkerFilter` remain
- [ ] Canopy zones computed once via `useMemo`
- [ ] Distance checks run per frame in `useTick`
- [ ] `setCanopyAlpha` called with correct sorted object indices
- [ ] TypeScript compilation passes
- [ ] No desync when running with 2+ players in dev-player

**Verify:**
- `pnpm exec nx typecheck @lagless/2d-map-test-game`

## Testing Strategy

- **Unit tests:** `extractCanopyZones()` utility — zone extraction, index consistency, edge cases
- **Existing tests:** `createMapColliders` skipTags tests, `sortPlacedObjects` tests (unchanged)
- **Manual verification:** Run game, walk player under trees, verify canopy becomes transparent (alpha 0.3) when inside zone, opaque (1.0) when outside. Run 2+ instances in dev-player — verify zero desync.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sorted index mismatch between `extractCanopyZones()` and renderer | Low | High (wrong canopy goes transparent) | Both use `sortPlacedObjects()` — same sort order guaranteed. Test verifies index consistency. |
| Distance checks don't match previous Rapier sensor radius | Low | Medium (transparency zone feels different) | Same `radius * scale` formula used in both old `_createCanopyEntities` and new `extractCanopyZones()` |
| Removing CanopyMarker shifts component IDs | None | High | CanopyMarker is the last component in ecs.yaml — no components after it to shift |
| Performance regression from per-frame distance checks | Very Low | Low | ~200 trees × 2 multiplies + 1 compare = negligible. Old approach had Rapier broadphase overhead on all sensor bodies every substep. |

## Goal Verification

### Truths

1. **No desync:** Game runs without determinism hash mismatches when 2+ players connect
2. **No performance degradation:** Frame overhead returns to pre-canopy levels (no extra Rapier sensor bodies or ECS entities)
3. **Canopy transparency works:** Walking under a tree makes canopy semi-transparent (0.3), walking away restores opacity (1.0)
4. **Clean separation:** No canopy state in ECS ArrayBuffer — all canopy logic is view-only
5. **Index consistency:** `extractCanopyZones()` objectIndex matches `MapObjectRenderer` particle index

### Artifacts

| Truth | Supporting Files |
|---|---|
| No desync | `systems/index.ts` (no CanopyOverlapSystem), `ecs.yaml` (no CanopyMarker), `map-test-runner-with-map.ts` (no sensor entities) |
| No performance | `map-test-runner-with-map.ts` (no sensor bodies created), `ecs.yaml` (fewer entities) |
| Transparency works | `map-test-view.tsx` (distance checks + setCanopyAlpha) |
| Clean separation | `map-test-view.tsx` (view-only logic), no canopy state in ECS |
| Index consistency | `extract-canopy-zones.ts` (uses sortPlacedObjects), `map-object-renderer.ts` (uses sortPlacedObjects) |

### Key Links

1. `extractCanopyZones()` → `sortPlacedObjects()` → `MapObjectRenderer.build()` (index consistency chain)
2. `objects.ts` tree sensor collider → `extractCanopyZones()` reads radius → view checks distance (data flow)
3. `createMapColliders(skipTags)` → prevents Rapier sensor bodies (physics cleanup)
4. `map-test-view.tsx useTick` → `setCanopyAlpha()` (rendering chain)
