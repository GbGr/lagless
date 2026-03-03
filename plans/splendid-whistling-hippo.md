# Physics API Refactoring + Create Tool Fixes

## Context

Physics libraries (physics-shared, physics2d, physics3d) were created in parallel and accumulated naming inconsistencies, API asymmetries, code duplication, and missing features. The codegen runner template for physics2d is missing parameters that physics3d has. The create tool generates projects with outdated/incorrect docs and missing input sanitization in raw mode. This PR unifies the APIs, reduces duplication, fixes the create tool, and ensures generated physics projects work out of the box.

---

## Phase 1: Extract Shared Code to physics-shared

### 1a. Extract `wireColliderEntityMapRebuild` function

The `_wireColliderEntityMapRebuild` method is character-for-character identical in both `PhysicsRunner2d` (lines 54-88) and `PhysicsRunner3d` (lines 54-88). It uses no dimension-specific types.

**Create:** `libs/physics-shared/src/lib/wire-collider-entity-map-rebuild.ts`
- Export `wireColliderEntityMapRebuild(deps, simulation, colliderEntityMap)` as standalone function
- Add warning log (via `createLogger` from `@lagless/misc`) when PhysicsRefs component or filter not found

**Modify:** `libs/physics-shared/src/index.ts` — add export

**Modify:** `libs/physics2d/src/lib/physics-runner-2d.ts` — remove private `_wireColliderEntityMapRebuild`, import and call the shared function

**Modify:** `libs/physics3d/src/lib/physics-runner-3d.ts` — same change

### 1b. Replace trivial PhysicsSimulation subclasses with deprecated re-exports

`PhysicsSimulation2d` and `PhysicsSimulation3d` are zero-logic pass-through subclasses of `PhysicsSimulationBase`.

**Modify:** `libs/physics2d/src/lib/physics-simulation-2d.ts` — replace class with `export { PhysicsSimulationBase as PhysicsSimulation2d }` + `@deprecated` JSDoc

**Modify:** `libs/physics3d/src/lib/physics-simulation-3d.ts` — same

**Modify:** `libs/physics2d/src/lib/physics-runner-2d.ts` — use `PhysicsSimulationBase` directly for `Simulation` field type and instantiation

**Modify:** `libs/physics3d/src/lib/physics-runner-3d.ts` — same

### 1c. Remove `substepDt` from PhysicsConfig classes

`substepDt` is computed both in `PhysicsConfig` (from `frameDt` param) and in `PhysicsWorldManager` (from `frameLengthMs`). Only WorldManager's value is used at runtime.

**Modify:** `libs/physics2d/src/lib/physics-config-2d.ts` — remove `substepDt` field and `frameDt` constructor param. Config keeps only `gravityX`, `gravityY`, `substeps`.

**Modify:** `libs/physics3d/src/lib/physics-config-3d.ts` — same, but with `gravityZ` too.

**Modify:** `libs/physics2d/src/lib/physics-world-manager-2d.ts` — add public getter `get substepDt(): number`

**Modify:** `libs/physics3d/src/lib/physics-world-manager-3d.ts` — same

---

## Phase 2: Naming Consistency

### 2a. Rename 3D rapier types file and add suffixes

Convention: all dimension-specific types carry `-2d` or `-3d` suffix consistently.

**Create:** `libs/physics3d/src/lib/rapier-types-3d.ts` — copy of current `rapier-types.ts` with renames:
- `RapierRigidBodyDesc` → `RapierRigidBodyDesc3d`
- `RapierColliderDesc` → `RapierColliderDesc3d`
- `RapierTempContactForceEvent` → `RapierTempContactForceEvent3d`
- `RapierEventQueue` → `RapierEventQueue3d`

**Modify:** `libs/physics3d/src/lib/rapier-types.ts` — convert to deprecated re-export shim (old names → new names)

**Modify:** All internal physics3d imports (`physics-world-manager-3d.ts`, `collision-events-3d.ts`, `physics-runner-3d.ts`) — update to `rapier-types-3d.js` and use suffixed names

**Modify:** `libs/physics3d/src/index.ts` — export from `rapier-types-3d.js` as primary, keep `rapier-types.js` for backward compat

### 2b. Unify physics-shared re-exports across 2D/3D

