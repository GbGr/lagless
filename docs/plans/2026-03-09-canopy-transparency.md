# Canopy Transparency System

Created: 2026-03-09
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** When a player walks under tree foliage, the canopy becomes transparent (binary: alpha 0.3 when overlapping, 1.0 when not). Local player only — each client sees transparency for their own player's overlaps.

**Architecture:** Rapier sensor colliders on ECS entities detect player overlap via `CollisionEvents2d` sensor enter/exit events. A `CanopyOverlapSystem` processes events each tick and stores overlap state in `CanopyMarker.overlapMask` (one bit per player slot). The view iterates canopy entities, checks the local player's bit, and calls `MapObjectRenderer.setCanopyAlpha()`. All state is in ECS (survives rollback).

**Tech Stack:** Rapier 2D sensors, ECS entities (CanopyMarker component + CanopyOverlapSystem), PixiJS ParticleContainer alpha, TypeScript

## Scope

### In Scope
- Add `CANOPY_SENSOR_TAG` constant to `@lagless/2d-map-generator` (library, universal)
- Add `sortPlacedObjects` shared utility to `@lagless/2d-map-generator` (library, universal)
- Refactor `createMapColliders` to support skipping tagged colliders (library, universal)
- Add canopy sensor collider to tree definition (game-specific)
- Add `CanopyMarker` component with `objectIndex` + `overlapMask` fields to ECS schema (game-specific)
- Create `CanopyOverlapSystem` that processes sensor events (game-specific)
- Create ECS entities for canopy sensors in runner (game-specific)
- Integrate in game view: iterate canopy entities, read overlap mask, call `setCanopyAlpha` (game-specific)

### Out of Scope
- Smooth/gradient alpha (binary only)
- Non-circle canopy shapes
- Recursive child objects with canopy sensors (only top-level placed objects; children are not processed for canopy zones)
- Canopy for 3D / physics3d
- `MapObjectRenderer` changes (existing `setCanopyAlpha` is sufficient)

## Context for Implementer

- **Patterns to follow:** `player-connection.system.ts:54-72` — ECS entity creation with physics body + collider + `registerCollider`. `collision-events-base.ts:89-104` — sensor event convention: A = non-sensor entity, B = sensor entity. `physics-step.system.ts` — system that runs after physics step.
- **Conventions:** ESM `.js` extensions, `@lagless/source` condition, `@ECSSystem()` decorator with DI, codegen from YAML via `pnpm exec nx g @lagless/codegen:ecs --configPath <path>`. Systems order matters — `CanopyOverlapSystem` must run AFTER `PhysicsStepSystem` (which drains collision events).
- **Key files:**
  - `libs/2d-map/2d-map-generator/src/lib/physics/create-map-colliders.ts` — creates Rapier bodies/colliders, returns `void`. Processes `obj.children` recursively.
  - `libs/2d-map/2d-map-generator/src/lib/types/object-def.ts` — `MapColliderDef` has `isSensor?: boolean`, `tag?: number`.
  - `libs/2d-map/2d-map-renderer/src/lib/core/map-object-renderer.ts:22` — sorts objects by `a.posY - b.posY`. `setCanopyAlpha(objectIndex, alpha)` at line 49 — already exists, uses sorted index as key.
  - `libs/physics-shared/src/lib/collision-events-base.ts:89-104` — sensor events: `sensorEnterEntityA/B`, `sensorExitEntityA/B`. Convention: A = non-sensor, B = sensor.
  - `2d-map-test/2d-map-test-simulation/src/lib/map-config/objects.ts` — `TREE_DEF` with colliders and visuals.
  - `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts` — runner creates map, calls `createMapColliders`, calls `capturePreStartState()`.
  - `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx:22-48` — `objectRenderer` created in `useEffect`, not accessible from `useTick`. Needs refactoring.
