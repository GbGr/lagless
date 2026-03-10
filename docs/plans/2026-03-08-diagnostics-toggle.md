# Diagnostics Toggle Implementation Plan

Created: 2026-03-08
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary
**Goal:** Make all diagnostics toggleable from dev-player UI — off by default, zero performance cost when disabled. Additionally, add performance profiling: per-tick timing, per-system timing, physics step timing — all controlled by the same diagnostics toggle.
**Architecture:** Dev-player gets a "Diagnostics" checkbox next to Start. State propagates to game iframes via URL param + `dev-bridge:set-diagnostics` postMessage. Game hooks and runner-provider code check this flag to skip expensive operations. When diagnostics are enabled, a `PerformanceProfiler` monkey-patches each system's `update()` method to measure timing — no changes to core ECS simulation loop needed.
**Tech Stack:** React, postMessage protocol, existing hook infrastructure

## Scope
### In Scope
- Dev-player UI: checkbox next to Start, persisted in localStorage
- Protocol: new `dev-bridge:set-diagnostics` message type
- `useDevBridge`: skip `mem.getHash()` and verified hash computation when disabled
- `useDesyncDiagnostics`: don't create collector/stream summaries when disabled
- Runner-providers (4 games + template): conditional `enableHashTracking` and `createHashReporter`
- New `useDiagnosticsControl` hook: manages toggle state from URL param + postMessage
- Dev-player Dashboard: hide hash timeline and hash comparison when diagnostics off; keep basic stats table
- Dev-player DiagnosticsPanel: disable Download buttons when diagnostics off
- Performance profiling: per-tick timing, per-system timing — monkey-patch approach, no core code changes
- Dev-player performance display: system timing breakdown in DiagnosticsPanel

### Out of Scope
- In-game DebugPanel (F3 toggle) — stays independent, always available
- Server-side changes — hash comparison already only fires when reports arrive
- Diagnostics toggle for non-dev-player usage (standalone game without `?devBridge=true`)

## Context for Implementer
> Write for an implementer who has never seen the codebase.

- **Patterns to follow:**
  - Dev-bridge protocol: `libs/react/src/lib/dev-bridge/protocol.ts` — union types for parent/child messages
  - Dev-bridge message handling in game: `libs/react/src/lib/dev-bridge/dev-bridge.ts:60-68` — `onParentMessage()` listener pattern
  - Iframe message broadcasting in dev-player: `tools/dev-player/src/app/components/diagnostics-panel.tsx:33-53` — DOM query for `iframe[data-instance-id]`, then `contentWindow.postMessage()`
  - localStorage persistence: `tools/dev-player/src/app/hooks/use-local-storage.ts` — simple key/value with JSON

- **Conventions:**
  - Dev-bridge message types: `'dev-bridge:<action>'` string literals
  - Dev-player state: immutable reducer pattern in `store.ts`
  - Dev-player styles: inline `React.CSSProperties` objects in `styles` const

- **Key files:**
  - `libs/react/src/lib/dev-bridge/protocol.ts` — message type definitions
  - `libs/react/src/lib/dev-bridge/dev-bridge.ts` — DevBridge class (URL params, postMessage)
  - `libs/react/src/lib/dev-bridge/use-dev-bridge.ts` — stats streaming hook (every 6 ticks)
  - `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts` — diagnostics hook (collector + summaries)
  - `tools/dev-player/src/app/components/top-bar.tsx` — Start/Stop buttons
  - `tools/dev-player/src/app/store.ts` — state reducer
  - `tools/dev-player/src/app/types.ts` — types and actions
  - `tools/dev-player/src/app/app.tsx` — root component
  - `tools/dev-player/src/app/components/iframe-grid.tsx` — iframe creation with URL params
  - `tools/dev-player/src/app/components/dashboard.tsx` — hash timeline + stats table
  - `tools/dev-player/src/app/components/diagnostics-panel.tsx` — Download All button

