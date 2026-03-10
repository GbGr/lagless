# Move Map-Generator Setup to Simulation Layer

Created: 2026-03-08
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary
**Goal:** Move map generation, static collider creation, and pre-start state capture from `runner-provider.tsx` into a self-contained runner subclass in the simulation package.
**Architecture:** Create `MapTestRunnerWithMap` extending codegen'd `MapTestRunner`. It hardcodes Systems/Signals, generates the map from `ecsConfig.seed`, creates static colliders, and calls `capturePreStartState()` — all in its constructor. Runner-provider becomes a thin orchestrator.
**Tech Stack:** TypeScript, Rapier 2D, `@lagless/2d-map-generator`, `@lagless/physics2d`

## Scope
### In Scope
- New file `map-test-runner-with-map.ts` in simulation package with the custom runner subclass
- Helper functions `generateMapData(seed)` and `createMapColliders(wm, mapData, rapier)` in same file
- Fix hardcoded seed — use `ecsConfig.seed` (16-byte `RawSeed`) instead of `new Uint8Array([0,1,...,15])`
- Update `runner-provider.tsx` to use `MapTestRunnerWithMap` and remove map-gen boilerplate
- Export new runner from simulation index

### Out of Scope
- Changes to codegen'd `MapTestRunner` (never edit manually)
- Changes to `@lagless/2d-map-generator` library
- Changes to systems or game logic
- Larger seed support (32-bit derived from 128-bit RawSeed is sufficient)
- `map-gen-demo.screen.tsx` has its own independent map generation — not part of this refactor

## Context for Implementer

**Patterns to follow:**
- `circle-sumo/circle-sumo-game/src/app/game-view/runner-provider.tsx` — reference for a thin runner-provider (no pre-start physics setup)
- `MapTestRunner` at `2d-map-test-simulation/src/lib/schema/code-gen/MapTest.runner.ts` — codegen'd base class, extends `PhysicsRunner2d`

**Key constraint:** `MapData` must be in `extraRegistrations` at `super()` call time because `PlayerConnectionSystem` resolves it via DI in its constructor. So map generation must happen BEFORE `super()`.

**Sequence in the new runner constructor:**
1. `generateMapData(config.seed)` → returns `MapData` (pure computation, before super)
2. `super(config, ip, Systems, Signals, rapier, physicsConfig, undefined, [[MapData, mapData]])` — DI container built with MapData
3. `createMapColliders(this.PhysicsWorldManager, mapData, rapier)` — creates static Rapier bodies (after super, PhysicsWorldManager exists)
4. `this.Simulation.capturePreStartState()` — re-captures initial snapshot with colliders

**Key files:**
- `runner-provider.tsx` — current location of map setup (lines 44-58, 149-189)
- `map-data.ts` — `MapData` class (holds `IGeneratedMap` + `MapObjectRegistry`)
- `simple-seeded-random.ts` — `SimpleSeededRandom` used for deterministic generation
- `physics-simulation-base.ts` — `capturePreStartState()` method
- `standard-objects.ts` — `STANDARD_OBJECT_REGISTRY` with tree definition

**Seed derivation:** `seedToUint32(rawSeed: Uint8Array): number` takes first 4 bytes of 16-byte RawSeed as big-endian uint32. This is deterministic and sufficient for map generation.

**DI consumers of MapData (no changes needed):** `map-test-view.tsx` and `game-view.tsx` resolve `MapData` from `runner.DIContainer.resolve(MapData)`. The DI registration path is unchanged (extraRegistrations in super call), so these continue to work.

## Feature Inventory

| Source (runner-provider.tsx) | Target | Task |
|------------------------------|--------|------|
| `seedToUint32()` (L47-49) | `map-test-runner-with-map.ts` | Task 1 |
| `generateMap()` (L51-58) | `generateMapData()` in same file | Task 1 |
| Collider creation loop (L166-186) | `createMapColliders()` in same file | Task 1 |
| `MapData` construction (L151) | Inside `generateMapData()` | Task 1 |
| `capturePreStartState()` call (L189) | Runner constructor | Task 1 |
| Runner construction (L154-163) | Replaced by simpler constructor | Task 2 |
| `STANDARD_OBJECT_REGISTRY` import | Removed from runner-provider | Task 2 |
| `SpatialGridCollisionProvider` import | Removed from runner-provider | Task 2 |
| `createStandardGenerator` import | Removed from runner-provider | Task 2 |
| `SimpleSeededRandom` import | Removed from runner-provider | Task 2 |

## Progress Tracking
- [x] Task 1: Create MapTestRunnerWithMap
- [x] Task 2: Update runner-provider
- [x] Task 3: Verify
**Total Tasks:** 3 | **Completed:** 3 | **Remaining:** 0

