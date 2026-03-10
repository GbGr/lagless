# Tick Timing Metrics Implementation Plan

Created: 2026-03-09
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Add real total tick time tracking (min/max/avg) and separate snapshot creation time tracking to the PerformanceProfiler, send via DevBridge protocol, and display in dev-player dashboard.

**Architecture:** The existing `PerformanceProfiler` (in `@lagless/desync-diagnostics`) monkey-patches system.update() methods for per-system timing. Currently computes `tickTime` as the sum of system times, missing non-system work (hash tracking, signals, snapshot creation). Extend the profiler to monkey-patch `simulate()` and `saveSnapshot()` on the simulation instance to capture real total tick time and snapshot time separately. Add `snapshotTime` to the protocol and dev-player UI.

**Tech Stack:** TypeScript, Vitest, React (dev-player)

## Scope

### In Scope
- Measure real total tick time (systems + hash + signals + snapshot + handlers) via PerformanceProfiler
- Measure snapshot creation time separately via PerformanceProfiler
- Extend `PerformanceStatsMessage` protocol with `snapshotTime` field
- Update dev-player `PerformanceStatsData` type and UI to display snapshot time row

### Out of Scope
- DebugPanel (in-game F3 panel) — user chose DevPlayer only
- Always-on timing in ECSSimulation core — user chose opt-in via profiler
- Per-system timing changes — already working correctly

## Context for Implementer

> Write for an implementer who has never seen the codebase.

- **Patterns to follow:**
  - `PerformanceProfiler.attach()` (line 36-66) — monkey-patches `system.update()` with timing wrapper. Same pattern for `simulate()` and `saveSnapshot()`
  - `SystemEntry` ring buffer pattern (lines 16-23, 57-63) — `Float64Array` ring buffer with `writeIndex` and `count`
  - `DiagnosticsProtocol` (line 23-28) — `PerformanceStatsMessage` type defines the postMessage shape

- **Conventions:**
  - TypeScript `protected`/`private` are compile-time only. At runtime, methods are accessible via `(obj as any).methodName` — the profiler already uses this pattern for monkey-patching
  - `performance.now()` for high-resolution timing
  - Ring buffer window size defaults to 600 (10 seconds at 60fps)

- **Key files:**
  - `libs/desync-diagnostics/src/lib/performance-profiler.ts` — PerformanceProfiler class, monkey-patches systems, computes stats
  - `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts` — postMessage protocol types
  - `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts` — React hook that attaches profiler and sends stats via DevBridge
  - `tools/dev-player/src/app/types.ts` — `PerformanceStatsData` type consumed by dev-player
  - `tools/dev-player/src/app/hooks/use-bridge-messages.ts` — receives postMessages, dispatches to store
  - `tools/dev-player/src/app/components/diagnostics-panel.tsx` — `InstancePerformance` component renders the performance table
  - `libs/core/src/lib/ecs-simulation.ts` — `ECSSimulation.simulationTicks()` (line 199) is the tick loop; `simulate()` (line 244) runs systems; `saveSnapshot()` (line 262) saves ECS snapshot
  - `libs/physics-shared/src/lib/physics-simulation-base.ts` — `PhysicsSimulationBase.saveSnapshot()` (line 45) overrides to also save Rapier snapshot

- **Gotchas:**
  - `simulate()` is `protected` and `saveSnapshot()` is `protected` on `ECSSimulation`. At runtime they're regular properties — monkey-patching works, but TypeScript needs `(sim as any).simulate`
  - `saveSnapshot()` is overridden in `PhysicsSimulationBase` — monkey-patching on the instance (not prototype) captures the actual override including Rapier snapshot
  - `saveSnapshot()` is called conditionally from `storeSnapshotIfNeeded()` (every N ticks based on `snapshotRate`). Only record timing when it actually runs.
  - The tick handler added via `addTickHandler()` runs AFTER `storeSnapshotIfNeeded()` but BEFORE the next tick iteration — perfect for measuring total tick time
  - `detach()` must restore original methods for both `simulate()` and `saveSnapshot()`
  - Current `tickTime` in `getStats()` is sum of per-system buffers (lines 103-140). Must be replaced with real measured tick time from the new buffer.

