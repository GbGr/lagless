# Rapier Warm-Start Migration Implementation Plan

Created: 2026-03-09
Status: VERIFIED
Approved: Yes
Iterations: 1
Worktree: No
Type: Feature

## Summary

**Goal:** Replace `@dimforge/rapier2d-deterministic-compat` with `@lagless/rapier2d-deterministic-compat` (v0.19.3), disable warm-starting via `warmstartCoefficient=0` to eliminate desync, remove the normalize hack from `saveSnapshot()`, and optimize `snapshotRate`.

**Architecture:** The `@lagless/rapier2d-deterministic-compat` package exposes `warmstartCoefficient` getter/setter on `IntegrationParameters`. Setting it to 0 makes Rapier skip the entire warm-start phase (`velocity_solver.rs:180`), so solver cache never accumulates differently between linear and rollback clients. This eliminates the root cause of desync and makes the expensive normalize trick (serialize+deserialize every snapshot) unnecessary.

**Tech Stack:** TypeScript, Rapier 2D WASM (v0.19.3), Vitest

## Scope

### In Scope
- Replace `@dimforge/rapier2d-deterministic-compat` → `@lagless/rapier2d-deterministic-compat` in all packages
- Add `warmstartCoefficient` to `PhysicsConfig2d` (default: 0)
- Apply `warmstartCoefficient` in `PhysicsWorldManager2d` constructor
- Add `integrationParameters` to `RapierWorld2d` type interface
- Remove normalize hack from `PhysicsSimulationBase.saveSnapshot()` and `capturePreStartState()`
- Increase default `snapshotRate` from 1 to 5
- TDD: test proving warm-start divergence and that `warmstartCoefficient=0` fixes it
- Update project rules and docs referencing `@dimforge`

### Out of Scope
- 3D physics packages (`@dimforge/rapier3d-*`) — not affected
- Rapier package builds/publishing — already done
- Game logic changes — no game code needs modification (config default handles it)
- Historical plan files referencing @dimforge (e.g., `docs/plans/2026-03-07-2d-map-generator.md`, `plans/scalable-chasing-church.md`) — these are archived plans, not production code

## Context for Implementer

> Write for an implementer who has never seen the codebase.

- **Patterns to follow:**
  - Test files: `libs/physics2d/src/lib/__tests__/rapier-snapshot-drift.spec.ts` — Rapier-level test pattern (beforeAll with init, createWorld helper)
  - Config pattern: `libs/physics2d/src/lib/physics-config-2d.ts` — immutable config with partial options constructor
  - Type pattern: `libs/physics2d/src/lib/rapier-types-2d.ts` — minimal interfaces for Rapier API surface

- **Conventions:**
  - Tests use `vitest` globals (`describe`, `it`, `expect`, `beforeAll`)
  - Import Rapier: `import RAPIER from '@lagless/rapier2d-deterministic-compat'`
  - Cast: `rapier = RAPIER as unknown as RapierModule2d`

- **Key files:**
  - `libs/physics2d/src/lib/physics-config-2d.ts` — PhysicsConfig2d class (gravity, substeps — add warmstartCoefficient here)
  - `libs/physics2d/src/lib/physics-world-manager-2d.ts` — Creates Rapier World, manages snapshot/restore
  - `libs/physics2d/src/lib/rapier-types-2d.ts` — Type interfaces for Rapier 2D API (needs `integrationParameters`)
  - `libs/physics-shared/src/lib/physics-simulation-base.ts` — Contains the normalize hack in `saveSnapshot()` and `capturePreStartState()`
  - `libs/core/src/lib/ecs-config.ts` — ECSConfig with `snapshotRate` default

- **Gotchas:**
  - `PhysicsConfig2d` constructor uses `Partial<Pick<...>>` pattern — must update the Pick list when adding fields
  - `RapierWorld2d` interface is the type abstraction — `world.integrationParameters` must be typed here
  - The normalize hack has TWO locations: `saveSnapshot()` (line 59) and `capturePreStartState()` (line 44)
  - 18 source files (16 .ts + 2 .tsx) import `@dimforge/rapier2d-deterministic-compat` — all must be updated
  - 4 package.json files reference the dep (some as peerDeps, some as devDeps, some as regular deps)
  - `libs/physics2d/eslint.config.mjs` has `@dimforge` in `ignoredDependencies` — must be updated
  - `libs/physics2d/README.md` has 4 @dimforge references — must be updated
  - `PhysicsWorldManager2d.restoreSnapshot()` creates a NEW world via `rapier.World.restoreSnapshot()` — must re-apply `warmstartCoefficient` after every restore (the restored world resets integration params)
  - The `2d-map-generator` package has an optional peerDep on rapier — update that too

