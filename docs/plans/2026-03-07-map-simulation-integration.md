# Map-Simulation Integration Implementation Plan

Created: 2026-03-07
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Integrate the 2D map generator into the game simulation so players spawn on a generated map, trees have Rapier colliders that block players, terrain + objects are rendered in the game viewport, and `DebugPhysics2dRenderer` visualizes physics shapes. Create a proper `ViewportProvider` React component with camera follow for 2d-map-test.

**Architecture:** Map is generated client-side from `ECSConfig.seed` before the simulation starts, ensuring deterministic identical maps across all clients. The generated `IGeneratedMap` is injected into the simulation via `extraRegistrations`. Tree Rapier colliders are created **before simulation starts** (pre-tick, in RunnerProvider) so they are included in every Rapier snapshot and survive rollbacks. The game view uses a `ViewportProvider` wrapping pixi-viewport with player-follow camera, terrain rendering, and debug physics overlay.

**Tech Stack:** Rapier2D, Pixi.js 8, @pixi/react, pixi-viewport, @lagless/2d-map-generator, @lagless/2d-map-renderer, @lagless/pixi-react (DebugPhysics2dRenderer)

## Scope

### In Scope
- Generate map from seed in `RunnerProvider` before simulation starts
- Create DI injection token (`MapData` class) to pass `IGeneratedMap` + `MapObjectRegistry` into rendering
- Create tree Rapier colliders **pre-start** (before `runner.start()`) for rollback safety
- Use map dimensions from `IGeneratedMap` (standard generator: 800x800) — do NOT hardcode
- Update `PlayerConnectionSystem` spawn positions to use map center
- Create `ViewportProvider` React component with pixi-viewport, player-follow camera
- Render terrain + object sprites in the viewport
- Integrate `DebugPhysics2dRenderer` from `@lagless/pixi-react` as overlay
- Update `GameView` to compose all layers (viewport → terrain → objects → players → debug)
- Create `Loader` component at app level that initializes `MathOps` WASM and preloads game assets (tree texture)
- Extract `SimpleSeededRandom` to shared location to avoid duplication

### Out of Scope
- Server-side map generation or map serialization
- New object types beyond trees
- Multiplayer map seed negotiation (already handled by `ServerHello.seed`)
- Map regeneration during a match
- Minimap in game view (can be added later)

## Context for Implementer

> Write for an implementer who has never seen the codebase.

- **Patterns to follow:**
  - DI injection: `PhysicsRunner2d` at `libs/physics2d/src/lib/physics-runner-2d.ts:30-47` — `extraRegistrations` passes `[TokenClass, instance]` pairs into the DI container
  - System with DI: `player-connection.system.ts:7-23` — `@ECSSystem()` decorator, constructor injection
  - Viewport pattern: `circle-sumo-game/src/app/game-view/viewport-provider.tsx` — `ViewportProvider` with context, resize observer
  - Pixi-viewport setup: `map-gen-demo.screen.tsx:161-172` — drag/pinch/wheel/clampZoom
  - FilterViews usage: `map-test-view.tsx:7-17` — `FilterViews` renders per-entity views
  - Asset loading: `circle-sumo-game/src/app/game-view/assets-loader.tsx` — `AssetsLoader` loads MathOps + texture bundle with progress
  - App-level loading: `roblox-like-game/src/app/app.tsx:12-29` — `Loading` component gates children on MathOps.init()

- **Conventions:**
  - Systems: `*.system.ts` files in `2d-map-test-simulation/src/lib/systems/`
  - System execution order defined in `systems/index.ts` array — order matters for determinism
  - All math: `MathOps` from `@lagless/math`, never `Math.*` trig. `MathOps.init()` must be called before use.
  - Collision shapes: `MapCollisionShape` is `circle` (offsetX, offsetY, radius) or `aabb` (halfWidth, halfHeight)