## Implementation Tasks

### Task 1: Create MapTestRunnerWithMap

**Objective:** Create the custom runner subclass with map generation and collider setup in the simulation package.

**Files:**
- Create: `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts`
- Modify: `2d-map-test/2d-map-test-simulation/src/index.ts` (add export)

**Key Decisions / Notes:**
- `generateMapData(seed: Uint8Array): MapData` — pure function, extracts uint32 from seed, runs generator
- `createMapColliders(wm: PhysicsWorldManager2d, mapData: MapData, rapier: RapierModule2d): void` — iterates placement objects, creates fixed bodies with colliders
- `MapTestRunnerWithMap` constructor signature: `(config: ECSConfig, inputProvider: AbstractInputProvider, rapier: RapierModule2d, physicsConfig?: PhysicsConfig2d)`
- Hardcodes `MapTestSystems` and `MapTestSignals` internally

**Definition of Done:**
- [ ] `MapTestRunnerWithMap` builds without errors
- [ ] Constructor generates map from `config.seed` (ECSConfig.seed, 16-byte RawSeed) — not a hardcoded value
- [ ] Constructor creates colliders and captures pre-start state
- [ ] Exported from simulation index

**Verify:**
- `pnpm exec nx typecheck map-test-simulation`

### Task 2: Update runner-provider

**Objective:** Replace map-gen boilerplate in runner-provider.tsx with `MapTestRunnerWithMap` usage.

**Dependencies:** Task 1

**Files:**
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/runner-provider.tsx`

**Key Decisions / Notes:**
- Remove imports: `createStandardGenerator`, `SpatialGridCollisionProvider`, `STANDARD_OBJECT_REGISTRY`, `ObjectPlacementOutput`, `SimpleSeededRandom`
- Remove functions: `seedToUint32()`, `generateMap()`
- Remove from useEffect: map generation (L149-151), collider loop (L165-186), `capturePreStartState()` (L189)
- Replace `MapTestRunner` with `MapTestRunnerWithMap`
- Simplify constructor call: `new MapTestRunnerWithMap(ecsConfig, inputProvider, rapier, physicsConfig)`
- Remove `MapTestSystems`, `MapTestSignals` from imports (hardcoded in runner)
- Keep: relay connection, keyboard input, hash reporting, divergence signal, dev bridge

**Definition of Done:**
- [ ] runner-provider has no map-gen imports or logic
- [ ] Runner constructed with 4 args
- [ ] Game builds successfully

**Verify:**
- `pnpm exec nx typecheck map-test-game`

### Task 3: Verify

**Objective:** Full build and test suite pass.

**Dependencies:** Task 2

**Verify:**
- `npx vitest run --project=@lagless/2d-map-test-simulation`
- `pnpm exec nx build map-test-game`
- `pnpm exec nx lint map-test-simulation`

## Testing Strategy
- **Unit:** Existing simulation tests (`map-data.spec.ts`, `simple-seeded-random.spec.ts`) still pass
- **Build:** Both simulation and game packages typecheck and build
- **Manual:** Run game with debug physics overlay — colliders should align with sprites (verified by previous bugfix)

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DI resolution order issue with MapData | Low | High | MapData passed via extraRegistrations in super() — same mechanism as before |
| Seed change causes different map | Medium | Low | In multiplayer, seed comes from server — identical behavior. In singleplayer, ecsConfig.seed defaults to all-zeros (`ZERO_SEED`) which differs from the old hardcoded `[0,1,...,15]` — singleplayer will see a different map layout. This is expected and desired (fixes the TODO). |

## Goal Verification
### Truths
1. `runner-provider.tsx` has zero imports from `@lagless/2d-map-generator`
2. `runner-provider.tsx` has no `generateMap`, `seedToUint32`, or collider creation code
3. `MapTestRunnerWithMap` constructor takes only 4 params (config, inputProvider, rapier, physicsConfig?)
4. Game builds and typechecks successfully
5. Simulation tests pass

### Artifacts
- `map-test-runner-with-map.ts` — new file with runner subclass + helper functions
- `runner-provider.tsx` — simplified, no map-gen boilerplate

### Key Links
- `MapTestRunnerWithMap` → `MapTestRunner` (extends codegen'd class)
- `MapTestRunnerWithMap` → `MapData` (creates and injects via extraRegistrations)
- `MapTestRunnerWithMap` → `PhysicsWorldManager2d` (creates static colliders post-super)
- `runner-provider.tsx` → `MapTestRunnerWithMap` (simple 4-arg construction)
