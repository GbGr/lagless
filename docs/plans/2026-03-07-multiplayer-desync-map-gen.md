# Multiplayer Desync — Initial Rapier Snapshot Missing Pre-Start Bodies Fix Plan

Created: 2026-03-07
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Bugfix

## Summary
**Symptom:** Multiplayer desync occurs after integrating 2d-map-generator — tree colliders disappear on one or both clients after the first rollback, causing permanent physics divergence.
**Trigger:** First remote `PlayerJoined` RPC arrives at tick 1 after the client has already simulated tick 1, triggering a rollback.
**Root Cause:** `libs/physics-shared/src/lib/physics-simulation-base.ts:25` — `_initialRapierSnapshot` is captured in the `PhysicsSimulationBase` constructor, which runs BEFORE tree colliders are created in `runner-provider.tsx`. When `SnapshotHistory.getNearest(1)` throws (no snapshot with tick < 1 exists), the fallback initial snapshot restores a Rapier world without tree colliders.

## Investigation
- **Map generator audit:** Fully deterministic — all trig uses `MathOps`, all randomness via `SimpleSeededRandom`, topological sort uses Map (insertion-order), `SpatialGridCollisionProvider` is deterministic. No `Math.random()`, no non-deterministic `Math.*` trig in production code.
- **Simulation systems audit:** All 6 systems are deterministic. No PRNG usage. No non-deterministic operations.
- **Key finding:** `SnapshotHistory.getNearest(tick)` searches for the greatest tick STRICTLY LESS than the requested tick. `getNearest(1)` throws when the oldest snapshot is at tick 1 (because `1 <= 1`). The fallback `_initialRapierSnapshot` was captured before tree colliders exist.
- **Timing:** Server emits `PlayerJoined` at `serverTick + 1` (relay-room.ts:606). Client receives `ServerHello` first, creates runner + tree colliders + starts. If the first `update()` simulates tick 1 before `TickInputFanout` arrives with `PlayerJoined`, rollback to tick 1 is triggered → initial Rapier snapshot (no trees) is used → trees permanently lost.
- **Comparison with working games:** `sync-test` (no physics) and `circle-sumo` (extends `ECSRunner`, no Rapier) never hit this path. `2d-map-test` is the first game combining Rapier 2D + multiplayer rollback + pre-start static bodies.

## Fix Approach
**Files:**
- `libs/physics-shared/src/lib/physics-simulation-base.ts` — add `capturePreStartState()` method, make `_initialRapierSnapshot` mutable
- `libs/core/src/lib/ecs-simulation.ts` — make `_initialSnapshot` protected (non-readonly) so subclass can update it
- `2d-map-test/2d-map-test-game/src/app/game-view/runner-provider.tsx` — call `capturePreStartState()` after tree collider creation

**Strategy:** Add a public method `capturePreStartState()` to `PhysicsSimulationBase` that re-captures both the ECS and Rapier initial snapshots after pre-start setup (tree colliders, etc.). Call it in runner-provider.tsx between tree collider creation and `start()`.

**Tests:** Add regression test in `libs/physics2d/src/lib/__tests__/physics-simulation-2d.spec.ts` verifying that bodies created after construction but before `capturePreStartState()` survive a rollback that falls through to the initial snapshot.

## Progress
- [x] Task 1: Fix — Write regression test + implement fix
- [x] Task 2: Verify — Full test suite + quality checks
**Tasks:** 2 | **Done:** 2

## Tasks
### Task 1: Fix
**Objective:** Add `capturePreStartState()` to PhysicsSimulationBase and call it after pre-start body creation
**Files:**
- Modify: `libs/core/src/lib/ecs-simulation.ts` — change `_initialSnapshot` from `protected readonly` to `protected`
- Modify: `libs/physics-shared/src/lib/physics-simulation-base.ts` — change `_initialRapierSnapshot` from `private readonly` to `private`, add public `capturePreStartState()` method
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/runner-provider.tsx` — call `_runner.Simulation.capturePreStartState()` after tree collider loop
- Test: `libs/physics2d/src/lib/__tests__/physics-simulation-2d.spec.ts` — regression test

**TDD:** Write regression test (create bodies after construction, rollback to tick 1, verify bodies exist) → verify FAILS → implement fix → verify all PASS
**Verify:** `npx vitest run --project=@lagless/physics2d && npx vitest run`

### Task 2: Verify
**Objective:** Full suite + quality checks
**Verify:** `npx vitest run && pnpm exec nx run-many -t lint typecheck build`