- **Key files:**
  - `2d-map-test-simulation/src/lib/arena.ts` — Arena constants (speed, radius, etc.)
  - `2d-map-test-simulation/src/lib/systems/index.ts` — System execution order
  - `2d-map-test-game/src/app/game-view/runner-provider.tsx` — Initializes runner, loads Rapier, sets up input
  - `2d-map-test-game/src/app/game-view/game-view.tsx` — Top-level game component
  - `2d-map-test-game/src/app/game-view/map-test-view.tsx` — Renders player entities
  - `libs/2d-map/2d-map-generator/src/lib/presets/standard-map.ts` — `createStandardGenerator()` factory (produces 800x800 map: baseWidth=720, scale=1.0, extension=80)
  - `libs/2d-map/2d-map-generator/src/lib/presets/standard-objects.ts` — Tree definition with `STANDARD_OBJECT_REGISTRY`
  - `libs/2d-map/2d-map-renderer/src/lib/core/map-terrain-renderer.ts` — `MapTerrainRenderer.buildTerrain(map)`
  - `libs/pixi-react/src/lib/debug-physics-2d/debug-physics-2d-renderer.tsx` — `DebugPhysics2dRenderer` React component

- **Gotchas:**
  - `MathOps.init()` is async WASM init — must complete before `createStandardGenerator` / `generate()`. Handled by the `Loader` component at app level.
  - The ECS `PRNG` must NOT be used for map generation — it would desync state between clients. Use a separate `SimpleSeededRandom` from `ECSConfig.seed`.
  - **Rollback safety:** Tree colliders MUST be created before `runner.start()` so they exist in the initial Rapier world state and are included in every snapshot. Using a system with `tick === 1` is NOT safe — the `_initialized` flag survives rollback (JS state) but the Rapier world is restored from snapshot (losing the colliders). Pre-start creation avoids this entirely.
  - **Late-join:** When a client late-joins via state transfer, the Rapier snapshot they receive already contains tree colliders (because they were created pre-start and exist in every snapshot).
  - `SpatialGridCollisionProvider` (not `RapierCollisionProvider`) should be used for generation overlap checking — simpler, no extra Rapier world needed, matches the existing demo pattern.
  - The `MapTestRunner` constructor signature: `(Config, InputProvider, Systems, Signals, rapier, physicsConfig?, collisionLayers?, extraRegistrations?)` — must pass `undefined` for `collisionLayers` before `extraRegistrations`.
  - pixi-viewport `extend({ Viewport })` must be called and `global.d.ts` type augmentation must exist.
  - `ObjectPlacementOutput.objects` contains `PlacedObject[]` with `posX`, `posY`, `rotation`, `scale`, `type`.
  - Tree collision shape from `STANDARD_OBJECTS`: `{ type: 'circle', offsetX: 0, offsetY: 0, radius: 3 }` with `scaleRange: [0.8, 1.2]`.
  - Standard generator produces 800x800 map (720 * 1.0 + 80 = 800). Do NOT hardcode 1080 — use `map.width`/`map.height` from `IGeneratedMap`.

- **Domain context:**
  - The map generator produces terrain polygons (shore, grass, rivers, lakes) and placed objects (trees).
  - The simulation uses Rapier 2D for physics. Players are dynamic bodies, trees should be fixed bodies.
  - In multiplayer, `ServerHello.seed` provides a shared seed. In local play, `ECSConfig` generates a random seed.
  - All clients must produce identical maps from the same seed → same PRNG, same generation code, before any simulation ticks.

## Runtime Environment

- **Server:** `pnpm exec nx serve @lagless/2d-map-test-server` (port 3336)
- **Client:** `pnpm exec nx serve @lagless/2d-map-test-game` (Vite, port configured in project.json)
- **Typecheck:** `pnpm exec nx typecheck @lagless/2d-map-test-simulation && pnpm exec nx typecheck @lagless/2d-map-test-game`
- **Tests:** `npx vitest run --project=@lagless/2d-map-test-simulation`

## Progress Tracking

- [x] Task 1: MapData injection token & SimpleSeededRandom extraction
- [x] Task 2: Loader component (MathOps + asset preloading)
- [x] Task 3: Map generation & tree collider creation in RunnerProvider
- [x] Task 4: ViewportProvider React component
- [x] Task 5: Terrain + objects + debug physics rendering in game view
- [x] Task 6: Player spawn on map & camera follow

**Total Tasks:** 6 | **Completed:** 6 | **Remaining:** 0

## Implementation Tasks

### Task 1: MapData injection token & SimpleSeededRandom extraction

**Objective:** Create a `MapData` class as DI injection token that holds the generated map and object registry. Extract `SimpleSeededRandom` to the simulation package for reuse. Update `MapTestArena` to remove hardcoded width/height (use map dimensions instead).

**Dependencies:** None