**Modify:** `libs/physics3d/src/index.ts`:
- Add direct re-exports from `@lagless/physics-shared`: `BodyType`, `BodyTypeValue`, `ColliderEntityMap`, `UNMAPPED_ENTITY`, `handleToIndex`, `CollisionLayers`, `CollisionEventsBase`, and type interfaces
- Keep `ColliderEntityMap3d` and `CollisionLayers3d` as deprecated aliases
- Add `@deprecated` JSDoc to `collider-entity-map-3d.ts` and `collision-layers-3d.ts`

**Modify:** `libs/physics2d/src/index.ts`:
- Add `UNMAPPED_ENTITY` to re-exports (currently missing)

---

## Phase 3: API Parity (Missing Methods/Types)

### 3a. Add missing collider convenience methods to 3D

**Modify:** `libs/physics3d/src/lib/rapier-types-3d.ts`:
- Add `convexHull(points: Float32Array): RapierColliderDesc3d | null` to `RapierModule3d.ColliderDesc`

**Modify:** `libs/physics3d/src/lib/physics-world-manager-3d.ts`:
- Add `createConvexHullCollider(points, parent?, groups?, activeEvents?)`
- Add `createCylinderCollider(halfHeight, radius, parent?, groups?, activeEvents?)`
- Add `createConeCollider(halfHeight, radius, parent?, groups?, activeEvents?)`

### 3b. Add `groups`/`activeEvents` to `createTrimeshCollider`

**Modify:** `libs/physics2d/src/lib/physics-world-manager-2d.ts` — add optional `groups?` and `activeEvents?` params to `createTrimeshCollider`

**Modify:** `libs/physics3d/src/lib/physics-world-manager-3d.ts` — same

### 3c. Add 2D KCC and QueryFilterFlags types

**Modify:** `libs/physics2d/src/lib/rapier-types-2d.ts`:
- Add `QueryFilterFlags` to `RapierModule2d`
- Add `RapierKinematicCharacterController2d`, `RapierCharacterCollision2d` interfaces
- Add `createCharacterController(offset)` to `RapierWorld2d`

---

## Phase 4: Codegen Template Fix

**Modify:** `tools/codegen/files/runner-physics2d/__projectName__.runner.ts.template`
- Add `CollisionLayers` import from `@lagless/physics-shared`
- Add `collisionLayers?: CollisionLayers` and `extraRegistrations?: Array<[unknown, unknown]>` constructor params
- Pass them through to `super()` call

This matches the existing physics3d runner template.

---

## Phase 5: Create Tool Fixes

### 5a. Input sanitization for raw mode

**Modify:** `tools/create/templates/pixi-react/__packageName__-simulation/src/lib/systems/apply-move-input.system.ts`
- Add `finite()` helper to the raw branch (lines 72-96)
- Wrap `rpc.data.directionX` and `rpc.data.directionY` with `finite()`

### 5b. CLI version from package.json

**Modify:** `tools/create/src/index.ts`
- Read version from `package.json` once at module top
- Use for `program.version()` and `laglessVersion` fallback
- Remove hardcoded `'0.0.38'`

### 5c. Add `@lagless/physics-shared` to physics2d frontend deps

**Modify:** `tools/create/templates/pixi-react/__packageName__-frontend/package.json`
- Add `"@lagless/physics-shared": "^<%= laglessVersion %>"` to the physics2d dependency block (line 22)

### 5d. Fix physics docs to match actual API

**Modify:** `tools/create/templates/pixi-react/docs/08-physics2d.md`
- Rewrite "Creating Bodies and Colliders" section: use `createDynamicBody()`, `createBallCollider()`, `body.setTranslation()`, `worldManager.registerCollider()` instead of non-existent `createBody(entity, {...})`
- Rewrite "Complete Physics System Example": replace `setLinearVelocity(entity, {...})` with `getBody(handle).setLinvel({...}, true)`

**Modify:** `tools/create/templates/pixi-react/docs/08-physics3d.md`
- Same API corrections for the 3D variants

**Modify:** `tools/create/templates/pixi-react/docs/10-common-mistakes.md`
- Fix "Setting Dynamic Body Position Directly" section: replace non-existent `this._physics.setLinearVelocity(entity, {...})` with `this._physics.getBody(handle).setLinvel({...}, true)`

### 5e. Fix grid background for physics3d

