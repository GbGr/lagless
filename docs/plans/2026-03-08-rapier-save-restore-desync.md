# Rapier Save/Restore Internal State Desync Fix Plan

Created: 2026-03-08
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Bugfix

## Summary
**Symptom:** Multiplayer desync at tick 1811 — two clients with identical inputs produce different ECS hashes. Client 0 (linear, 0 rollbacks) diverges from Client 1 (668 rollbacks).
**Trigger:** Complex collision scenarios with frequent rollbacks. The more rollbacks, the higher the probability of divergence.
**Root Cause:** `libs/physics-shared/src/lib/physics-simulation-base.ts:48-61` — Rapier's `takeSnapshot()/restoreSnapshot()` modifies ~284 internal bytes (warm-starting data, solver cache) that subtly change solver convergence behavior. A client that never rolls back (linear) accumulates different internal state than a client that rolls back frequently. Over 668 rollback cycles, the solver convergence difference eventually crosses the float32 quantization boundary, producing different ECS positions at tick 1811.

## Investigation
- **Data evidence**: Desync report (`desync-combined-1772933927929.json`) shows C0 (0 rollbacks) and C1 (668 rollbacks) diverge at tick 1811 with identical inputHistory (863 tick/slot combos, 1105 RPCs, zero field differences).
- **ECS hash vs physics state**: ECS hash covers the entire ArrayBuffer (float32 positions, PRNG, filters, masks) but NOT Rapier internal state (float64 positions, velocities, warm-starting data). `physicsHash` was always 0.
- **Rapier byte transparency test**: Confirmed `takeSnapshot()/restoreSnapshot()` changes 284/10097 bytes — warm-starting data that doesn't affect positions directly but changes solver convergence.
- **Long simulation test**: 4000 ticks with save/restore every 4 ticks shows zero float64 divergence WITH IDENTICAL INPUTS. The key is that the real game has rollback cycles with DIFFERENT inputs (prediction vs correct), producing different warm-starting histories.
- **Ruled out**: Float64/float32 input precision (`sanitizeInputData` handles it), collision event stale state, ColliderEntityMap inconsistency, SnapshotHistory out-of-sync, CancelInput events (none in report).

## Fix Approach
**Files:** `libs/physics-shared/src/lib/physics-simulation-base.ts`
**Strategy:** Normalize Rapier internal state after every snapshot save by immediately restoring from the just-saved snapshot. This ensures both linear and rollback clients have identical "post-restore" internal state at every snapshot point, eliminating the warm-starting divergence.
**Tests:** Existing 74 physics2d tests + 765 full suite tests all pass.

## Progress
- [x] Task 1: Normalize Rapier state in saveSnapshot and capturePreStartState
- [x] Task 2: Verify
**Tasks:** 2 | **Done:** 2

## Tasks
### Task 1: Normalize Rapier State
**Objective:** After taking a Rapier snapshot in `saveSnapshot()` and `capturePreStartState()`, immediately restore from it to normalize internal state (warm-starting, solver cache).
**Files:**
- Modify: `libs/physics-shared/src/lib/physics-simulation-base.ts` — add `restoreSnapshot(rapierSnap)` + `_colliderEntityMapRebuildFn?.()` after `_rapierSnapshotHistory.set(tick, rapierSnap)` in `saveSnapshot()`. Same normalization in `capturePreStartState()`.
**TDD:** Existing physics2d test suite covers rollback determinism. 74 tests pass.
**Verify:** `npx vitest run --project=@lagless/physics2d`

### Task 2: Verify
**Objective:** Full suite + quality checks
**Verify:** `npx vitest run && pnpm exec nx run-many -t typecheck build`