**Files:**
- Create: `2d-map-test/2d-map-test-simulation/src/lib/map-data.ts`
- Create: `2d-map-test/2d-map-test-simulation/src/lib/simple-seeded-random.ts`
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/arena.ts` — remove width/height (now comes from map)
- Modify: `2d-map-test/2d-map-test-simulation/src/index.ts` — export new classes
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/systems/player-connection.system.ts` — use `MapData` for spawn position instead of `MapTestArena.width/height`
- Modify: `2d-map-test/2d-map-test-game/src/app/screens/map-gen-demo.screen.tsx` — use shared `SimpleSeededRandom`
- Test: `2d-map-test/2d-map-test-simulation/src/lib/__tests__/map-data.spec.ts`

**Key Decisions / Notes:**
- `MapData` is a simple class (not an interface) because the DI container uses the class constructor as the injection token.
- It holds `map: IGeneratedMap` and `registry: MapObjectRegistry` as readonly properties set in constructor.
- `SimpleSeededRandom` implements `ISeededRandom` from `@lagless/2d-map-generator`. Extract from `map-gen-demo.screen.tsx:17-31`.
- Remove `width`/`height` from `MapTestArena` — systems that need map dimensions should get them from `MapData.map.width`/`MapData.map.height`.
- Export both classes from the simulation package's `index.ts`.

**Definition of Done:**
- [ ] `MapData` class exists with `map: IGeneratedMap` and `registry: MapObjectRegistry` properties
- [ ] `SimpleSeededRandom` class implements `ISeededRandom` and is exported
- [ ] `MapTestArena` no longer has hardcoded width/height
- [ ] `PlayerConnectionSystem` uses `MapData.map.width/height` for spawn positions
- [ ] Both classes are exported from `@lagless/2d-map-test-simulation`
- [ ] `map-gen-demo.screen.tsx` uses shared `SimpleSeededRandom`
- [ ] Tests verify `MapData` construction and `SimpleSeededRandom` determinism
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/2d-map-test-simulation`

---

### Task 2: Loader component (MathOps + asset preloading)

**Objective:** Create a `Loader` React component that initializes `MathOps` WASM and preloads game assets (tree texture) before rendering children. Wrap the router in `app.tsx` so both game view and map-gen-demo benefit.

**Dependencies:** None

**Files:**
- Create: `2d-map-test/2d-map-test-game/src/app/loader.tsx`
- Modify: `2d-map-test/2d-map-test-game/src/app/app.tsx` — wrap `RouterProvider` with `Loader`
- Modify: `2d-map-test/2d-map-test-game/src/app/screens/map-gen-demo.screen.tsx` — remove inline `MathOps.init()` / `loadAll()` (now handled by Loader)

**Key Decisions / Notes:**
- Follow `circle-sumo-game/src/app/game-view/assets-loader.tsx` pattern: `Promise.all([MathOps.init(), Assets.loadBundle()])`.
- Assets bundle: tree texture (`tree.png`), possibly more in future.
- Show `null` (or a simple loading indicator) while loading; show error on failure.
- `map-gen-demo.screen.tsx` currently calls `MathOps.init()` + `Assets.load(tree)` in its own `loadAll()`. After this task, MathOps and tree texture are already loaded by `Loader`, so `map-gen-demo` can simplify its init (just `generateMap()` synchronously, tree texture already cached by Pixi's `Assets`).

**Definition of Done:**
- [ ] `Loader` component exists and initializes MathOps + preloads tree texture
- [ ] `app.tsx` wraps `RouterProvider` with `Loader`
- [ ] `map-gen-demo.screen.tsx` no longer calls `MathOps.init()` or loads tree texture (already done by Loader)
- [ ] Game starts without errors, assets available when game view renders
- [ ] No diagnostics errors

**Verify:**
- Manual: App loads, then routes work. Map-gen-demo still renders correctly.

---

### Task 3: Map generation & tree collider creation in RunnerProvider

**Objective:** Generate the map from seed in `RunnerProvider` before creating the `MapTestRunner`, create tree Rapier colliders pre-start, and pass `MapData` via `extraRegistrations`.

**Dependencies:** Task 1, Task 2

**Files:**
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/runner-provider.tsx`