- **Domain context:**
  - A "tick" in the simulation loop = `setTick` → `simulate` (systems) → hash tracking → signals → `storeSnapshotIfNeeded` → tick handlers
  - Snapshot includes both ECS (`ArrayBuffer.slice`) and Rapier (`world.takeSnapshot()`) for physics simulations — can be expensive
  - `snapshotRate` is 5 by default, so snapshots happen every 5th tick

## Progress Tracking

- [x] Task 1: Extend PerformanceProfiler with tick time and snapshot time measurement
- [x] Task 2: Extend protocol, types, and dev-player UI

**Total Tasks:** 2 | **Completed:** 2 | **Remaining:** 0

## Implementation Tasks

### Task 1: Extend PerformanceProfiler with tick time and snapshot time measurement

**Objective:** Add real total tick time and snapshot time measurement to PerformanceProfiler using monkey-patching, replacing the current sum-of-systems approximation.

**Dependencies:** None

**Files:**
- Modify: `libs/desync-diagnostics/src/lib/performance-profiler.ts`
- Test: `libs/desync-diagnostics/src/lib/performance-profiler.spec.ts` (create if needed)

**Key Decisions / Notes:**

1. **Total tick time measurement strategy:**
   - In `attach()`, monkey-patch `(simulation as any).simulate` to record `_tickStartTime = performance.now()` BEFORE calling original `simulate()`
   - Add a tick handler via `simulation.addTickHandler()` that computes `totalTickTime = performance.now() - _tickStartTime` and stores in a ring buffer
   - This captures: systems + hash tracking + signals + snapshot — everything between simulate start and tick handler execution
   - **Per-tick, not per-frame:** This measures cost of each individual simulation tick. During catch-up (rollback, lag), multiple ticks run per frame — each is measured individually. This is intentional: shows per-tick cost for profiling.
   - **Rollback re-simulation:** Re-simulated ticks after rollback are also measured. This reflects actual CPU cost including rollback work.

2. **Snapshot time measurement:**
   - In `attach()`, monkey-patch `(simulation as any).saveSnapshot` to wrap with `performance.now()` before/after
   - Store in a separate ring buffer
   - Only records when snapshot actually happens (every `snapshotRate` ticks)

3. **Ring buffer storage:**
   - Add `_tickTimeBuffer: Float64Array` + `_tickTimeWriteIndex` + `_tickTimeCount`
   - Add `_snapshotTimeBuffer: Float64Array` + `_snapshotTimeWriteIndex` + `_snapshotTimeCount`
   - Same ring buffer pattern as per-system entries

4. **Update `PerformanceStats` interface:**
   - Add `snapshotTime: { latest: number; min: number; max: number; avg: number }`
   - `tickTime` now comes from the real measured buffer, not sum of systems

5. **`detach()`:**
   - Store originals: `_originalSimulate`, `_originalSaveSnapshot` as instance fields in `attach()`
   - Store the return value of `addTickHandler()` as `_removeTickHandler` in `attach()`
   - In `detach()`: call `_removeTickHandler()`, restore `(sim as any).simulate = _originalSimulate`, restore `(sim as any).saveSnapshot = _originalSaveSnapshot`

6. **`attach()` signature change:**
   - Currently takes `ECSRunner`, accesses `runner.Simulation.registeredSystems`
   - Now also accesses `runner.Simulation` directly to monkey-patch and add tick handler

**Definition of Done:**
- [ ] `PerformanceStats.tickTime` reflects real measured total tick time, not sum of per-system times
- [ ] `PerformanceStats.snapshotTime` is a new field with latest/min/max/avg
- [ ] Ring buffers used for both tick time and snapshot time (window size 600)
- [ ] `detach()` restores original `simulate()` and `saveSnapshot()` methods and removes tick handler
- [ ] Tests verify tick time > sum of system times (proves non-system work is captured)
- [ ] Tests verify snapshot time is recorded only when snapshot happens
- [ ] All existing tests pass

**Verify:**
- `npx vitest run --project=@lagless/desync-diagnostics`

---

### Task 2: Extend protocol, types, and dev-player UI

**Objective:** Add `snapshotTime` field to the postMessage protocol, dev-player types, message handler, and performance table UI.

**Dependencies:** Task 1