- **Domain context:**
  - **Warm-starting:** Rapier caches solver impulses from the previous frame to speed convergence. These cached values (`warmstart_impulse` in `ContactData`) are serialized in snapshots. When two clients have different rollback frequencies, they accumulate different cache values → different solver convergence → float32 position divergence.
  - **Normalize hack:** Current workaround does `takeSnapshot()` + `restoreSnapshot()` every `saveSnapshot()` call, which forces both clients through the same serialization roundtrip (resetting solver cache). Costs ~3-5KB serialize+deserialize at 60fps.
  - **The fix:** `warmstartCoefficient=0` makes Rapier skip warm-starting entirely (checked in `velocity_solver.rs:180`). Solver always starts from zero impulses → no divergent cache → no divergence → normalize unnecessary.

## Progress Tracking

- [x] Task 1: Replace @dimforge → @lagless dependency
- [x] Task 2: TDD — Warm-start divergence proof test
- [x] Task 3: Add warmstartCoefficient to PhysicsConfig2d + PhysicsWorldManager2d
- [x] Task 4: Remove normalize hack from PhysicsSimulationBase
- [x] Task 5: Optimize snapshotRate + update docs

**Total Tasks:** 5 | **Completed:** 5 | **Remaining:** 0

## Implementation Tasks

### Task 1: Replace @dimforge → @lagless dependency

**Objective:** Replace all references to `@dimforge/rapier2d-deterministic-compat` with `@lagless/rapier2d-deterministic-compat` across the entire codebase.

**Dependencies:** None

**Files:**
- Modify: `libs/physics2d/package.json` (peerDep `>=0.15.0` + devDep `^0.19.3`)
- Modify: `libs/2d-map/2d-map-generator/package.json` (peerDep `>=0.14.0`)
- Modify: `2d-map-test/2d-map-test-game/package.json` (dep `^0.19.3`)
- Modify: `tools/create/templates/pixi-react/__packageName__-frontend/package.json` (dep `^0.19.3`)
- Modify: `libs/physics2d/eslint.config.mjs` (ignoredDependencies)
- Modify: `libs/physics2d/README.md` (4 @dimforge references)
- Modify: 18 source files with imports (16 .ts + 2 .tsx, see list below)

**Source files to update:**
- `libs/physics2d/src/lib/__tests__/rapier-snapshot-drift.spec.ts`
- `libs/physics2d/src/lib/__tests__/rapier-narrowphase-reset-fix.spec.ts`
- `libs/physics2d/src/lib/__tests__/rapier-divergence-trace.spec.ts`
- `libs/physics2d/src/lib/__tests__/rapier-rollback-input-divergence.spec.ts`
- `libs/physics2d/src/lib/__tests__/rapier-realworld-rollback-desync.spec.ts`
- `libs/physics2d/src/lib/__tests__/rapier-save-restore-drift.spec.ts`
- `libs/physics2d/src/lib/__tests__/physics-simulation-2d.spec.ts`
- `libs/physics2d/src/lib/__tests__/physics-desync-intensive.spec.ts`
- `libs/physics2d/src/lib/__tests__/determinism.spec.ts`
- `libs/physics2d/src/lib/__tests__/physics-step-sync-2d.spec.ts`
- `libs/physics2d/src/lib/__tests__/physics-world-manager-2d.spec.ts`
- `libs/physics2d/src/lib/__tests__/physics-determinism-2d.spec.ts`
- `libs/physics2d/src/lib/__tests__/collision-events-2d.spec.ts`
- `libs/2d-map/2d-map-generator/src/lib/collision/rapier-provider.ts` (doc comment only)
- `libs/2d-map/2d-map-generator/src/__tests__/collision/rapier-provider.spec.ts`
- `libs/physics2d/src/lib/rapier-types-2d.ts` (doc comment only)
- `2d-map-test/2d-map-test-game/src/app/game-view/runner-provider.tsx`
- `tools/create/templates/pixi-react/__packageName__-frontend/src/app/game-view/runner-provider.tsx`