**Key Decisions / Notes:**
- `MathOps` and tree texture are already initialized by the `Loader` component (Task 2). No need to init here.
- Create `SimpleSeededRandom` from `ecsConfig.seed`.
- Use `SpatialGridCollisionProvider` for generation overlap checking — dimensions from generated map (NOT hardcoded). Pass `map.width, map.height, 64` to constructor.
- Call `createStandardGenerator().generate(random, collision)` → `IGeneratedMap`.
- Create `MapData(generatedMap, STANDARD_OBJECT_REGISTRY)`.
- Constructor call: `new MapTestRunner(config, inputProvider, MapTestSystems, MapTestSignals, rapier, physicsConfig, undefined, [[MapData, mapData]])` — note `undefined` for `collisionLayers` parameter.
- **After** constructing runner, **before** `runner.start()`: iterate `ObjectPlacementOutput.objects` and create Rapier fixed bodies + colliders in `runner.PhysicsWorldManager`:
  ```
  for each obj in placement.objects:
    def = registry.get(obj.type)
    bodyDesc = RigidBodyDesc.fixed().setTranslation(posX, posY).setRotation(rotation)
    body = worldManager.createBodyFromDesc(bodyDesc)
    if circle: ColliderDesc.ball(radius * scale)
    if aabb: ColliderDesc.cuboid(hw * scale, hh * scale)
    worldManager.createColliderFromDesc(colliderDesc, body)
  ```
- This ensures tree colliders exist in the initial Rapier world state, surviving all rollbacks and state transfers.

**Definition of Done:**
- [ ] Map is generated from seed before runner starts
- [ ] `MapData` is injected via `extraRegistrations` (with `undefined` for collisionLayers)
- [ ] Map generation uses `SimpleSeededRandom` (not ECS PRNG) and `SpatialGridCollisionProvider`
- [ ] Tree Rapier colliders are created pre-start (before `runner.start()`)
- [ ] No diagnostics errors

**Verify:**
- Manual: Start local game, verify no crash. Trees should block player movement.

---

### Task 4: ViewportProvider React component

**Objective:** Create a proper `ViewportProvider` component for 2d-map-test using pixi-viewport with context, resize handling.

**Dependencies:** None (can be done in parallel with Tasks 1-3)