**Files:**
- Modify: `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts`
- Modify: `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts`
- Modify: `tools/dev-player/src/app/types.ts`
- Modify: `tools/dev-player/src/app/hooks/use-bridge-messages.ts`
- Modify: `tools/dev-player/src/app/components/diagnostics-panel.tsx`

**Key Decisions / Notes:**

1. **Protocol** (`diagnostics-protocol.ts`):
   - Add `snapshotTime: { latest: number; min: number; max: number; avg: number }` to `PerformanceStatsMessage`

2. **Sender** (`use-desync-diagnostics.ts`):
   - `perfStats.snapshotTime` is already returned by `profiler.getStats()` after Task 1
   - Add `snapshotTime: perfStats.snapshotTime` to the `perfMsg` object

3. **Dev-player types** (`types.ts`):
   - Add `snapshotTime: { latest: number; min: number; max: number; avg: number }` to `PerformanceStatsData`

4. **Receiver** (`use-bridge-messages.ts`):
   - Add `snapshotTime: data.snapshotTime ?? null` to the `performanceStats` object in the `'dev-bridge:performance-stats'` case
   - Default to `null` for backward compatibility — older game iframes may not send `snapshotTime`

5. **UI** (`diagnostics-panel.tsx`):
   - In `InstancePerformance` component, add a "Snapshot" row between the per-system rows and the "Total" row
   - Use same `timingColor()` and `fmtMs()` formatting
   - Show "—" when snapshot time data is empty/zero (first few ticks before a snapshot happens)

**Definition of Done:**
- [ ] `PerformanceStatsMessage` includes `snapshotTime` field
- [ ] `use-desync-diagnostics.ts` sends `snapshotTime` in performance stats message
- [ ] `PerformanceStatsData` includes `snapshotTime` field
- [ ] `use-bridge-messages.ts` receives and stores `snapshotTime`
- [ ] Dev-player performance table shows "Snapshot" row with latest/min/max/avg
- [ ] Dev-player performance table "Total" row shows real total tick time (not sum of systems)
- [ ] `use-bridge-messages.ts` handles missing `snapshotTime` gracefully (defaults to `null`)
- [ ] No TypeScript errors

**Verify:**
- `pnpm exec nx typecheck @lagless/desync-diagnostics`
- `pnpm exec nx build @lagless/desync-diagnostics`

---

## Testing Strategy

- **Unit tests:** PerformanceProfiler — verify tick time is measured (greater than system sum), verify snapshot time is captured only on snapshot ticks, verify detach restores originals
- **Integration:** Existing desync-diagnostics tests must continue passing
- **Manual:** Run dev-player with a game, verify Performance section shows Snapshot row and real Total row

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Monkey-patching protected methods fails at runtime | Very Low | High | TypeScript protected is compile-time only. Existing profiler already monkey-patches system.update — same pattern. |
| Snapshot time buffer stays empty for long periods (snapshotRate=5) | Low | Low | Handle gracefully in UI — show "—" when count is 0 |
| PhysicsSimulationBase overrides saveSnapshot() differently than expected | Low | Medium | Monkey-patch on the instance, not prototype. This captures the actual method including any override chain. |

## Goal Verification

### Truths

1. `PerformanceProfiler.getStats().tickTime` measures real total tick time (not sum of systems)
2. `PerformanceProfiler.getStats().snapshotTime` measures snapshot creation time separately
3. Dev-player dashboard shows a "Snapshot" row in the Performance table
4. Dev-player dashboard "Total" row reflects real tick time
5. Zero performance overhead when profiler is not attached

### Artifacts

1. `libs/desync-diagnostics/src/lib/performance-profiler.ts` — tick time + snapshot time measurement
2. `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts` — snapshotTime in protocol
3. `tools/dev-player/src/app/components/diagnostics-panel.tsx` — Snapshot row in UI

### Key Links

1. PerformanceProfiler.attach() → monkey-patches simulate() and saveSnapshot() on ECSSimulation instance
2. PerformanceProfiler.getStats().snapshotTime → PerformanceStatsMessage.snapshotTime → PerformanceStatsData.snapshotTime → InstancePerformance UI
3. ECSSimulation.addTickHandler → profiler's handler computes total tick time after all tick work completes