**Key Decisions / Notes:**
- Straight find-and-replace: `@dimforge/rapier2d-deterministic-compat` → `@lagless/rapier2d-deterministic-compat`
- Keep same version ranges (>=0.14.0, >=0.15.0, ^0.19.3) since @lagless is API-compatible at v0.19.3
- Run `pnpm install` after changes
- The @lagless package is a superset of @dimforge (adds warmstartCoefficient) — all existing code works unchanged

**Definition of Done:**
- [ ] All 4 package.json files reference @lagless instead of @dimforge
- [ ] All 18 source files import from @lagless (16 .ts + 2 .tsx)
- [ ] `libs/physics2d/eslint.config.mjs` references @lagless in ignoredDependencies
- [ ] `libs/physics2d/README.md` references @lagless (not @dimforge)
- [ ] `pnpm install` succeeds
- [ ] Existing physics2d tests pass: `npx vitest run --project=@lagless/physics2d`

**Verify:**
- `pnpm install && npx vitest run --project=@lagless/physics2d`

---

### Task 2: TDD — Warm-start divergence proof test

**Objective:** Write a test that proves warm-starting causes divergence between linear and rollback simulations, and that `warmstartCoefficient=0` eliminates it.

**Dependencies:** Task 1

**Files:**
- Create: `libs/physics2d/src/lib/__tests__/warmstart-divergence.spec.ts`

**Key Decisions / Notes:**
- Pattern: two identical Rapier worlds, identical inputs
  - World A ("linear"): steps continuously, never does save/restore → accumulates warm-start cache naturally
  - World B ("rollback"): periodically does save→restore→resimulate cycles → warm-start cache gets reset by restore
- With `warmstartCoefficient=1` (default): positions diverge after enough ticks+rollbacks
- With `warmstartCoefficient=0`: positions remain identical
- Access warmstartCoefficient via `world.integrationParameters.warmstartCoefficient` (raw Rapier API, bypass our types)
- Use enough complexity (20+ static obstacles, 500+ ticks, frequent rollbacks) to trigger visible divergence
- Follow existing test pattern from `rapier-snapshot-drift.spec.ts`

**Test structure:**
```
describe('Warm-start divergence')
  it('should diverge with warmstartCoefficient=1 (linear vs rollback)')
    - Create two worlds, step both identically but world B does periodic restore cycles
    - Expect final positions to differ (proves the problem exists)
  it('should NOT diverge with warmstartCoefficient=0 (linear vs rollback)')
    - Same setup but set warmstartCoefficient=0 on both worlds
    - Expect final positions to be identical (proves the fix works)
```

**Definition of Done:**
- [ ] Test file exists and runs
- [ ] First test demonstrates meaningful divergence with warmstartCoefficient=1 (position diff >= 1e-6, not floating point noise)
- [ ] Second test demonstrates zero divergence with warmstartCoefficient=0 (positions bit-identical)
- [ ] Tests pass: `npx vitest run --project=@lagless/physics2d src/lib/__tests__/warmstart-divergence.spec.ts`

**Verify:**
- `npx vitest run --project=@lagless/physics2d src/lib/__tests__/warmstart-divergence.spec.ts`

---

### Task 3: Add warmstartCoefficient to PhysicsConfig2d + PhysicsWorldManager2d

**Objective:** Add `warmstartCoefficient` configuration to the physics config and apply it when creating the Rapier world. Update type interfaces for type safety.

**Dependencies:** Task 1

**Files:**
- Modify: `libs/physics2d/src/lib/physics-config-2d.ts`
- Modify: `libs/physics2d/src/lib/physics-world-manager-2d.ts`
- Modify: `libs/physics2d/src/lib/rapier-types-2d.ts`
- Test: `libs/physics2d/src/lib/__tests__/physics-world-manager-2d.spec.ts`

**Key Decisions / Notes:**