- **Gotchas:**
  - `sim.mem.getHash()` iterates entire ArrayBuffer — this is the main performance cost to eliminate when disabled
  - `enableHashTracking(0)` effectively disables hash tracking (gated by `interval > 0` check in simulation loop at `ecs-simulation.ts:199`), but does NOT clear `_hashHistory` Map — stale entries remain
  - When toggling off, also need to clear hash history to prevent stale hashes when toggling back on. Add `clearHashHistory()` method to `ECSSimulation` (or call `enableHashTracking(0)` which we'll extend to also clear the map)
  - `createHashReporter` returns `{ dispose() }` — call dispose to remove tick handler
  - `useDesyncDiagnostics` creates `DiagnosticsCollector` on mount — it must NOT be created when diagnostics are off
  - URL params are cached at module load in `DevBridge` (line 11-12) — the `diagnostics` param will be available via `_initialParams`
  - `DevBridgeParentMessage` union type is used in `onParentMessage()` handler — new message must be added to this union

- **Domain context:**
  - Hash tracking: per-tick hash of ECS ArrayBuffer stored in history map. Used for cross-client divergence detection.
  - Hash reporting: sends verified-tick hashes to server via dedicated protocol (not RPCs). Server compares, sends `HashMismatch` on divergence.
  - DiagnosticsCollector: ring buffer recording per-tick state (hash, physics hash, velocity hash, rollback flags, input counts). Used for downloadable desync reports.
  - Stats streaming: `useDevBridge` sends tick/hash/RTT/rollbacks etc. to dev-player parent every 6 ticks. Hash computation (`mem.getHash()`) is the expensive part.
  - ECS simulation loop: `ECSSimulation.simulate(tick)` at line 235 iterates `_systems[i].update(tick)` — this is where per-system timing is measured.
  - `_systems` is private — we add a `registeredSystems` getter (read-only) for the profiler to access.

## Progress Tracking
- [x] Task 1: Protocol & dev-bridge — new message type + `useDiagnosticsControl` hook
- [x] Task 2: Dev-player UI — checkbox, state, broadcasting, Dashboard/DiagnosticsPanel gating
- [x] Task 3: Game hooks — make `useDevBridge` and `useDesyncDiagnostics` respect diagnostics flag
- [x] Task 4: Runner-providers — conditional hash tracking/reporting in all games + template
- [x] Task 5: Performance profiling infrastructure — `PerformanceProfiler` with monkey-patching
- [x] Task 6: Performance display — protocol + dev-player UI for system timing
- [x] Task 7: Verify
**Total Tasks:** 7 | **Completed:** 7 | **Remaining:** 0

## Implementation Tasks

### Task 1: Protocol & Dev-Bridge Extension
**Objective:** Add `dev-bridge:set-diagnostics` message type and a `useDiagnosticsControl` hook that manages toggle state.
**Dependencies:** None

**Files:**
- Modify: `libs/react/src/lib/dev-bridge/protocol.ts` — add `DevBridgeSetDiagnosticsMessage` interface and include in `DevBridgeParentMessage` union
- Create: `libs/react/src/lib/dev-bridge/use-diagnostics-control.ts` — hook that reads `diagnostics` URL param from `DevBridge.getUrlParams()` and listens for `dev-bridge:set-diagnostics` postMessage, returns `boolean` state
- Modify: `libs/react/src/lib/dev-bridge/dev-bridge.ts` — add `diagnostics: boolean` to `DevBridgeParams` interface and `getUrlParams()` return
- Modify: `libs/react/src/lib/dev-bridge/index.ts` — export new hook and message type
- Modify: `libs/core/src/lib/ecs-simulation.ts` — add `disableHashTracking()` method that sets `_hashTrackingInterval = 0` and clears `_hashHistory`
- Test: `libs/react/src/lib/dev-bridge/__tests__/use-diagnostics-control.spec.ts`

**Key Decisions / Notes:**
- `useDiagnosticsControl` returns `true` when `DevBridge.isActive()` is false (standalone play — diagnostics always on, no dev-player control). Only manages toggle state when inside dev-player.
- When inside dev-player: reads initial state from URL param `diagnostics` (default: `false` if missing)
- Listens for `dev-bridge:set-diagnostics` messages via `window.addEventListener('message', ...)`
- Returns current `boolean` state — game components use this to conditionally enable features
- Add `diagnostics: boolean` to `DevBridgeParams` interface in `dev-bridge.ts` for API consistency

**Definition of Done:**
- [ ] `DevBridgeSetDiagnosticsMessage` type exists in protocol
- [ ] `useDiagnosticsControl` returns `true` when not in dev-player (standalone play)
- [ ] `useDiagnosticsControl` returns `false` by default when in dev-player (no URL param)
- [ ] `useDiagnosticsControl` responds to `set-diagnostics` messages
- [ ] Exported from `@lagless/react`
- [ ] All tests pass

**Verify:**
- `npx vitest run --project=@lagless/react`

### Task 2: Dev-Player UI & State
**Objective:** Add diagnostics checkbox to TopBar, manage state in reducer, broadcast toggle to iframes, conditionally show Dashboard sections.
**Dependencies:** Task 1

**Files:**
- Modify: `tools/dev-player/src/app/types.ts` — add `diagnosticsEnabled: boolean` to `DevPlayerState`, add `SET_DIAGNOSTICS` action
- Modify: `tools/dev-player/src/app/store.ts` — handle `SET_DIAGNOSTICS` in reducer, default `diagnosticsEnabled: false` in `createInitialState`
- Modify: `tools/dev-player/src/app/components/top-bar.tsx` — add checkbox next to Start button, new `onDiagnosticsToggle` prop
- Modify: `tools/dev-player/src/app/app.tsx` — pass `diagnosticsEnabled` and `onDiagnosticsToggle` to TopBar, persist in localStorage, broadcast to iframes on change
- Modify: `tools/dev-player/src/app/components/iframe-grid.tsx` — add `diagnostics=true/false` URL param in `buildIframeSrc`, accept `diagnosticsEnabled` prop
- Modify: `tools/dev-player/src/app/components/dashboard.tsx` — accept `diagnosticsEnabled` prop, hide hash timeline canvas and hash comparison table when false, keep basic stats table
- Modify: `tools/dev-player/src/app/components/diagnostics-panel.tsx` — accept `diagnosticsEnabled` prop, disable Download buttons when false

**Key Decisions / Notes:**
- Checkbox label: "Diagnostics" — placed between Instances input and Start button
- Checkbox style: matches existing dark theme (background `#21262d`, border `#30363d`)
- Broadcasting: create a `broadcastToIframes(message)` helper in `app.tsx` that queries `document.querySelectorAll('iframe[data-instance-id]')` and calls `contentWindow.postMessage()` — same pattern as diagnostics-panel.tsx:33-53
- Broadcast on checkbox change: `useEffect` in `app.tsx` watches `diagnosticsEnabled` and broadcasts to all iframes
- Broadcast on iframe ready: add logic in `useBridgeMessages` hook — when `dev-bridge:ready` is received, also broadcast current diagnostics state back to that specific iframe (pass `diagnosticsEnabled` as a parameter to the hook, use DOM query to find the iframe by `data-instance-id` and send `set-diagnostics`)
- localStorage key: `dev-player-diagnostics` — simple boolean
- Initialize `diagnosticsEnabled` directly in `createInitialState()` from localStorage (avoids flash of wrong state on mount)
- Dashboard stats table columns when diagnostics OFF: `# | Slot | Tick | VfTick | FPS | RTT | Jitter | InpDly | Rollbacks | State`
- Dashboard stats table columns when diagnostics ON: current columns (adds Hash column)

**Definition of Done:**
- [ ] Checkbox visible next to Start button
- [ ] Checkbox state persists across page reloads
- [ ] Toggling checkbox broadcasts `dev-bridge:set-diagnostics` to all iframes
- [ ] New iframes receive current diagnostics state on `dev-bridge:ready`
- [ ] Hash timeline hidden when diagnostics off
- [ ] Hash comparison table hidden when diagnostics off
- [ ] Download buttons disabled when diagnostics off
- [ ] `diagnostics=true/false` param in iframe URL

**Verify:**
- `pnpm exec nx typecheck @lagless/dev-player` (dev-player is the `tools/dev-player` project — check actual project name)

### Task 3: Game Hooks Refactor
**Objective:** Make `useDevBridge` and `useDesyncDiagnostics` respect the diagnostics toggle flag.
**Dependencies:** Task 1

**Files:**
- Modify: `libs/react/src/lib/dev-bridge/use-dev-bridge.ts` — add `diagnosticsEnabled?: boolean` to `UseDevBridgeOptions`. When false: send `hash: 0`, omit `verifiedHash`/`verifiedHashTick`, skip `sim.mem.getHash()` and `sim.getHashAtTick()` calls
- Modify: `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts` — add `enabled?: boolean` option. When false: don't create collector, don't add tick handler for summaries, don't listen for report requests. When toggled from false to true mid-session: create collector and start streaming. When toggled from true to false: dispose collector and stop.

**Key Decisions / Notes:**
- `useDevBridge`: the `hash` field in stats message becomes 0 when diagnostics off. Dev-player Dashboard already handles this — the hash column is hidden.
- `useDesyncDiagnostics`: the `enabled` option controls the entire collector lifecycle. The hook's `useEffect` should depend on `[runner, enabled]` so it creates/destroys the collector when toggled.
- When `enabled` is `undefined` (not passed), default to `true` for backward compatibility — existing games that don't use the toggle still get diagnostics by default when running inside dev-player.

**Definition of Done:**
- [ ] `useDevBridge` skips hash computation when `diagnosticsEnabled: false`
- [ ] `useDesyncDiagnostics` doesn't create collector when `enabled: false`
- [ ] Both hooks respond to runtime toggle (React state change causes re-render, useEffect re-runs)
- [ ] Backward compatible: no option passed = diagnostics on (existing behavior)
- [ ] All tests pass

**Verify:**
- `npx vitest run --project=@lagless/react`
- `npx vitest run --project=@lagless/desync-diagnostics`

### Task 4: Runner-Provider Updates
**Objective:** Update all game runner-providers and template to use `useDiagnosticsControl` and conditionally enable hash tracking / hash reporter.
**Dependencies:** Task 1, Task 3

**Files:**
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/runner-provider.tsx`
- Modify: `sync-test/sync-test-game/src/app/game-view/runner-provider.tsx`
- Modify: `circle-sumo/circle-sumo-game/src/app/game-view/runner-provider.tsx`
- Modify: `roblox-like/roblox-like-game/src/app/game-view/runner-provider.tsx`
- Modify: `tools/create/templates/pixi-react/__packageName__-frontend/src/app/game-view/runner-provider.tsx`

**Key Decisions / Notes:**
- Pattern for each runner-provider:
  ```tsx
  import { useDiagnosticsControl } from '@lagless/react';

  // In component body:
  const diagnosticsEnabled = useDiagnosticsControl();

  // In the main useEffect (runner creation):
  // REMOVE unconditional enableHashTracking and createHashReporter calls
  // (these move to a separate useEffect)

  // New useEffect for diagnostics lifecycle:
  useEffect(() => {
    if (!runner || !diagnosticsEnabled) {
      runner?.Simulation.disableHashTracking(); // clears interval + hash history
      return;
    }
    runner.Simulation.enableHashTracking(hashInterval);
    const reporter = createHashReporter(runner, { ... });
    hashReporterRef.current = reporter;
    return () => {
      reporter.dispose();
      hashReporterRef.current = null;
    };
  }, [runner, diagnosticsEnabled]);

  // Pass to hooks:
  useDevBridge(runner, { hashTrackingInterval, diagnosticsEnabled });
  useDesyncDiagnostics(runner, { ..., enabled: diagnosticsEnabled });
  ```
- The `hashReporter` variable that's currently in the main useEffect closure needs to be moved to a `useRef<HashReporter | null>`. Set the ref in the diagnostics useEffect, read from the ref in the `onHashMismatch` callback: `onHashMismatch: (data) => hashReporterRef.current?.reportMismatch(data)`.
- `circle-sumo` does NOT use `enableHashTracking` or `createHashReporter` — it only needs `useDiagnosticsControl` passed to `useDevBridge` and `useDesyncDiagnostics`. No hash tracking/reporter changes needed for circle-sumo.

**Definition of Done:**
- [ ] All 4 game runner-providers + template use `useDiagnosticsControl`
- [ ] Hash tracking conditionally enabled
- [ ] Hash reporter conditionally created/disposed
- [ ] `useDevBridge` receives `diagnosticsEnabled`
- [ ] `useDesyncDiagnostics` receives `enabled`
- [ ] All games build without errors
- [ ] No diagnostics overhead when toggle is off

**Verify:**
- `pnpm exec nx run-many -t typecheck -p @lagless/2d-map-test-game @lagless/sync-test-game @lagless/circle-sumo-game @lagless/roblox-like-game`

### Task 5: Performance Profiling Infrastructure
**Objective:** Create `PerformanceProfiler` that monkey-patches system `update()` methods to measure per-tick and per-system execution time. Non-invasive — no changes to ECS simulation loop.
**Dependencies:** Task 1

**Files:**
- Create: `libs/desync-diagnostics/src/lib/performance-profiler.ts` — `PerformanceProfiler` class
- Modify: `libs/core/src/lib/ecs-simulation.ts` — add read-only `get registeredSystems(): ReadonlyArray<IECSSystem>` getter to expose `_systems` for profiling (minimal core touch — just exposes existing data)
- Modify: `libs/desync-diagnostics/src/index.ts` — export `PerformanceProfiler`
- Test: `libs/desync-diagnostics/src/lib/__tests__/performance-profiler.spec.ts`

**Key Decisions / Notes:**
- **Monkey-patch approach:** `profiler.attach(runner)` wraps each system's `update()` with `performance.now()` timing. `profiler.detach()` restores original methods. No simulation loop changes.
- **Access to systems:** `ECSSimulation` needs a `registeredSystems` getter (one-line addition). This is the only core code change — a read-only accessor, no behavior change.
- **Metrics collected per system:**
  - `latest`: last tick time in ms
  - `min` / `max` / `avg`: over a rolling window (last N ticks, e.g., 600 = 10s at 60fps)
  - System identified by `constructor.name`
- **Aggregate metrics:**
  - `tickTime`: total time for all systems in one tick (sum of per-system times)
  - `tickTimeMin` / `tickTimeMax` / `tickTimeAvg`: rolling window stats
- **Ring buffer storage:** Pre-allocated `Float64Array` for each system, index = tick % windowSize. Avoids GC pressure.
- **API:**
  ```typescript
  interface SystemTimingStats {
    name: string;
    latest: number;
    min: number;
    max: number;
    avg: number;
  }
  interface PerformanceStats {
    tickTime: { latest: number; min: number; max: number; avg: number };
    systems: SystemTimingStats[];
  }
  class PerformanceProfiler {
    attach(runner: ECSRunner): void;
    detach(): void;
    getStats(): PerformanceStats;
    dispose(): void;
  }
  ```

**Definition of Done:**
- [ ] `PerformanceProfiler` wraps system `update()` methods with timing
- [ ] `detach()` restores original methods cleanly
- [ ] `getStats()` returns per-system and aggregate timing
- [ ] Rolling window stats (min/max/avg) are correct
- [ ] `registeredSystems` getter exists on `ECSSimulation`
- [ ] Unit tests pass
- [ ] No impact on simulation when profiler is not attached

**Verify:**
- `npx vitest run --project=@lagless/desync-diagnostics`
- `npx vitest run --project=@lagless/core`

### Task 6: Performance Display in Dev-Player
**Objective:** Stream performance stats from game iframes to dev-player and display per-system timing breakdown.
**Dependencies:** Task 2, Task 5

**Files:**
- Modify: `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts` — add `PerformanceStatsMessage` type (child→parent)
- Modify: `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts` — when enabled, create profiler, stream `PerformanceStatsMessage` every 30 ticks alongside diagnostics summary
- Modify: `tools/dev-player/src/app/types.ts` — add `performanceStats` to `InstanceState`
- Modify: `tools/dev-player/src/app/hooks/use-bridge-messages.ts` — handle `dev-bridge:performance-stats` message
- Modify: `tools/dev-player/src/app/store.ts` — handle `INSTANCE_PERFORMANCE_STATS` action
- Modify: `tools/dev-player/src/app/components/diagnostics-panel.tsx` — add performance table showing per-instance system timing breakdown: columns `System | Latest | Min | Max | Avg`, plus aggregate tick time row

**Key Decisions / Notes:**
- Performance stats sent as part of diagnostics (same 30-tick interval), same toggle control
- `PerformanceStatsMessage`:
  ```typescript
  {
    type: 'dev-bridge:performance-stats';
    instanceId: string;
    tickTime: { latest: number; min: number; max: number; avg: number };
    systems: Array<{ name: string; latest: number; min: number; max: number; avg: number }>;
  }
  ```
- Display: collapsible section in DiagnosticsPanel per instance, showing system timing table
- Times displayed in ms with 2 decimal places (e.g., "0.12ms")
- Sort systems by avg time descending (heaviest first)
- Color coding: >1ms red, >0.5ms yellow, else green for `avg` column

**Definition of Done:**
- [ ] Performance stats stream from game iframes when diagnostics enabled
- [ ] Dev-player DiagnosticsPanel shows per-system timing breakdown
- [ ] System timing includes per-system and aggregate tick stats
- [ ] No performance stats sent when diagnostics disabled
- [ ] Times are accurate and formatted in ms

**Verify:**
- `pnpm exec nx typecheck @lagless/dev-player`

### Task 7: Verify
**Objective:** Full suite + quality checks
**Dependencies:** Task 6

**Verify:**
- `npx vitest run`
- `pnpm exec nx run-many -t lint typecheck build`

## Testing Strategy
- **Unit tests:** `useDiagnosticsControl` hook — verifies URL param reading and message listening
- **Integration:** Dev-player typecheck ensures all components compile with new props
- **Manual:** Start dev-player → verify checkbox toggles diagnostics for all game instances, hash timeline appears/disappears, Download buttons enable/disable

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hash reporter ref becomes stale when toggled | Medium | Hash mismatch callbacks stop working | Use `useRef` for reporter, update in diagnostics useEffect |
| Backward compat break for games not using dev-player | Low | Diagnostics always off | `useDiagnosticsControl` returns `true` when DevBridge is NOT active (standalone play keeps full diagnostics) |
| Stale hash history after toggle off/on | Medium | Wrong hashes reported | `disableHashTracking()` clears `_hashHistory` Map — fresh start on re-enable |
| Race condition: toggle arrives before runner ready | Low | Missed toggle | `useDiagnosticsControl` stores state, hooks read on mount |

## Goal Verification
### Truths
1. When diagnostics checkbox is unchecked, `sim.mem.getHash()` is never called during simulation
2. When diagnostics checkbox is unchecked, no `DiagnosticsCollector` or `PerformanceProfiler` is created
3. When diagnostics checkbox is unchecked, no hash reports are sent to the server
4. Toggling diagnostics ON mid-session starts all diagnostic features including performance profiling
5. Hash timeline and hash comparison table are hidden when diagnostics off
6. Checkbox state persists across dev-player page reloads
7. Per-system timing breakdown is visible in DiagnosticsPanel when diagnostics on

### Artifacts
- `libs/react/src/lib/dev-bridge/use-diagnostics-control.ts` — new hook
- `libs/react/src/lib/dev-bridge/protocol.ts` — new message type
- `libs/desync-diagnostics/src/lib/performance-profiler.ts` — system timing profiler
- `tools/dev-player/src/app/components/top-bar.tsx` — checkbox UI

### Key Links
- `useDiagnosticsControl` ← reads `DevBridge` URL params + listens postMessage
- `TopBar` checkbox → broadcasts `set-diagnostics` to iframes
- Runner-provider → reads `diagnosticsEnabled` → conditionally creates hash tracking/reporter
- `useDevBridge` → skips `mem.getHash()` when `diagnosticsEnabled: false`
- `useDesyncDiagnostics` → creates/destroys collector + profiler based on `enabled`
- `PerformanceProfiler.attach(runner)` → monkey-patches `system.update()` → streams timing to dev-player
