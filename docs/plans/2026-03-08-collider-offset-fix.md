# Rapier Collider Offset From Texture Center Fix Plan

Created: 2026-03-08
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Bugfix

## Summary
**Symptom:** In 2d-map-test, Rapier physics colliders for map objects (trees) are visually offset from their sprite textures. The debug physics overlay shows collider circles shifted relative to the rendered sprites.
**Trigger:** Always visible when DebugPhysics2dRenderer is enabled — colliders appear at the bottom edge of each tree sprite instead of centered on it.
**Root Cause:** `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx:41` — `sprite.anchor.set(0.5, 1)` positions sprites with their bottom-center at `(posX, posY)`, shifting the visual center upward by half the sprite height. The physics body in `runner-provider.tsx:173` is correctly placed at `(posX, posY)` — the center of the object as defined by the map generator.

## Investigation
- `PlacedObject.posX/posY` from the map generator represents the **center** of the placed object (verified in `object-placement-feature.ts:179-183` — collision test and registration use the same `(x, y)` center point)
- Physics body creation in `runner-provider.tsx:173`: `bodyDesc.setTranslation(obj.posX, obj.posY)` — correct, places collider at center
- Tree collision shape: `{ type: 'circle', offsetX: 0, offsetY: 0, radius: 3 }` — no extra offset, centered on body position
- Sprite rendering in `map-test-view.tsx:41`: `sprite.anchor.set(0.5, 1)` — bottom-center anchor causes the sprite to render with its bottom at `posY`, placing the visual center at `(posX, posY - height/2)`
- The anchor `(0.5, 1)` is appropriate for side-view/pseudo-3D games but incorrect for a top-down 2D game where `posX/posY` should be the center of both visual and physics representations

## Fix Approach
**Files:** `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx`
**Strategy:** Change `sprite.anchor.set(0.5, 1)` to `sprite.anchor.set(0.5, 0.5)` — center the sprite on the object position, aligning it with the physics collider.
**Tests:** Visual verification with DebugPhysics2dRenderer enabled — collider circles should overlay sprite centers.

## Progress
- [x] Task 1: Fix sprite anchor
- [x] Task 2: Verify
**Tasks:** 2 | **Done:** 2

## Tasks
### Task 1: Fix sprite anchor
**Objective:** Change tree sprite anchor from bottom-center `(0.5, 1)` to center `(0.5, 0.5)` so visual aligns with physics
**Files:** `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx`
**TDD:** Single-line rendering fix — no unit test needed (visual alignment, verified by debug overlay)
**Verify:** Build succeeds: `pnpm exec nx build @lagless/2d-map-test-game`

### Task 2: Verify
**Objective:** Ensure build passes and no regressions
**Verify:** `pnpm exec nx typecheck @lagless/2d-map-test-game`