**Files:**
- Create: `2d-map-test/2d-map-test-game/src/app/game-view/viewport-provider.tsx`
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/game-view.tsx` — add `extend({ Viewport })`, use `ViewportProvider`

**Key Decisions / Notes:**
- Follow pattern from `circle-sumo-game/src/app/game-view/viewport-provider.tsx`
- Create `ViewportContext` with `useViewport()` hook
- Use `<viewport>` JSX element from `@pixi/react` + `extend({ Viewport })` + `global.d.ts` (already exists)
- Props: `worldWidth/worldHeight` — use values from runner context (MapData.map.width/height)
- Interactions: `drag().pinch().wheel().clampZoom({ minScale: 0.5, maxScale: 8 })`
- Export `useViewport()` for child components to access the viewport instance
- ResizeObserver on renderer canvas for responsive sizing

**Definition of Done:**
- [ ] `ViewportProvider` renders pixi-viewport with drag/pinch/wheel
- [ ] `useViewport()` hook provides viewport instance to children
- [ ] Resize observer handles window resize
- [ ] No diagnostics errors

**Verify:**
- Manual: Game loads, viewport is interactive with drag/wheel zoom

---

### Task 5: Terrain + objects + debug physics rendering in game view

**Objective:** Render the generated map terrain, tree sprites, and `DebugPhysics2dRenderer` overlay inside the viewport. Refactor `MapTestView` and `GameView` to compose all layers.

**Dependencies:** Task 3, Task 4

**Files:**
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx`
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/game-view.tsx`

**Key Decisions / Notes:**
- In `MapTestView` (inside viewport):
  - Use `MapTerrainRenderer.buildTerrain(map)` to create terrain container, add to viewport
  - Create tree sprites from `ObjectPlacementOutput.objects` using the pre-loaded tree texture
  - Use `DebugPhysics2dRenderer` from `@lagless/pixi-react` with `getBuffers={() => runner.PhysicsWorldManager.debugRender()}`, pass viewport container as `parent`
- `GameView` composition: `ViewportProvider` → `MapTestView` (terrain + objects + players + debug)
- Tree texture: pre-loaded in runner-provider (Task 2), passed via context or props
- Terrain rendering is a Pixi Container — created once in useEffect, destroyed on cleanup
- Tree texture must exist at `2d-map-test-game/src/assets/tree.png` (already present from map-gen-demo work)

**Definition of Done:**
- [ ] Terrain (ocean, beach, grass, rivers) renders in game viewport
- [ ] Tree sprites render at correct positions with correct scale/rotation
- [ ] Tree texture asset exists at correct path and is loaded before rendering
- [ ] `DebugPhysics2dRenderer` shows physics wireframes in the viewport
- [ ] All rendering layers compose correctly (terrain → objects → players → debug)
- [ ] No diagnostics errors

**Verify:**
- Manual: Start game, see terrain + trees + physics wireframes + player

---

### Task 6: Player spawn on map & camera follow

**Objective:** Update player spawn logic to place players in the grass area of the map. Implement camera follow using VisualSmoother2d interpolated positions.

**Dependencies:** Task 3, Task 4, Task 5

**Files:**
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/systems/player-connection.system.ts`
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/map-test-view.tsx`

**Key Decisions / Notes:**
- **Spawn position:** Center of map (`map.width / 2, map.height / 2`) with spacing per slot. Map center is well within grass area (grass inset ~18px from shore, shore ~48px from edge).
- **Camera follow:** In `MapTestView`, use `useTick` to call `viewport.moveCenter(playerX, playerY)` each frame. Use `VisualSmoother2d` interpolated position for the local player for smooth camera (not raw Transform2d which would stutter between sim ticks).
- Local player entity: resolve from `PlayerResource` using `inputProvider.playerSlot` (for Relay) or slot 0 (for Local).

**Definition of Done:**
- [ ] Players spawn near map center in grass area
- [ ] Camera follows local player using VisualSmoother2d interpolated position, updating every render frame via useTick
- [ ] Multiple players spawn at different positions (spaced by slot)
- [ ] No diagnostics errors

**Verify:**
- Manual: Player appears in grass, camera follows movement smoothly, trees block movement

## Testing Strategy

- **Unit tests:** `MapData` construction, `SimpleSeededRandom` determinism (Task 1)
- **Integration tests:** Not feasible without full Rapier WASM — covered by manual testing
- **Manual verification:** Start game locally, verify terrain rendering, tree collisions, camera follow, debug physics overlay

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Map generation not deterministic from seed | Low | High | Use separate `SimpleSeededRandom` seeded from `ECSConfig.seed`, never ECS PRNG. Map generator already tested for determinism. |
| Tree colliders lost on rollback | N/A | N/A | Eliminated by design: colliders created pre-start, included in initial Rapier snapshot, survive all rollbacks and state transfers. |
| Tree colliders desync between clients | Low | High | All clients create identical colliders from identical `MapData` (same seed). Creation is deterministic (no randomness). |
| Performance: many tree colliders | Medium | Medium | Trees use simple circle colliders (cheap). Rapier handles static bodies efficiently. density=100 on 800x800 → ~26 trees. |
| MathOps not initialized before generation | Low | High | `Loader` component at app level ensures MathOps is initialized before any route renders. |

## Goal Verification

### Truths
1. A generated map with terrain (grass, beach, ocean, rivers) is visible when playing the game
2. Trees are rendered as sprites at their generated positions
3. Players cannot walk through trees (Rapier collision blocks movement)
4. The camera follows the local player smoothly using interpolated position
5. Debug physics wireframes show tree colliders and player body
6. Multiple clients produce identical maps from the same seed (deterministic)
7. The viewport supports drag/pinch/wheel interaction

### Artifacts
1. `2d-map-test-simulation/src/lib/map-data.ts` — DI token for map + registry
2. `2d-map-test-simulation/src/lib/simple-seeded-random.ts` — Shared PRNG implementation
3. `2d-map-test-game/src/app/loader.tsx` — App-level Loader (MathOps + asset preloading)
4. `2d-map-test-game/src/app/game-view/viewport-provider.tsx` — Viewport React component
5. `2d-map-test-game/src/app/game-view/runner-provider.tsx` — Map generation + tree colliders
6. `2d-map-test-game/src/app/game-view/map-test-view.tsx` — Terrain + objects + debug rendering

### Key Links
1. `ECSConfig.seed` → `SimpleSeededRandom` → `MapGenerator.generate()` → `IGeneratedMap`
2. `IGeneratedMap` → `MapData` → `extraRegistrations` → `MapTestRunner` DI → rendering components
3. `RunnerProvider` → `PhysicsWorldManager.createBodyFromDesc()` (pre-start) → Rapier world colliders (rollback-safe)
4. `MapTerrainRenderer.buildTerrain(map)` → pixi-viewport Container → rendered terrain
5. `DebugPhysics2dRenderer.getBuffers` → `PhysicsWorldManager2d.debugRender()` → wireframe overlay