- **Gotchas:**
  - **ActiveEvents required:** Rapier doesn't generate sensor events by default. The canopy sensor collider must have `setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS)`. Without this, the event queue is empty.
  - **Sort consistency:** `MapObjectRenderer.build()` sorts by `posY`. The runner must use the SAME sort order (including tiebreaker) when assigning `objectIndex` to canopy entities. Solution: shared `sortPlacedObjects` utility with tiebreaker `posY || posX`.
  - **`capturePreStartState()` timing:** Must be called AFTER creating canopy entities (they're pre-start static bodies in the Rapier world snapshot).
  - **`objectRenderer` scope:** Currently inside `useEffect` at line 35. Needs to be in a `useRef` to be accessible from `useTick` at line 60.
  - **Collision group compatibility:** Player collider and canopy sensor must be in compatible collision groups. Currently player collider has no explicit collision groups (default = interact with everything). Canopy sensor will also use default. This should work.
  - **Entity pool budget:** Each canopy entity uses one slot from `maxEntities`. With 50-200 trees, this is a meaningful allocation. Ensure `maxEntities` in ECSConfig is sufficient.

## Progress Tracking

- [x] Task 1: Add CANOPY_SENSOR_TAG, sortPlacedObjects, and refactor createMapColliders
- [x] Task 2: Add CanopyMarker component, CanopyOverlapSystem, and create canopy entities
- [x] Task 3: Integrate canopy transparency in game view

**Total Tasks:** 3 | **Completed:** 3 | **Remaining:** 0

## Implementation Tasks

### Task 1: Add CANOPY_SENSOR_TAG, sortPlacedObjects, and refactor createMapColliders

**Objective:** Export `CANOPY_SENSOR_TAG` constant and `sortPlacedObjects` utility from the generator library. Refactor `createMapColliders` to accept optional `skipTags` parameter.

**Dependencies:** None

**Files:**
- Create: `libs/2d-map/2d-map-generator/src/lib/physics/canopy-sensor-tag.ts`
- Create: `libs/2d-map/2d-map-generator/src/lib/utils/sort-placed-objects.ts`
- Modify: `libs/2d-map/2d-map-generator/src/lib/physics/create-map-colliders.ts`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`
- Modify: `libs/2d-map/2d-map-renderer/src/lib/core/map-object-renderer.ts` — use `sortPlacedObjects`
- Test: `libs/2d-map/2d-map-generator/src/__tests__/physics/create-map-colliders.spec.ts`

**Key Decisions / Notes:**
- `canopy-sensor-tag.ts`: `export const CANOPY_SENSOR_TAG = 1;`
- `sort-placed-objects.ts`:
  ```typescript
  export function sortPlacedObjects(objects: readonly PlacedObject[]): PlacedObject[] {
    return [...objects].sort((a, b) => a.posY - b.posY || a.posX - b.posX);
  }
  ```
  Tiebreaker by `posX` guarantees deterministic order when `posY` is equal.
- `createMapColliders` signature change:
  ```typescript
  export interface CreateMapCollidersOptions {
    skipTags?: readonly number[];
  }
  export function createMapColliders(
    physics: MapPhysicsProvider,
    objects: readonly PlacedObject[],
    registry: MapObjectRegistry,
    options?: CreateMapCollidersOptions,
  ): void
  ```
  In `placeObject`, before creating each collider, check: `if (options?.skipTags?.includes(collider.tag ?? -1)) continue;`
- `MapObjectRenderer.build()` — change sort from `(a, b) => a.posY - b.posY` to `sortPlacedObjects(objects)`. Import from `@lagless/2d-map-generator`. This guarantees consistency with runner.
- Add exports to `index.ts`: `CANOPY_SENSOR_TAG`, `sortPlacedObjects`, `CreateMapCollidersOptions`.

**Definition of Done:**
- [ ] `CANOPY_SENSOR_TAG` exported from `@lagless/2d-map-generator`
- [ ] `sortPlacedObjects` exported and includes posX tiebreaker
- [ ] `createMapColliders(physics, objects, registry, { skipTags: [1] })` skips colliders with tag 1
- [ ] Without options, behavior is unchanged (backward compatible)
- [ ] `MapObjectRenderer.build()` uses `sortPlacedObjects`
- [ ] Tests verify skipTags behavior (skip with matching tag, no skip without)
- [ ] `npx vitest run --project=@lagless/2d-map-generator` passes
- [ ] `npx vitest run --project=@lagless/2d-map-renderer` passes

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`
- `npx vitest run --project=@lagless/2d-map-renderer`

---

### Task 2: Add CanopyMarker component, CanopyOverlapSystem, and create canopy entities

**Objective:** Add `CanopyMarker` component (with `objectIndex` + `overlapMask` fields) and `CanopyMarkerFilter` to ECS schema. Create `CanopyOverlapSystem` that processes sensor enter/exit events and updates `overlapMask`. In `MapTestRunnerWithMap`, create ECS entities for canopy sensors. Update tree definition with canopy sensor collider.

**Dependencies:** Task 1

**Files:**
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/schema/ecs.yaml`
- Run codegen: `pnpm exec nx g @lagless/codegen:ecs --configPath 2d-map-test/2d-map-test-simulation/src/lib/schema/ecs.yaml`
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/map-config/objects.ts` — add canopy sensor collider
- Create: `2d-map-test/2d-map-test-simulation/src/lib/systems/canopy-overlap.system.ts`
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/systems/index.ts` — add CanopyOverlapSystem after PhysicsStepSystem
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts` — create canopy entities
- Modify: `2d-map-test/2d-map-test-simulation/src/index.ts` — export CanopyMarker, CanopyMarkerFilter

**Key Decisions / Notes:**
- ECS YAML additions:
  ```yaml
  components:
    CanopyMarker:
      objectIndex: uint16
      overlapMask: uint8

  filters:
    CanopyMarkerFilter:
      include:
        - Transform2d
        - PhysicsRefs
        - CanopyMarker
  ```
- Tree definition (`objects.ts`):
  ```typescript
  import { CANOPY_SENSOR_TAG } from '@lagless/2d-map-generator';
  colliders: [
    { shape: { type: ShapeType.Circle, radius: 30 } },
    { shape: { type: ShapeType.Circle, radius: 128 }, isSensor: true, tag: CANOPY_SENSOR_TAG },
  ],
  ```
- `CanopyOverlapSystem` — runs AFTER `PhysicsStepSystem` (which calls `worldManager.step()` which drains collision events). Uses `CollisionEvents2d` sensor enter/exit buffers:
  ```typescript
  @ECSSystem()
  export class CanopyOverlapSystem implements IECSSystem {
    constructor(
      private readonly _collisionEvents: CollisionEvents2d,
      private readonly _canopyMarker: CanopyMarker,
      private readonly _playerBody: PlayerBody,
      private readonly _canopyFilter: CanopyMarkerFilter,
      private readonly _playerFilter: PlayerFilter,
    ) {}
    update(tick: number): void {
      const ce = this._collisionEvents;
      for (let i = 0; i < ce.sensorEnterCount; i++) {
        const nonSensor = ce.sensorEnterEntityA(i);
        const sensor = ce.sensorEnterEntityB(i);
        // Verify entities (check filter membership or component presence)
        const slot = this._playerBody.unsafe.playerSlot[nonSensor];
        this._canopyMarker.unsafe.overlapMask[sensor] |= (1 << slot);
      }
      for (let i = 0; i < ce.sensorExitCount; i++) {
        const nonSensor = ce.sensorExitEntityA(i);
        const sensor = ce.sensorExitEntityB(i);
        const slot = this._playerBody.unsafe.playerSlot[nonSensor];
        this._canopyMarker.unsafe.overlapMask[sensor] &= ~(1 << slot);
      }
    }
  }
  ```
  NOTE: Must validate that `nonSensor` is a player and `sensor` is a canopy entity before accessing their components. Use EntitiesManager.hasComponent or check array bounds.
- Systems order in `index.ts`:
  ```typescript
  export const MapTestSystems = [
    SavePrevTransformSystem,
    PlayerConnectionSystem,
    ApplyMoveInputSystem,
    PhysicsStepSystem,    // drains collision events
    CanopyOverlapSystem,  // reads sensor events, updates overlapMask
    PlayerLeaveSystem,
  ];
  ```
- In `MapTestRunnerWithMap`, after `createMapColliders(physics, placement.objects, mapData.registry, { skipTags: [CANOPY_SENSOR_TAG] })`:
  ```typescript
  import { sortPlacedObjects, CANOPY_SENSOR_TAG } from '@lagless/2d-map-generator';

  const sorted = sortPlacedObjects(placement.objects);
  for (let i = 0; i < sorted.length; i++) {
    const obj = sorted[i];
    const def = mapData.registry.get(obj.typeId);
    if (!def) continue;
    const canopySensor = def.colliders.find(c => c.tag === CANOPY_SENSOR_TAG && c.isSensor);
    if (!canopySensor) continue;

    // Create ECS entity
    const entity = this.Simulation.mem.entitiesManager.createEntity([
      Transform2d.id, PhysicsRefs.id, CanopyMarker.id
    ]);

    // Set transform
    const t = this.Simulation.mem.componentsManager.get(Transform2d).unsafe;
    t.positionX[entity] = obj.posX; t.positionY[entity] = obj.posY;
    t.prevPositionX[entity] = obj.posX; t.prevPositionY[entity] = obj.posY;

    // Set canopy marker
    const cm = this.Simulation.mem.componentsManager.get(CanopyMarker).unsafe;
    cm.objectIndex[entity] = i;    // sorted index = renderer index
    cm.overlapMask[entity] = 0;

    // Create Rapier sensor
    const sensorRadius = canopySensor.shape.type === ShapeType.Circle
      ? canopySensor.shape.radius * obj.scale : 0;
    const bodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(obj.posX, obj.posY);
    const body = this.PhysicsWorldManager.createBodyFromDesc(bodyDesc);
    const sensorDesc = rapier.ColliderDesc.ball(sensorRadius)
      .setSensor(true)
      .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS);
    const collider = this.PhysicsWorldManager.createColliderFromDesc(sensorDesc, body);

    // Store physics refs
    const pr = this.Simulation.mem.componentsManager.get(PhysicsRefs).unsafe;
    pr.bodyHandle[entity] = body.handle;
    pr.colliderHandle[entity] = collider.handle;

    // Register in ColliderEntityMap
    this.PhysicsWorldManager.registerCollider(collider.handle, entity);
  }

  this.Simulation.capturePreStartState();
  ```
  NOTE: Need to access components via `this.Simulation.mem.componentsManager.get()` since this runs in the constructor, before DI container is fully wired. Alternative: use `this.DIContainer.resolve()` if available at this point. Follow the pattern in `PlayerConnectionSystem` which uses DI-injected component refs.

  Actually, looking at `MapTestRunnerWithMap` — it already does `this.DIContainer.resolve(PRNG)` in the constructor (line 57). So DI is available. But for creating entities, the pattern in `PlayerConnectionSystem` uses `Prefab.create()` and `_EntitiesManager.createEntity()`. In the runner constructor, we'd use `Prefab` similarly.

**Definition of Done:**
- [ ] `CanopyMarker` component (objectIndex: uint16, overlapMask: uint8) generated via codegen
- [ ] `CanopyMarkerFilter` (include: Transform2d, PhysicsRefs, CanopyMarker) generated via codegen
- [ ] `TREE_DEF` includes canopy sensor collider with `tag: CANOPY_SENSOR_TAG, isSensor: true, radius: 128`
- [ ] `CanopyOverlapSystem` correctly processes sensor enter/exit events and updates overlapMask
- [ ] System is ordered AFTER PhysicsStepSystem in systems array
- [ ] Canopy ECS entities created with correct positions, physics bodies, sensor colliders, and registered in ColliderEntityMap
- [ ] `ActiveEvents.COLLISION_EVENTS` set on sensor colliders
- [ ] `capturePreStartState()` called AFTER canopy entity creation
- [ ] `pnpm exec nx typecheck @lagless/2d-map-test-simulation` passes

**Verify:**
- `pnpm exec nx typecheck @lagless/2d-map-test-simulation`

---

### Task 3: Integrate canopy transparency in game view

**Objective:** Wire canopy overlap state from ECS to the renderer. In `map-test-view.tsx`, refactor to expose `objectRenderer` via `useRef`. In `useTick`, iterate `CanopyMarkerFilter` entities, check local player's bit in `overlapMask`, call `setCanopyAlpha`.

**Dependencies:** Task 2

**Files:**
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx`

**Key Decisions / Notes:**
- Refactor: move `objectRenderer` to `useRef<MapObjectRenderer | null>(null)`. Assign in `useEffect`. Read from ref in `useTick`.
- In `useTick`:
  ```typescript
  const objRenderer = objectRendererRef.current;
  if (!objRenderer) return;

  // Get local player's overlap bit
  const localBit = 1 << localSlot;

  // Iterate canopy entities
  for (const entity of canopyFilter.entities) {
    const mask = canopyMarker.unsafe.overlapMask[entity];
    const isOverlapped = (mask & localBit) !== 0;
    const objIdx = canopyMarker.unsafe.objectIndex[entity];
    objRenderer.setCanopyAlpha(objIdx, isOverlapped ? 0.3 : 1.0);
  }
  ```
- Resolve `CanopyMarkerFilter` and `CanopyMarker` from DI via `useMemo` (same pattern as existing `playerFilter`, `transform2d`).
- Use smoothed player position for camera, but canopy alpha doesn't depend on interpolated position — it reads ECS state directly (overlapMask is updated by the deterministic system).

**Definition of Done:**
- [ ] `objectRendererRef.current` assigned in `useEffect`
- [ ] `CanopyMarkerFilter` and `CanopyMarker` resolved from DI
- [ ] `useTick` iterates canopy entities and calls `setCanopyAlpha` based on `overlapMask`
- [ ] `pnpm exec nx typecheck @lagless/2d-map-test-game` passes
- [ ] Manual: run game, walk player under tree → canopy alpha changes to 0.3; walk away → alpha 1.0

**Verify:**
- `pnpm exec nx typecheck @lagless/2d-map-test-game`
- Manual: run 2d-map-test game, walk player under tree, visually verify canopy transparency

---

## Testing Strategy

- **Unit (Task 1):** `createMapColliders` with skipTags — verify sensor colliders skipped/not skipped. `sortPlacedObjects` — verify tiebreaker behavior.
- **Unit (Task 2):** TypeScript typecheck for simulation with new components and system.
- **Integration (Task 3):** TypeScript typecheck for game client + manual visual test.
- **Manual:** Run 2d-map-test game, walk player under tree → canopy transparent. Walk away → opaque. With debug render on, verify sensor colliders visible.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sorted index mismatch between renderer and runner | Low | High | Both use shared `sortPlacedObjects` utility with `posY || posX` tiebreaker |
| ActiveEvents not set → no sensor events | Medium | High | Plan explicitly requires `setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS)` on sensor colliders |
| Entity pool budget exhausted with many canopy objects | Low | Medium | 200 trees = 200 entity slots. Default maxEntities is usually 1024+. Document if insufficient. |
| Sensor events not firing for fast-moving players | Low | Low | Binary alpha means even a single frame of overlap triggers the effect. Rapier broadphase handles fast colliders. |
| overlapMask overflow with >8 players | Low | Medium | uint8 = 8 bits = 8 player slots. Current games support ≤8 players. If needed, upgrade to uint16 or uint32. |

## Goal Verification

### Truths
1. `@lagless/2d-map-generator` exports `CANOPY_SENSOR_TAG`, `sortPlacedObjects`, and `createMapColliders` with `skipTags` option
2. Tree definition includes canopy sensor collider with `tag: CANOPY_SENSOR_TAG, isSensor: true`
3. `CanopyOverlapSystem` processes sensor enter/exit events and correctly updates `CanopyMarker.overlapMask`
4. Canopy ECS entities exist in simulation with Rapier sensor colliders (ActiveEvents enabled)
5. Game view reads `overlapMask` per frame and calls `setCanopyAlpha` for the local player
6. Walking under a tree makes the canopy transparent (alpha 0.3); walking away restores it (alpha 1.0)

### Artifacts
- `libs/2d-map/2d-map-generator/src/lib/physics/canopy-sensor-tag.ts` (CANOPY_SENSOR_TAG constant)
- `libs/2d-map/2d-map-generator/src/lib/utils/sort-placed-objects.ts` (shared sort utility)
- `libs/2d-map/2d-map-generator/src/lib/physics/create-map-colliders.ts` (skipTags refactor)
- `2d-map-test/2d-map-test-simulation/src/lib/systems/canopy-overlap.system.ts` (CanopyOverlapSystem)
- `2d-map-test/2d-map-test-simulation/src/lib/map-config/objects.ts` (canopy sensor in TREE_DEF)
- `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts` (canopy entity creation)
- `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx` (view integration)

### Key Links
- `TREE_DEF.colliders[1].tag === CANOPY_SENSOR_TAG` → skipped by `createMapColliders`, created as ECS entity sensors
- `CanopyOverlapSystem` → reads `CollisionEvents2d.sensorEnter/Exit` → writes `CanopyMarker.overlapMask`
- `MapTestRunnerWithMap` → creates canopy entities using `sortPlacedObjects` → `objectIndex` matches renderer's sorted order
- `map-test-view.tsx` → reads `CanopyMarker.overlapMask` → calls `MapObjectRenderer.setCanopyAlpha`
- `MapObjectRenderer.build()` → uses `sortPlacedObjects` → sorted index consistency guaranteed
