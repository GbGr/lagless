# Object Placement Collision Improvement Plan

Created: 2026-03-10
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Fix object placement so large objects (garages) don't overlap with each other or trees, and don't spawn in water.
**Architecture:** Replace `getPlacementCollider()` (uses first non-sensor collider only, ignores offsets) with `computePlacementBounds()` that computes an AABB from ALL non-sensor colliders with offsets. Add multi-point terrain zone checking (center + 4 AABB corners).
**Tech Stack:** TypeScript, @lagless/2d-map-generator

## Scope

### In Scope
- Compute placement AABB from all non-sensor colliders (with offsets)
- Use AABB for collision testing and spatial grid insertion during placement
- Check terrain zone at center + 4 corners of AABB
- Unit tests for new placement bounds logic

### Out of Scope
- Rotation-aware OBB collision (AABB is sufficient for axis-aligned objects)
- Explicit `placementShape` field on MapObjectDef
- Changes to collision providers — they already support Circle+Cuboid+AABB

## Context for Implementer

- **Patterns to follow:** `getPlacementCollider()` in `object-placement-feature.ts:61` — being replaced. `SpatialGridCollisionProvider._createStoredShape()` at line 111 — shows how shapes are stored with extents.
- **Conventions:** File naming: kebab-case. Tests: `__tests__/<name>.spec.ts`. Generator library tests in `libs/2d-map/2d-map-generator/src/__tests__/`.
- **Key files:**
  - `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts` — placement logic, `tryPlace()`, `getPlacementCollider()`
  - `libs/2d-map/2d-map-generator/src/lib/collision/spatial-grid-provider.ts` — collision grid (already supports Cuboid)
  - `libs/2d-map/2d-map-generator/src/lib/types/object-def.ts` — `MapObjectDef`, `MapColliderDef`
  - `libs/2d-map/2d-map-generator/src/lib/types/geometry.ts` — `ShapeType`, `MapCollisionShape`
  - `libs/2d-map/2d-map-generator/src/__tests__/features/object-placement-feature.spec.ts` — existing tests
- **Gotchas:**
  - `MapColliderDef.offsetX/offsetY` are optional (default 0). Must handle undefined.
  - Scale is applied to both shape dimensions AND offsets.
  - Garage colliders have large offsets (`offsetX: ±29`, `offsetY: -19`) — these MUST be included in AABB computation.
  - Single-collider objects (trees with one circle) should produce equivalent behavior to current code — the AABB of one circle = a square bounding the circle.

- **Domain context:** Objects are placed during map generation. The collision provider prevents overlap. Currently `getPlacementCollider()` picks only the FIRST non-sensor collider (for garage = thin top wall, halfWidth:30 halfHeight:1). The AABB should encompass all walls to prevent overlap with the full footprint.

## Progress Tracking

- [x] Task 1: Replace getPlacementCollider with computePlacementBounds
- [x] Task 2: Multi-point terrain zone checking

**Total Tasks:** 2 | **Completed:** 2 | **Remaining:** 0

## Implementation Tasks

### Task 1: Replace getPlacementCollider with computePlacementBounds

**Objective:** Replace the function that picks a single collider with one that computes an AABB encompassing all non-sensor colliders (with offsets), and use it in `tryPlace()`.
**Dependencies:** None

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/__tests__/features/object-placement-feature.spec.ts`

**Key Decisions / Notes:**
- Replace `getPlacementCollider(def)` with `computePlacementBounds(def)` that returns `{ halfWidth, halfHeight, centerX, centerY } | undefined`
- Algorithm: iterate all non-sensor colliders, for each compute min/max extents (position = offset, size = shape dimensions). Take union of all extents → one AABB.
  - Circle at offset (ox, oy): extends from (ox-r, oy-r) to (ox+r, oy+r)
  - Cuboid at offset (ox, oy): extends from (ox-hw, oy-hh) to (ox+hw, oy+hh)
  - Final AABB: min of all mins, max of all maxes → halfWidth = (maxX-minX)/2, halfHeight = (maxY-minY)/2
  - Center offset: `centerX = (minX+maxX)/2`, `centerY = (minY+maxY)/2` — returned as part of bounds for position adjustment.
- In `tryPlace()`: use the computed AABB as a `ShapeType.Cuboid` for `testShape()` and `addShape()`. **Collision position** uses adjusted coordinates: `collisionX = x + centerX * scale`, `collisionY = y + centerY * scale`. Half-extents are also scaled: `halfW * scale`, `halfH * scale`.
- **CRITICAL — PlacedObject stores original (x, y):** The `PlacedObject.posX/posY` must store the ORIGINAL placement coordinates, NOT the adjusted collision position. The renderer already handles collider offsets when positioning sub-shapes. If we stored adjusted positions, the renderer would double-apply the offset.
- **Scale interaction:** `computePlacementBounds()` returns raw (unscaled) values. In `tryPlace()`, scale is applied to BOTH center offset AND half-extents when calling `testShape()`/`addShape()`.
- **SpatialGridCollisionProvider ignores rotation for Cuboid shapes** (uses AABB, not OBB). This is acceptable since garage walls form a roughly symmetric shape and orientations produce equivalent AABB footprints.
- If no non-sensor colliders exist, return undefined (skip collision — same as current behavior)
- For a tree (one circle collider, no offset), the AABB = square of side 2*radius, centered at origin. The collision test will use Cuboid instead of Circle, but the result is practically equivalent (slightly larger footprint = slightly more spacing between trees, which is fine).

**Definition of Done:**
- [ ] `computePlacementBounds()` returns correct AABB for garage def (halfWidth≈30, halfHeight≈20)
- [ ] `computePlacementBounds()` returns correct centerX/centerY offset for garage def (approximately centerX=0, centerY≈-8.5 based on wall offsets)
- [ ] `computePlacementBounds()` returns correct AABB for single-circle tree def
- [ ] `PlacedObject.posX/posY` stores original (x, y) coordinates — NOT adjusted by center offset
- [ ] Garages don't overlap with each other or trees when placed
- [ ] All existing placement tests still pass
- [ ] New tests cover: multi-collider AABB, single-collider, no colliders, colliders with offsets, center offset verification

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`