1. **PhysicsConfig2d** — add `warmstartCoefficient` field:
   - Default: `0` (disabled — safe for determinism)
   - Type: `number`
   - Update the `Partial<Pick<...>>` in constructor to include new field

2. **RapierWorld2d** — add `integrationParameters` property:
   ```typescript
   export interface RapierIntegrationParameters {
     warmstartCoefficient: number;
   }
   ```
   Add to `RapierWorld2d`: `integrationParameters: RapierIntegrationParameters;`

3. **PhysicsWorldManager2d constructor** — after creating world, set:
   ```typescript
   this._world.integrationParameters.warmstartCoefficient = _config.warmstartCoefficient;
   ```

4. **PhysicsWorldManager2d.restoreSnapshot()** — CRITICAL: `rapier.World.restoreSnapshot()` creates a NEW World object. The new world's `integrationParameters` resets to defaults (warmstartCoefficient=1). Must re-apply after every restore:
   ```typescript
   this._world = restored;
   this._world.integrationParameters.warmstartCoefficient = this._config.warmstartCoefficient;
   ```

**Definition of Done:**
- [ ] PhysicsConfig2d has `warmstartCoefficient` field (default 0)
- [ ] RapierWorld2d interface includes `integrationParameters`
- [ ] PhysicsWorldManager2d applies warmstartCoefficient in constructor AND after restoreSnapshot()
- [ ] Unit test verifies warmstartCoefficient is set on the world after creation
- [ ] Unit test verifies warmstartCoefficient is preserved after a restore cycle
- [ ] All physics2d tests pass

**Verify:**
- `npx vitest run --project=@lagless/physics2d`

---

### Task 4: Remove normalize hack from PhysicsSimulationBase

**Objective:** Remove the expensive normalize trick (takeSnapshot + restoreSnapshot) from `saveSnapshot()` and `capturePreStartState()` since `warmstartCoefficient=0` makes it unnecessary.

**Dependencies:** Task 3

**Files:**
- Modify: `libs/physics-shared/src/lib/physics-simulation-base.ts`

**Key Decisions / Notes:**

1. **`saveSnapshot()` (lines 48-61)** — Remove lines 53-60:
   - Keep: `const rapierSnap = this._physicsWorldManager.takeSnapshot();` and `this._rapierSnapshotHistory.set(tick, rapierSnap);`
   - Remove: the `restoreSnapshot(rapierSnap)` call and `_colliderEntityMapRebuildFn?.()` call
   - Remove: the comment block explaining the normalize hack

2. **`capturePreStartState()` (lines 40-46)** — Remove lines 43-45:
   - Keep: `this._initialSnapshot = this.mem.exportSnapshot();` and `this._initialRapierSnapshot = this._physicsWorldManager.takeSnapshot();`
   - Remove: `this._physicsWorldManager.restoreSnapshot(this._initialRapierSnapshot);` and `this._colliderEntityMapRebuildFn?.();`
   - Remove: the "Normalize initial Rapier state" comment

3. The `_colliderEntityMapRebuildFn` is still needed for `rollback()` and `applyStateFromTransfer()` — do NOT remove the field or the setter.

