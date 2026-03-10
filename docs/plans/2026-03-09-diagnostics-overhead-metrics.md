# Diagnostics Overhead Metrics Implementation Plan

Created: 2026-03-09
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Add `overheadTime` metric to PerformanceProfiler — computed per tick as `tickTime - simulateElapsed - snapshotElapsed` — representing the cost of diagnostics, hash tracking, signals, and other tick handlers. Display as "Overhead" row in dev-player UI, and add a "Total (net)" row showing `tickTime - overheadTime`.

**Architecture:** Extend the existing monkey-patching in PerformanceProfiler to store per-tick `_lastSimulateElapsed` and `_lastSnapshotElapsed`, then compute `overheadTime` in the tick handler. Store in a new ring buffer. Flow the new field through the existing protocol chain: `PerformanceStats` → `PerformanceStatsMessage` → `PerformanceStatsData` → UI.

**Tech Stack:** TypeScript, Vitest, React (dev-player)

## Scope

### In Scope
- Compute `overheadTime` per tick in PerformanceProfiler via derived calculation
- New ring buffer for overhead time (same pattern as tick/snapshot buffers)
- Add `overheadTime` to `PerformanceStats` interface
- Add `overheadTime` to `PerformanceStatsMessage` protocol
- Add `overheadTime` to `PerformanceStatsData` dev-player type
- Add "Overhead" row in dev-player performance table (between Snapshot and Total)
- Add "Total (net)" row below Total row
- Unit tests for overhead computation

### Out of Scope
- Breaking down overhead into sub-categories (hash vs signals vs handlers)
- Optimizing the diagnostics overhead itself
- Changes to the in-game DebugPanel (F3)

## Context for Implementer

> Write for an implementer who has never seen the codebase.

- **Patterns to follow:**
  - `PerformanceProfiler.attach()` (line 85-153) — monkey-patches `simulate()`, `saveSnapshot()`, adds tick handler. Same pattern for new per-tick elapsed tracking.
  - `_snapshotTimeBuffer` ring buffer (lines 71-73, 99-101, 138-144) — `Float64Array` + writeIndex + count. Reuse for `_overheadTimeBuffer`.
  - `computeBufferStats()` (line 38-57) — shared helper for computing min/max/avg from any ring buffer.

- **Conventions:**
  - `TimingStats` interface (`{ latest, min, max, avg }`) used for all timing metrics
  - Protocol fields are flat objects with same shape as `TimingStats`
  - Dev-player types use nullable fields for backward compatibility (`| null`)
  - UI uses `timingColor()` and `fmtMs()` helpers for consistent formatting

- **Key files:**
  - `libs/desync-diagnostics/src/lib/performance-profiler.ts` — profiler class, monkey-patching, ring buffers, `getStats()`
  - `libs/desync-diagnostics/src/lib/performance-profiler.spec.ts` — test file with mock runner that simulates tick loop
  - `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts` — `PerformanceStatsMessage` postMessage type
  - `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts` — React hook that sends perf stats via postMessage (line 66-74)
  - `tools/dev-player/src/app/types.ts` — `PerformanceStatsData` type (line 43-47)
  - `tools/dev-player/src/app/hooks/use-bridge-messages.ts` — receives postMessages, creates `PerformanceStatsData` (line 70-79)
  - `tools/dev-player/src/app/components/diagnostics-panel.tsx` — `InstancePerformance` renders performance table (line 286-335)

- **Gotchas:**
  - `saveSnapshot()` is called conditionally (every N ticks). On non-snapshot ticks, `_lastSnapshotElapsed` must be 0 (not stale from previous snapshot tick). The monkey-patched wrapper already handles this — but the profiler needs to reset `_lastSnapshotElapsed = 0` each tick before `saveSnapshot()` might run. Since `simulate()` runs before `saveSnapshot()` in the tick loop, reset `_lastSnapshotElapsed = 0` inside the `simulate()` wrapper.
  - `overheadTime` can theoretically be slightly negative due to `performance.now()` measurement jitter across separate monkey-patches. Clamp to 0 with `Math.max(0, ...)`.
  - The tick handler fires AFTER all other tick handlers (profiler is attached after diagnostics-collector). So `tickTime` already includes all handler overhead.