---

### Task 2: Multi-Point Terrain Zone Checking

**Objective:** Check terrain zone at center + 4 corners of the placement AABB to prevent large objects from straddling zone boundaries (e.g. garage edges in water).
**Dependencies:** Task 1

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/lib/features/object-placement-feature.ts`
- Modify: `libs/2d-map/2d-map-generator/src/__tests__/features/object-placement-feature.spec.ts`

**Key Decisions / Notes:**
- **Keep existing `matchesZone()` (center-only) as pre-filter BEFORE `tryPlace`** in `placeFixed`/`placeRandom`/`placeDensity`. This preserves the current PRNG consumption order — positions rejected by center check never consume scale/orientation PRNG values.
- **Add multi-point corner check INSIDE `tryPlace`** after computing bounds. If center passes but any corner fails, the placement is rejected. This only runs when center-check already passed.
- Add `terrainZone` as an **optional** parameter to `tryPlace()`: `tryPlace(ctx, def, x, y, objects, terrainQuery, terrainZone?: TerrainZone)`. For `placeLocation`, pass `undefined` (no zone constraint). For `placeFixed`/`placeRandom`/`placeDensity`, pass `stage.terrainZone`.
- Corner check function: `matchesZoneCorners(terrainQuery, x, y, zone, bounds, scale)` — checks 4 corners `(x ± halfW*scale, y ± halfH*scale)`. Returns true if all 4 match the required zone. Only called inside `tryPlace` when both `terrainZone` and `bounds` are defined.
- For objects without bounds (no colliders), only center check applies (current behavior).
- **PRNG preservation:** This approach ensures that the random sequence for all subsequent placements remains unchanged for seeds that only had center-rejected positions. Corner checks are a strictly additional filter on top of existing center checks.

**Definition of Done:**
- [ ] Terrain zone checked at 5 points (center + 4 corners) for objects with bounds
- [ ] Objects without bounds still check center only
- [ ] Garage cannot have its edges in water/river zone when placed on Grass
- [ ] All existing tests pass
- [ ] New test: large object near terrain boundary rejected when corner is in wrong zone

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`

## Testing Strategy

- **Unit tests:** `computePlacementBounds()` — AABB computation for various collider configurations
- **Unit tests:** `matchesZone()` with bounds — multi-point terrain checking
- **Integration:** Full placement with garage + tree defs — verify no overlaps
- **Existing tests:** Must all pass — backwards compatibility for simple objects

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AABB larger than individual collider → harder to place objects | Low | Medium | AABB is the correct footprint. More attempts may be needed but MAX_ATTEMPTS is already 500-5000. |
| Cuboid collision for trees (was Circle) changes spacing | Low | Low | Square bounding a circle is ~27% larger. Trees will have slightly more spacing — visually better. |
| Corner terrain check rejects positions that center-only check accepted | Low | Low | Corner check is an additional filter inside tryPlace, after PRNG consumption. Positions that previously passed center check but fail corner check will consume PRNG values and be rejected — slightly changing the sequence for subsequent placements. This only affects large objects near zone boundaries (rare). Maps from same seed are still deterministic, just potentially slightly different layout near water edges. |

## Goal Verification

### Truths

1. **No garage overlaps:** Two garages placed on the same map never visually overlap
2. **No garage-tree overlaps:** Garages don't overlap with trees
3. **No water placement:** No part of a garage (edges included) is in a water/river/lake zone
4. **Trees still work:** Single-circle objects place correctly with reasonable density
5. **Determinism preserved:** Same seed produces identical placement

### Artifacts

| Truth | Supporting Files |
|---|---|
| No overlaps | `object-placement-feature.ts` (computePlacementBounds + tryPlace), tests |
| No water | `object-placement-feature.ts` (matchesZone with bounds), tests |
| Trees work | Existing placement tests pass unchanged |
| Determinism | PRNG-based placement — same seed = same output |

### Key Links

1. `computePlacementBounds()` → `tryPlace()` → `SpatialGridCollisionProvider.testShape()` (collision chain)
2. `matchesZone()` → `TerrainQuery.classify()` (terrain chain)
3. `MapObjectDef.colliders[]` → `computePlacementBounds()` (data flow)