**Definition of Done:**
- [ ] `saveSnapshot()` only takes and stores the snapshot — no restore/rebuild
- [ ] `capturePreStartState()` only captures snapshots — no restore/rebuild
- [ ] `_colliderEntityMapRebuildFn` still used in `rollback()` and `applyStateFromTransfer()`
- [ ] physics2d tests pass (determinism, simulation, desync)
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/physics2d`

---

### Task 5: Optimize snapshotRate + update docs

**Objective:** Increase the default `snapshotRate` from 1 to 5 for performance, and update all documentation referencing `@dimforge`.

**Dependencies:** Task 4

**Files:**
- Modify: `libs/core/src/lib/ecs-config.ts` (snapshotRate default: 1 → 5)
- Modify: `.claude/rules/lagless-physics.md` (update @dimforge refs + document warmstartCoefficient)
- Modify: `CLAUDE.md` (update @dimforge references if any)
- Modify: `libs/physics2d/README.md` (if not already done in Task 1)

**Key Decisions / Notes:**

1. **snapshotRate = 5**: Saves snapshot every 5 ticks instead of every tick.
   - Reduces snapshot overhead by 80% (both ECS ArrayBuffer.slice and Rapier takeSnapshot)
   - On rollback, worst case re-simulates 4 extra ticks (negligible at 60fps)
   - Tests that explicitly set `snapshotRate: 1` keep their setting — only the default changes

2. **Update `.claude/rules/lagless-physics.md`:**
   - Change `@dimforge/rapier2d-deterministic-compat` → `@lagless/rapier2d-deterministic-compat`
   - Document new PhysicsConfig2d.warmstartCoefficient (default: 0)
   - Remove "takeSnapshot + restoreSnapshot normalize" pattern
   - Note that snapshotRate defaults to 5

3. **Core tests** that set `snapshotRate: 1` explicitly should continue working — only the default changes.

4. **Game runner-providers** (circle-sumo, sync-test, roblox-like, 2d-map-test) don't set snapshotRate explicitly — they will inherit the new default of 5. This is the intended behavior: all games benefit from reduced snapshot overhead. On rollback, worst case is 4 extra re-simulation ticks (negligible at 60fps).

**Definition of Done:**
- [ ] ECSConfig.snapshotRate defaults to 5
- [ ] lagless-physics.md updated with @lagless refs and warmstartCoefficient docs
- [ ] All tests pass: `npx vitest run`

**Verify:**
- `npx vitest run`

---

## Testing Strategy

- **Unit tests:** Rapier-level warm-start divergence proof (Task 2), PhysicsWorldManager2d config test (Task 3)
- **Integration tests:** Existing `physics-simulation-2d.spec.ts`, `physics-determinism-2d.spec.ts`, `physics-desync-intensive.spec.ts` validate the full stack
- **Regression:** All existing physics2d tests must continue passing after every task
- **Manual verification:** Not required — the change is internal configuration, existing test suite covers it comprehensively

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| @lagless package not found in npm | Low | Blocking | Verify `npm view @lagless/rapier2d-deterministic-compat` before starting |
| Existing tests rely on warm-start behavior | Low | Medium | Run all tests after Task 1 (dep swap only) — if any fail, investigate before proceeding |
| snapshotRate=5 causes test failures | Medium | Low | Only change the default — tests that set snapshotRate: 1 explicitly are unaffected. If core tests fail, they'll be updated to set snapshotRate: 1 explicitly |
| Performance regression from disabled warm-starting | Very Low | Low | For 2D top-down without gravity stacking, warm-starting provides minimal benefit. Monitor solver iterations in complex scenarios |

## Goal Verification

### Truths

1. No `@dimforge/rapier2d-deterministic-compat` references exist in production/library code, current documentation, configs, or templates (historical archived plans are excluded)
2. `PhysicsWorldManager2d` sets `warmstartCoefficient=0` on Rapier world creation
3. `PhysicsSimulationBase.saveSnapshot()` does NOT call `restoreSnapshot()`
4. A test proves that warm-start divergence exists with `warmstartCoefficient=1` and is eliminated with `warmstartCoefficient=0`
5. Default `snapshotRate` is 5 (not 1)
6. All existing tests pass

### Artifacts

1. `libs/physics2d/package.json` — @lagless dep
2. `libs/physics2d/src/lib/physics-config-2d.ts` — warmstartCoefficient field
3. `libs/physics2d/src/lib/physics-world-manager-2d.ts` — applies warmstartCoefficient
4. `libs/physics2d/src/lib/rapier-types-2d.ts` — integrationParameters type
5. `libs/physics-shared/src/lib/physics-simulation-base.ts` — normalize hack removed
6. `libs/physics2d/src/lib/__tests__/warmstart-divergence.spec.ts` — TDD proof test
7. `libs/core/src/lib/ecs-config.ts` — snapshotRate default=5

### Key Links

1. PhysicsConfig2d.warmstartCoefficient → PhysicsWorldManager2d constructor → world.integrationParameters.warmstartCoefficient
2. PhysicsWorldManager2d.takeSnapshot() → PhysicsSimulationBase.saveSnapshot() (no longer calls restoreSnapshot)
3. ECSConfig.snapshotRate → ECSSimulation.storeSnapshotIfNeeded() → PhysicsSimulationBase.saveSnapshot()