- **Domain context:**
  - Tick loop order: `simulate()` → hash tracking → signals → `saveSnapshot()` → tick handlers
  - "Overhead" = everything NOT systems and NOT snapshot: hash tracking, signals, diagnostics-collector handler (which calls `mem.getHash()`, `physicsHashFn()`, `velocityHashFn()`), dev-bridge handler
  - With diagnostics off, overhead drops from ~1.7ms to ~0.02ms — this metric helps users see the cost of diagnostics

## Progress Tracking

- [x] Task 1: Add overheadTime computation to PerformanceProfiler
- [x] Task 2: Extend protocol, types, and dev-player UI

**Total Tasks:** 2 | **Completed:** 2 | **Remaining:** 0

## Implementation Tasks

### Task 1: Add overheadTime computation to PerformanceProfiler

**Objective:** Compute `overheadTime = tickTime - simulateElapsed - snapshotElapsed` per tick, store in a ring buffer, and expose via `getStats()`.

**Dependencies:** None

**Files:**
- Modify: `libs/desync-diagnostics/src/lib/performance-profiler.ts`
- Modify: `libs/desync-diagnostics/src/lib/performance-profiler.spec.ts`

**Key Decisions / Notes:**

1. **Per-tick elapsed tracking (not buffer-based):**
   - Add `_lastSimulateElapsed: number = -1` instance field (sentinel: -1 = no data yet). In the `simulate()` monkey-patch wrapper, after `originalSimulate.call()` returns, set `_lastSimulateElapsed = performance.now() - this._tickStartTime`
   - Add `_lastSnapshotElapsed: number = 0` instance field — set in the `saveSnapshot()` wrapper (already computed as `elapsed`)
   - Reset `_lastSnapshotElapsed = 0` at the start of the `simulate()` wrapper (before each tick's saveSnapshot might or might not run)
   - **First-tick guard:** Skip overhead recording in the tick handler when `_lastSimulateElapsed === -1` (profiler just attached, simulate wrapper hasn't run yet). This prevents a false spike in the max stat.

2. **Overhead ring buffer:**
   - Add `_overheadTimeBuffer: Float64Array`, `_overheadTimeWriteIndex`, `_overheadTimeCount` — same pattern as snapshot buffer
   - In tick handler: `const overhead = Math.max(0, elapsed - this._lastSimulateElapsed - this._lastSnapshotElapsed)`
   - Store in overhead ring buffer

3. **`PerformanceStats` interface:**
   - Add `overheadTime: TimingStats`

4. **`getStats()` update:**
   - Add `overheadTime: computeBufferStats(this._overheadTimeBuffer, ...)`

5. **`detach()` update:**
   - Reset `_overheadTimeWriteIndex = 0`, `_overheadTimeCount = 0`, `_lastSimulateElapsed = 0`, `_lastSnapshotElapsed = 0`

**Definition of Done:**
- [ ] `PerformanceStats.overheadTime` returns timing stats from the overhead ring buffer
- [ ] Overhead is computed as `tickTime - simulateElapsed - snapshotElapsed` per tick, clamped to ≥ 0
- [ ] `_lastSnapshotElapsed` resets to 0 each tick (not stale from prior snapshot tick)
- [ ] `detach()` resets overhead ring buffer state
- [ ] Tests verify overhead > 0 when non-system work happens in the mock tick loop
- [ ] Tests verify overhead ≈ 0 when no non-system work happens
- [ ] All existing tests pass

**Verify:**
- `npx vitest run --project=@lagless/desync-diagnostics`

---

### Task 2: Extend protocol, types, and dev-player UI

**Objective:** Add `overheadTime` to the postMessage protocol, dev-player types, and performance table UI. Add "Overhead" row between Snapshot and Total, and "Total (net)" row below Total.

**Dependencies:** Task 1

**Files:**
- Modify: `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts`
- Modify: `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts`
- Modify: `tools/dev-player/src/app/types.ts`
- Modify: `tools/dev-player/src/app/hooks/use-bridge-messages.ts`
- Modify: `tools/dev-player/src/app/components/diagnostics-panel.tsx`

**Key Decisions / Notes:**

1. **Protocol** (`diagnostics-protocol.ts`):
   - Add `overheadTime: { latest: number; min: number; max: number; avg: number }` to `PerformanceStatsMessage`

2. **Sender** (`use-desync-diagnostics.ts`):
   - Add `overheadTime: perfStats.overheadTime` to the `perfMsg` object (line ~72)

3. **Dev-player types** (`types.ts`):
   - Add `overheadTime: { latest: number; min: number; max: number; avg: number } | null` to `PerformanceStatsData`

4. **Receiver** (`use-bridge-messages.ts`):
   - Add `overheadTime: data.overheadTime ?? null` to the performanceStats object (line ~76)

5. **UI** (`diagnostics-panel.tsx`) — `InstancePerformance` component:
   - **"Overhead" row** between Snapshot and Total rows — same conditional pattern as Snapshot (show values when avg > 0, show "—" otherwise)
   - **"Total (net)" row** below Total row — compute inline: `stats.tickTime.latest - (stats.overheadTime?.latest ?? 0)` for each column. Use `Math.max(0, ...)` to prevent negative display. Style: fontWeight 600 like Total, but color `#3fb950` (green) to visually distinguish from raw Total.
   - **Note:** For "Total (net)" min/max columns, the subtraction is an approximation — min/max come from independent ring buffers and may represent different ticks. This is acceptable for a diagnostic UI where `latest` and `avg` are the most useful columns.

**Definition of Done:**
- [ ] `PerformanceStatsMessage` includes `overheadTime` field
- [ ] `use-desync-diagnostics.ts` sends `overheadTime` in performance stats message
- [ ] `PerformanceStatsData` includes `overheadTime` field (nullable)
- [ ] `use-bridge-messages.ts` receives and stores `overheadTime` with fallback to `null`
- [ ] "Overhead" row displays between Snapshot and Total with min/max/avg
- [ ] "Total (net)" row displays below Total with computed net values
- [ ] No TypeScript errors

**Verify:**
- `pnpm exec nx typecheck @lagless/desync-diagnostics`
- `pnpm exec nx typecheck @lagless/dev-player`

---

## Testing Strategy

- **Unit tests:** PerformanceProfiler — verify overhead is positive when mock tick loop includes non-system work, verify overhead ≈ 0 when tick loop is minimal, verify detach resets overhead state
- **Integration:** Existing desync-diagnostics tests must continue passing
- **Manual:** Run dev-player with a game, verify Overhead and Total (net) rows appear correctly

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Overhead goes slightly negative due to performance.now() jitter | Low | Low | Clamp with `Math.max(0, computed)` before storing in buffer |
| `_lastSnapshotElapsed` retains stale value from previous snapshot tick | Medium | Medium | Reset `_lastSnapshotElapsed = 0` in the `simulate()` wrapper at the start of each tick |
| Profiler tick handler order matters (must run last) | Low | Low | Profiler is attached after diagnostics-collector, so its handler is added last. addTickHandler uses a Set — iteration order is insertion order. |
| First tick after attach has stale _lastSimulateElapsed | Medium | Low | Use sentinel value (-1) and skip overhead recording on first tick. Self-corrects after one tick. |

## Goal Verification

### Truths

1. `PerformanceProfiler.getStats().overheadTime` measures diagnostics overhead per tick
2. Overhead is computed as `tickTime - simulateElapsed - snapshotElapsed`, clamped to ≥ 0
3. Dev-player dashboard shows an "Overhead" row in the Performance table
4. Dev-player dashboard shows a "Total (net)" row below Total
5. Zero performance overhead when profiler is not attached

### Artifacts

1. `libs/desync-diagnostics/src/lib/performance-profiler.ts` — overhead ring buffer + computation
2. `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts` — overheadTime in protocol
3. `tools/dev-player/src/app/components/diagnostics-panel.tsx` — Overhead + Total (net) rows in UI

### Key Links

1. PerformanceProfiler.attach() → records `_lastSimulateElapsed` and `_lastSnapshotElapsed` per tick → tick handler computes overhead
2. PerformanceProfiler.getStats().overheadTime → PerformanceStatsMessage.overheadTime → PerformanceStatsData.overheadTime → InstancePerformance UI
3. Total (net) = tickTime - overheadTime — computed inline in UI render, not stored separately
