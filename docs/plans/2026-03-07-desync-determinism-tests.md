# Multiplayer Desync — Determinism Test Suite & Root Cause Fix Plan

Created: 2026-03-07
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Bugfix

## Summary
**Symptom:** Multiplayer desync persists in 2d-map-test despite `capturePreStartState` fix. Hash verification detects divergence between clients.
**Trigger:** Player B joins while Player A is already simulating. Server sends `PlayerJoined` at `serverTick + 1`. Player A rolls back to tick 1 (falls through to initial snapshot), re-simulates with both players. Player B simulates from tick 1 fresh (no rollback). Hash comparison eventually detects divergence.
**Root Cause:** Suspected: `PhysicsWorldManager2d.restoreSnapshot()` replaces the Rapier `World` object but does NOT re-apply `world.timestep = _substepDt` (set only in constructor). If Rapier's serialization doesn't preserve the timestep property, the restored world uses a default dt — causing physics divergence after rollback. Additionally, Rapier snapshot/restore may not produce bit-identical handle allocation or internal solver state.

## Investigation
- **Previous fix (VERIFIED but insufficient):** `capturePreStartState()` correctly captures initial snapshot including tree colliders. The initial snapshot bug was real but NOT the sole cause.
- **Map generator:** Fully deterministic — `MathOps` trig, `SimpleSeededRandom`, insertion-order Maps. Cleared.
- **All 6 simulation systems:** Deterministic. No PRNG usage, no non-deterministic ops. Cleared.
- **Seed distribution:** Server sends same seed to all clients. Cleared.
- **RPC ordering:** Sorted by `(playerSlot, ordinal, seq)`. Deterministic. Cleared.
- **ECS snapshot/rollback:** `SnapshotHistory.getNearest(tick)` with binary search. ECS and Rapier histories saved at same ticks. Rollback uses same tick for both. Cleared.
- **ColliderEntityMap rebuild:** Correctly wired via `wireColliderEntityMapRebuild`. Rebuilds from ECS PhysicsRefs after rollback. Cleared.
- **ECS hash covers entire ArrayBuffer** — includes `PhysicsRefs.bodyHandle` and `PhysicsRefs.colliderHandle` (Float64Array). If handle allocation differs after snapshot restore, hash diverges even if physics positions are identical.
- **KEY FINDING — `restoreSnapshot` timestep gap:** `PhysicsWorldManager2d.restoreSnapshot()` (line 78-90) frees the old world and creates a new one via `World.restoreSnapshot(data)`. The `world.timestep = _substepDt` is only set in the constructor (line 57), NOT after restore. Same issue in `PhysicsWorldManager3d`. If the snapshot doesn't serialize the timestep, the restored world's step uses a different dt → physics divergence.
- **Rapier handle allocation:** After `restoreSnapshot`, the internal allocator state depends on what the snapshot serialized. If allocator state differs, newly created bodies get different handles → `PhysicsRefs` stores different values → ECS hash diverges.

## Fix Approach
**Strategy:** Write comprehensive determinism tests that reproduce the exact multiplayer rollback scenario. These tests will definitively identify which Rapier behavior causes divergence (timestep, handles, or solver state). Fix any identified issues.

**Files:**
- Create: `libs/physics2d/src/lib/__tests__/determinism.spec.ts` — comprehensive determinism test suite
- Modify (if needed): `libs/physics2d/src/lib/physics-world-manager-2d.ts` — re-apply timestep after `restoreSnapshot`
- Modify (if needed): `libs/physics3d/src/lib/physics-world-manager-3d.ts` — same fix for 3D

**Tests (in `determinism.spec.ts`):**
1. **Rapier timestep preservation** — verify `world.timestep` survives snapshot/restore
2. **Rapier handle allocation after restore** — create bodies before snapshot, restore, create more → handles match fresh sequence?
3. **Rapier snapshot byte-identity** — take snapshot, restore, take snapshot again → bytes identical?
4. **Parallel simulation baseline** — two independent simulations with same setup → ECS hash + Rapier bytes identical at every tick
5. **Rollback to initial snapshot determinism** — Sim A runs continuously, Sim B rollbacks to initial then re-simulates → compare at convergence tick
6. **Rollback to mid-simulation snapshot** — same as above but rollback to a mid-point snapshot
7. **Multi-player rollback scenario** — exact multiplayer reproduction: Sim A first simulates without Player B, then rollback adds Player B; Sim B has both players from start → compare
8. **State transfer determinism** — export state at tick T, import into fresh sim, continue both → compare

## Progress
- [x] Task 1: Write determinism test suite & fix root cause
- [x] Task 2: Verify — full test suite + quality checks
**Tasks:** 2 | **Done:** 2

## Tasks
### Task 1: Write determinism test suite & fix root cause
**Objective:** Create comprehensive determinism tests that reproduce the desync. Fix any issues discovered.
**Files:**
- Create: `libs/physics2d/src/lib/__tests__/determinism.spec.ts`
- Modify (if needed): `libs/physics2d/src/lib/physics-world-manager-2d.ts` — re-apply timestep after restore
- Modify (if needed): `libs/physics3d/src/lib/physics-world-manager-3d.ts` — same for 3D
**TDD:** Write failing test (reproduces desync) → verify FAILS → implement fix → verify PASSES
**Verify:** `npx vitest run --project=@lagless/physics2d`

### Task 2: Verify
**Objective:** Full suite + quality checks
**Verify:** `npx vitest run && pnpm exec nx run-many -t lint typecheck build`