**Modify:** `tools/create/templates/pixi-react/__packageName__-frontend/src/app/game-view/grid-background.tsx`
- Add physics3d branch with world-to-screen coordinate conversion (SCALE=20, offsets matching player-view)

---

## Phase 6: Test Parity

### 6a. Missing physics2d simulation tests

**Modify:** `libs/physics2d/src/lib/__tests__/physics-simulation-2d.spec.ts`
- Add `exportStateForTransfer` / `applyStateFromTransfer` roundtrip test (port from physics3d)
- Add "should not throw Ticks must be non-decreasing when applyExternalState to earlier tick" test

### 6b. New PhysicsStepSync2d tests

**Create:** `libs/physics2d/src/lib/__tests__/physics-step-sync-2d.spec.ts`
- Test `savePrevTransforms`: verify prev fields set from current
- Test `syncKinematicToRapier`: verify Rapier body matches ECS transform
- Test `syncDynamicFromRapier`: verify ECS transform updated from Rapier body

### 6c. New 3D collider method tests

**Modify:** `libs/physics3d/src/lib/__tests__/physics-world-manager-3d.spec.ts`
- Add `createConvexHullCollider` test
- Add `createCylinderCollider` test
- Add `createConeCollider` test

---

## Files Summary

### New files (3)
- `libs/physics-shared/src/lib/wire-collider-entity-map-rebuild.ts`
- `libs/physics3d/src/lib/rapier-types-3d.ts`
- `libs/physics2d/src/lib/__tests__/physics-step-sync-2d.spec.ts`

### Modified files (~25)

**physics-shared:**
- `libs/physics-shared/src/index.ts`

**physics2d:**
- `libs/physics2d/src/index.ts`
- `libs/physics2d/src/lib/rapier-types-2d.ts`
- `libs/physics2d/src/lib/physics-config-2d.ts`
- `libs/physics2d/src/lib/physics-world-manager-2d.ts`
- `libs/physics2d/src/lib/physics-simulation-2d.ts`
- `libs/physics2d/src/lib/physics-runner-2d.ts`
- `libs/physics2d/src/lib/__tests__/physics-simulation-2d.spec.ts`

**physics3d:**
- `libs/physics3d/src/index.ts`
- `libs/physics3d/src/lib/rapier-types.ts` (deprecated shim)
- `libs/physics3d/src/lib/physics-config-3d.ts`
- `libs/physics3d/src/lib/physics-world-manager-3d.ts`
- `libs/physics3d/src/lib/physics-simulation-3d.ts`
- `libs/physics3d/src/lib/physics-runner-3d.ts`
- `libs/physics3d/src/lib/collision-events-3d.ts`
- `libs/physics3d/src/lib/collider-entity-map-3d.ts`
- `libs/physics3d/src/lib/collision-layers-3d.ts`
- `libs/physics3d/src/lib/__tests__/physics-world-manager-3d.spec.ts`

**codegen:**
- `tools/codegen/files/runner-physics2d/__projectName__.runner.ts.template`

**create tool:**
- `tools/create/src/index.ts`
- `tools/create/templates/pixi-react/__packageName__-simulation/src/lib/systems/apply-move-input.system.ts`
- `tools/create/templates/pixi-react/__packageName__-frontend/package.json`
- `tools/create/templates/pixi-react/__packageName__-frontend/src/app/game-view/grid-background.tsx`
- `tools/create/templates/pixi-react/docs/08-physics2d.md`
- `tools/create/templates/pixi-react/docs/08-physics3d.md`
- `tools/create/templates/pixi-react/docs/10-common-mistakes.md`

---

## Verification

1. **Build all physics libs:** `pnpm exec nx run-many -t build --projects=@lagless/physics-shared,@lagless/physics2d,@lagless/physics3d`
2. **Run all physics tests:** `npx vitest run --project=@lagless/physics-shared && npx vitest run --project=@lagless/physics2d && npx vitest run --project=@lagless/physics3d`
3. **Verify character-controller-3d still builds:** `pnpm exec nx build @lagless/character-controller-3d`
4. **Verify roblox-like still compiles:** `pnpm exec nx typecheck @lagless/roblox-like-simulation`
5. **Verify codegen tests pass:** `pnpm exec nx test @lagless/codegen`
6. **Build create tool:** `pnpm exec nx build @lagless/create`
