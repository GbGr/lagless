# Desync Diagnostics Package Implementation Plan

Created: 2026-03-07
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Create a standalone `@lagless/desync-diagnostics` package that records per-tick simulation state, rollback events, input timelines, and verifiedTick gaps. Integrates with dev-player to compare state across multiple clients in real-time and generates downloadable JSON reports for offline analysis.

**Architecture:** Single package with an imperative API (`attachDesyncDiagnostics(runner)` → returns `DiagnosticsCollector` with `dispose()`) and a React hook wrapper (`useDesyncDiagnostics(runner)`). Records full per-tick state in a pre-allocated typed-array ring buffer. Streams lightweight summary data to dev-player via postMessage. On-demand full report generation. Dev-player gets a new "Diagnostics" panel with multi-client divergence window comparison and "Download Report" button. Protocol types self-contained in the diagnostics package — no modifications to `@lagless/react`.

**Tech Stack:** TypeScript, ESM, no build step (source-only like `@lagless/dev-tools`). Peer deps on `@lagless/core` and `@lagless/relay-client`.

## Scope

### In Scope
- `@lagless/desync-diagnostics` package with collector, report generator, dev-bridge extensions
- Per-tick state recording: hash, input counts per slot, rollback flag, verifiedTick, maxReceivedServerTick
- Rollback event log: trigger tick, rollback-to tick, which slot's input caused it
- VerifiedTick gap detection: when maxReceivedServerTick jumps past undelivered fanouts
- JSON report generation with full timeline, rollback log, input history dump
- Dev-bridge protocol extensions for diagnostics data streaming and report requests
- Dev-player UI: diagnostics panel with multi-client timeline comparison, download report buttons
- Integration example in 2d-map-test game

### Out of Scope
- Rapier body count verification (can be added later as an extension)
- HTML report viewer (JSON only for v1)
- Automatic root cause analysis
- Server-side diagnostics
- Changes to the core rollback/hash verification logic (this package is read-only/observational)

## Context for Implementer

**Patterns to follow:**
- Package structure: `libs/dev-tools/` — source-only, no build, peer deps (`dev-tools/package.json`)
- Dev-bridge protocol: `libs/react/src/lib/dev-bridge/protocol.ts` — message type definitions
- Hook into runner: `libs/react/src/lib/dev-bridge/use-dev-bridge.ts` — uses `simulation.addTickHandler()`, checks `RelayInputProvider`
- Report generation: `libs/core/src/lib/input/rpc-history.ts:181-201` — `debugExportAsJSON()` pattern
- Dev-player dashboard: `tools/dev-player/src/app/components/dashboard.tsx` — canvas timeline + table rendering

**Conventions:**
- Single quotes, 2-space indent, 120 char width
- File naming: kebab-case
- ESM everywhere, `.js` extension in imports for built libs
- Dev-bridge messages prefixed with `dev-bridge:`
- React inline styles (no CSS modules) in dev-player

**Key files:**
- `libs/core/src/lib/ecs-simulation.ts` — `addTickHandler()`, `addRollbackHandler()`, `getHashAtTick()`, `mem.getHash()`
- `libs/core/src/lib/input/abstract-input-provider.ts` — `rpcHistory`, `verifiedTick`, `collectTickRPCs()`
- `libs/core/src/lib/input/rpc-history.ts` — will add `getRPCsAtTick()`, `getRPCCountAtTick()` public methods
- `libs/relay-client/src/lib/relay-input-provider.ts` — will add `maxReceivedServerTick` public getter
- `libs/react/src/lib/dev-bridge/protocol.ts` — existing dev-bridge message types (NOT modified — diagnostics types self-contained)
- `libs/react/src/lib/dev-bridge/use-dev-bridge.ts` — existing dev-bridge hook (sends stats every 6 ticks)
- `tools/dev-player/src/app/components/dashboard.tsx` — existing dashboard with hash timeline
- `tools/dev-player/src/app/types.ts` — `InstanceState`, `DevPlayerAction`, `DevPlayerState`
- `tools/dev-player/src/app/store.ts` — reducer
- `tools/dev-player/src/app/hooks/use-bridge-messages.ts` — message handler

**Gotchas:**
- `RelayInputProvider` is in `@lagless/relay-client` — diagnostics must handle both local and relay input providers
- `verifiedTick` returns -1 when `maxReceivedServerTick` is 0 (`relay-input-provider.ts:77`)
- `DevBridge.isActive()` uses cached URL params (`dev-bridge.ts:22`) — must check before attaching
- `RPCHistory.debugExportAsJSON()` exists but doesn't include input names, only IDs
- Dev-player runs at port 4210, game iframes communicate via `window.postMessage`
- The `useDevBridge` hook already sends stats every 6 ticks — diagnostics should NOT duplicate this, should extend it

**Domain context:**
- A "rollback" means: restore ECS ArrayBuffer + Rapier world from snapshot at an earlier tick, then re-simulate forward
- `verifiedTick` = the tick up to which the simulation state is guaranteed final (no future rollback possible)
- `maxReceivedServerTick` = highest serverTick seen in any fanout/pong message. Currently used as basis for `verifiedTick = maxReceivedServerTick - 1`
- Hash = simple byte-level hash of the entire ECS ArrayBuffer (positions, PRNG state, entity masks, etc.)
- A "verifiedTick gap" = when `maxReceivedServerTick` jumps ahead (e.g., via Pong or server event) while some earlier fanout hasn't arrived yet

## Progress Tracking

- [x] Task 1: Create `@lagless/desync-diagnostics` package with DiagnosticsCollector
- [x] Task 2: Implement report generation and input history export
- [x] Task 3: Extend dev-bridge protocol with diagnostics messages
- [x] Task 4: Update `useDevBridge` hook to integrate diagnostics
- [x] Task 5: Add diagnostics panel to dev-player dashboard
- [x] Task 6: Integrate diagnostics into 2d-map-test game

**Total Tasks:** 6 | **Completed:** 6 | **Remaining:** 0

## Implementation Tasks

### Task 1: Create `@lagless/desync-diagnostics` package with DiagnosticsCollector

**Objective:** Create the core package with the `DiagnosticsCollector` class that records per-tick state and rollback events via runner hooks. Expose imperative `attachDesyncDiagnostics(runner)` API.

**Dependencies:** None

**Files:**
- Create: `libs/desync-diagnostics/package.json`
- Create: `libs/desync-diagnostics/tsconfig.json`
- Create: `libs/desync-diagnostics/src/index.ts`
- Create: `libs/desync-diagnostics/src/lib/diagnostics-collector.ts`
- Create: `libs/desync-diagnostics/src/lib/attach.ts` (imperative `attachDesyncDiagnostics()` entry point)
- Create: `libs/desync-diagnostics/src/lib/types.ts`
- Create: `libs/desync-diagnostics/project.json`
- Modify: `libs/relay-client/src/lib/relay-input-provider.ts` (add `public get maxReceivedServerTick()` getter)
- Modify: `libs/core/src/lib/input/rpc-history.ts` (add `getRPCsAtTick()` and `getRPCCountAtTick()` public methods)
- Modify: `vitest.workspace.ts` (add `libs/desync-diagnostics`)
- Test: `libs/desync-diagnostics/src/lib/diagnostics-collector.spec.ts`

**Key Decisions / Notes:**
- Package structure follows `libs/dev-tools/` pattern: source-only, no build step, `main` points to `./src/index.ts`
- Peer deps: `@lagless/core`, `@lagless/relay-client` (optional — handle gracefully when not relay)
- **Imperative API:** `attachDesyncDiagnostics(runner: ECSRunner, options?: DiagnosticsConfig): DiagnosticsCollector` — wires up tick/rollback handlers, returns collector with `dispose()`. This is the primary API. The React hook (Task 4) is a thin wrapper around this.
- `DiagnosticsCollector` class:
  - Constructor takes `ECSRunner` + optional config (bufferSize default 18000 = 5min at 60fps, maxPlayers from `ECSConfig.maxPlayers`)
  - Uses `simulation.addTickHandler()` to record per-tick: `{ tick, hash, inputCountBySlot, verifiedTick }`
  - Uses `simulation.addRollbackHandler()` to record: `{ atSimTick, rollbackToTick, timestamp }`
  - Stores tick records in a pre-allocated ring buffer (typed arrays for perf)
  - Stores rollback events in a separate ring buffer (max 1000 events)
  - Public API: `getTimeline()`, `getRollbacks()`, `getStats()`, `dispose()`
- **Rollback re-simulation handling:** `_isResimulating` boolean flag set to `true` in rollback handler, cleared when tick handler sees a tick beyond the pre-rollback tick. Ticks recorded during re-simulation get `wasRollback: true`. Hashes for `wasRollback: true` ticks are post-rollback values.
- `TickRecord` type: `{ tick: number, hash: number, inputCountBySlot: Uint8Array, verifiedTick: number, wasRollback: boolean }`
- **Ring buffer layout for inputCountBySlot:** pre-allocate `Uint8Array(bufferSize * maxPlayers)`, indexed as `[tickIndex * maxPlayers + slotIndex]`. Constructor requires `maxPlayers` (from `ECSConfig.maxPlayers`).
- Use `Uint32Array` for tick/hash fields, `Uint8Array` for flags, to minimize memory (~50 bytes/tick = ~900KB for 5min)
- **RPCHistory public accessor:** Add `getRPCsAtTick(tick): ReadonlyArray<RPC>` and `getRPCCountAtTick(tick): number` to `RPCHistory` so the collector can count inputs per slot without using the expensive `debugExportAsJSON()`.
- **RelayInputProvider getter:** Add `public get maxReceivedServerTick(): number` to expose the private `_maxReceivedServerTick` field.
- To detect which slot caused a rollback: after rollback handler fires, on the next tick re-simulation, check which new RPCs appeared at the rollback tick compared to what was there before. Simpler approach: record the rollback tick and note inputs present at that tick during re-simulation.

**Definition of Done:**
- [ ] Package scaffolded with correct `package.json`, `tsconfig.json`, `project.json`
- [ ] `attachDesyncDiagnostics(runner)` imperative API exported and working
- [ ] `DiagnosticsCollector` records tick hashes and rollback events
- [ ] Ring buffer correctly wraps and overwrites old data (including pre-allocated inputCountBySlot)
- [ ] Re-simulated ticks after rollback correctly marked with `wasRollback: true`
- [ ] `RPCHistory.getRPCsAtTick()` and `getRPCCountAtTick()` public methods added
- [ ] `RelayInputProvider.maxReceivedServerTick` public getter added
- [ ] `vitest.workspace.ts` updated with new package
- [ ] `dispose()` removes all handlers
- [ ] Unit tests verify recording, ring buffer behavior, and rollback re-simulation marking
- [ ] No diagnostics errors

**Verify:**
```
npx vitest run --project=@lagless/desync-diagnostics
```

---

### Task 2: Implement report generation and input history export

**Objective:** Add JSON report generation to `DiagnosticsCollector` that includes timeline, rollbacks, input history, config, and divergence events.

**Dependencies:** Task 1

**Files:**
- Create: `libs/desync-diagnostics/src/lib/report-generator.ts`
- Modify: `libs/desync-diagnostics/src/lib/diagnostics-collector.ts` (add `generateReport()`)
- Modify: `libs/desync-diagnostics/src/lib/types.ts` (add report types)
- Modify: `libs/desync-diagnostics/src/index.ts` (export report types)
- Test: `libs/desync-diagnostics/src/lib/report-generator.spec.ts`

**Key Decisions / Notes:**
- Report structure (see `DiagnosticsReport` type):
  ```
  { version, generatedAt, playerSlot, config: { fps, maxPlayers, ... },
    summary: { totalTicks, totalRollbacks, firstDivergenceTick, verifiedTickGapCount },
    timeline: TickRecord[],
    rollbacks: RollbackEvent[],
    inputHistory: (from RPCHistory.debugExportAsJSON()),
    divergences: (ticks where hash mismatches were detected) }
  ```
- `generateReport()` uses `RPCHistory.getRPCsAtTick()` (added in Task 1) to export input history only for ticks within the ring buffer range, keeping report size bounded and predictable. Falls back to `debugExportAsJSON()` only if full history is explicitly requested.
- Include `ECSConfig` fields in the config section for context
- Report is a plain JS object — caller handles `JSON.stringify()` and download
- Keep report size reasonable: timeline is the ring buffer contents, input history bounded to same tick range

**Definition of Done:**
- [ ] `generateReport()` returns a structured `DiagnosticsReport` object
- [ ] Report includes timeline, rollbacks, input history, config
- [ ] Report can be serialized to JSON without errors
- [ ] Unit tests verify report structure and content
- [ ] No diagnostics errors

**Verify:**
```
npx vitest run --project=@lagless/desync-diagnostics
```

---

### Task 3: Define diagnostics protocol types

**Objective:** Define new dev-bridge message types for diagnostics data streaming and report requests. Keep `@lagless/react` decoupled — protocol types defined in the diagnostics package, postMessages sent directly from the hook (not via DevBridge class methods).

**Dependencies:** Task 1

**Files:**
- Create: `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts` (diagnostics-specific message type definitions)
- Modify: `libs/desync-diagnostics/src/index.ts` (export protocol types)

**Key Decisions / Notes:**
- New child→parent messages:
  - `dev-bridge:diagnostics-summary` — lightweight periodic summary: `{ rollbackCount, lastRollbackTick, verifiedTickGapCount, ticksRecorded, latestHash }`
  - `dev-bridge:diagnostics-report` — full report JSON (sent in response to request)
- New parent→child messages:
  - `dev-bridge:request-diagnostics-report` — dev-player asks instance for full report
- Summary is sent every ~30 ticks (0.5s) to avoid flooding
- Report is sent as a single large postMessage (JSON serializable object)
- Follow existing pattern: messages are plain objects with `type` and `instanceId` fields
- **Decoupling:** Do NOT modify `DevBridge` class or `protocol.ts` in `@lagless/react`. Instead, define message types in the diagnostics package. The hook (Task 4) sends postMessages directly via `window.parent.postMessage()` — same underlying mechanism DevBridge uses. This keeps `@lagless/react` free of diagnostics knowledge.
- Dev-player imports diagnostics types directly from `@lagless/desync-diagnostics`

**Definition of Done:**
- [ ] Protocol types defined for all 3 new message types in diagnostics package
- [ ] Types exported from `@lagless/desync-diagnostics`
- [ ] No modification to `@lagless/react` — fully decoupled
- [ ] No diagnostics errors

**Verify:**
```
pnpm exec nx typecheck @lagless/react
```

---

### Task 4: Create `useDesyncDiagnostics` React hook

**Objective:** Create a `useDesyncDiagnostics` hook as a thin wrapper around the imperative `attachDesyncDiagnostics()` API. Streams summaries to dev-player and responds to report requests.

**Dependencies:** Task 1, Task 2, Task 3

**Files:**
- Create: `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts`
- Modify: `libs/desync-diagnostics/src/index.ts` (export hook)
- Modify: `libs/desync-diagnostics/package.json` (add react peer dep)

**Key Decisions / Notes:**
- `useDesyncDiagnostics(runner: ECSRunner | null)` — React hook, follows `useDevBridge` pattern
- Wraps `attachDesyncDiagnostics(runner)` from Task 1 — creates collector on mount, disposes on unmount
- Only activates when `DevBridge.isActive()` is true (running inside dev-player iframe)
- Sends `dev-bridge:diagnostics-summary` every 30 ticks via `window.parent.postMessage()` directly (NOT via DevBridge methods)
- Registers its own `window.addEventListener('message', ...)` listener to handle `dev-bridge:request-diagnostics-report` from parent → calls `generateReport()` → sends `dev-bridge:diagnostics-report` via `window.parent.postMessage()`
- Import `DevBridge` from `@lagless/react` only for `DevBridge.isActive()` check — add as optional peer dep
- The hook is separate from `useDevBridge` to maintain package boundaries (diagnostics is optional)

**Definition of Done:**
- [ ] `useDesyncDiagnostics` hook wraps imperative API and streams summaries
- [ ] Hook uses own message listener (not DevBridge.onParentMessage) for report requests
- [ ] Hook responds to report requests from dev-player
- [ ] Hook cleans up on unmount (disposes collector, removes message listeners)
- [ ] No diagnostics errors

**Verify:**
```
pnpm exec nx typecheck @lagless/desync-diagnostics
```

---

### Task 5: Add diagnostics panel to dev-player dashboard

**Objective:** Add a "Diagnostics" section to the dev-player dashboard that shows multi-client timeline comparison, rollback overlay, and "Download Report" buttons.

**Dependencies:** Task 2, Task 3

**Files:**
- Create: `tools/dev-player/src/app/components/diagnostics-panel.tsx`
- Modify: `tools/dev-player/src/app/types.ts` (add diagnostics state types)
- Modify: `tools/dev-player/src/app/store.ts` (add diagnostics actions/reducer)
- Modify: `tools/dev-player/src/app/hooks/use-bridge-messages.ts` (handle diagnostics messages)
- Modify: `tools/dev-player/src/app/components/dashboard.tsx` (render DiagnosticsPanel)

**Key Decisions / Notes:**
- New state in `InstanceState`: `diagnosticsSummary: DiagnosticsSummary | null`, `diagnosticsReport: DiagnosticsReport | null`
- New actions: `INSTANCE_DIAGNOSTICS_SUMMARY`, `INSTANCE_DIAGNOSTICS_REPORT`
- `DiagnosticsPanel` component:
  - **Summary table**: per-instance rollback count, verifiedTick gaps, ticks recorded
  - **Download buttons**: "Download Report" per instance (requests report via postMessage, then triggers browser download of JSON), "Download All" button that requests all and bundles into a single JSON with all clients
  - **Comparison hint**: when multiple reports are available, show divergence windows — first N contiguous tick ranges where hashes differ between any two clients, with surrounding context. Diff-style view is more actionable than full timeline comparison.
- The panel sends `dev-bridge:request-diagnostics-report` to the target iframe when download is clicked
- File download: create a Blob from JSON, create object URL, trigger `<a>` click
- Follow existing dashboard styling (inline styles, monospace font, dark theme)
- The multi-client comparison view shows which tick ranges have hash mismatches across instances (using the summary data streamed in real-time)

**Definition of Done:**
- [ ] DiagnosticsPanel renders summary table with per-instance stats
- [ ] "Download Report" button requests and downloads JSON report for each instance
- [ ] "Download All" button downloads combined report
- [ ] `use-bridge-messages.ts` handles new diagnostics message types
- [ ] Store correctly manages diagnostics state
- [ ] No diagnostics errors

**Verify:**
```
pnpm exec nx typecheck @lagless/dev-player
```

---

### Task 6: Integrate diagnostics into 2d-map-test game

**Objective:** Wire up desync diagnostics in the 2d-map-test game client as a usage example.

**Dependencies:** Task 4

**Files:**
- Modify: `2d-map-test/2d-map-test-game/src/app/game-view/runner-provider.tsx` (add `useDesyncDiagnostics` call)
- Modify: `2d-map-test/2d-map-test-game/package.json` (add `@lagless/desync-diagnostics` dep)

**Key Decisions / Notes:**
- Add `useDesyncDiagnostics(runner)` call right after `useDevBridge(runner, ...)` in `RunnerProvider` (line ~247)
- Add `@lagless/desync-diagnostics` as a dependency in `package.json`
- This is a one-line integration — the hook handles everything
- Follows same pattern as `useDevBridge` — no-op outside dev-player iframes

**Definition of Done:**
- [ ] `useDesyncDiagnostics(runner)` called in runner-provider
- [ ] Package dependency added
- [ ] Game builds and runs without errors
- [ ] Diagnostics data visible in dev-player when 2d-map-test is running
- [ ] No diagnostics errors

**Verify:**
```
pnpm exec nx typecheck @lagless/2d-map-test-game
```

## Testing Strategy

- **Unit tests** (Task 1, 2): DiagnosticsCollector ring buffer behavior, report generation, edge cases (empty buffer, single tick, buffer wrap)
- **Integration verification** (Task 6): Manual test via dev-player — run 2d-map-test with artificial latency, verify diagnostics panel shows data, download report, inspect JSON structure
- **Type checking** (all tasks): `pnpm exec nx typecheck` for affected packages

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| postMessage payload too large for full report | Low | Medium | Reports use ring buffer (bounded size), input history is text (compresses well). If needed, chunk the message. |
| Performance overhead from per-tick hash computation | Medium | High | `mem.getHash()` is already computed by the simulation for hash tracking — reuse `getHashAtTick()` from `_hashHistory` instead of recomputing. Only compute when `_hashHistory` doesn't have it. |
| Ring buffer memory usage | Low | Low | 18000 ticks * ~50 bytes = ~900KB — negligible for dev tool |
| Dev-bridge message flooding | Low | Medium | Summary sent every 30 ticks (0.5s), not every tick. Full report only on-demand. |

## Goal Verification

### Truths
1. A game developer can call `attachDesyncDiagnostics(runner)` imperatively or use `useDesyncDiagnostics(runner)` React hook to get full desync diagnostics in dev-player
2. Dev-player shows per-instance diagnostics summary (rollback count, verifiedTick gaps, ticks recorded)
3. "Download Report" produces a JSON file containing full timeline, rollback log, and input history
4. The report contains enough information to compare two clients' state at any recorded tick
5. The diagnostics package has zero runtime cost when not running inside dev-player (DevBridge.isActive() check)

### Artifacts
1. `libs/desync-diagnostics/src/lib/diagnostics-collector.ts` — core collector class
2. `libs/desync-diagnostics/src/lib/report-generator.ts` — JSON report generation
3. `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts` — React hook for dev-bridge integration
4. `tools/dev-player/src/app/components/diagnostics-panel.tsx` — dev-player UI
5. `2d-map-test/2d-map-test-game/src/app/game-view/runner-provider.tsx` — usage example

### Key Links
1. `attachDesyncDiagnostics` → `DiagnosticsCollector` ↔ `ECSSimulation.addTickHandler/addRollbackHandler` — data collection
2. `useDesyncDiagnostics` → `window.parent.postMessage()` — data streaming to dev-player (decoupled from DevBridge)
3. `DiagnosticsPanel` ↔ `useBridgeMessages` — data reception in dev-player
4. `generateReport()` ↔ `RPCHistory.getRPCsAtTick()` — bounded input history inclusion
5. `DiagnosticsCollector` ↔ `RelayInputProvider.maxReceivedServerTick` — verifiedTick gap detection

## Open Questions

None — all design decisions resolved.

## Deferred Ideas

- Rapier body count verification after rollback (detect missing map colliders)
- Per-component ECS diff (show which component arrays differ between clients)
- Automatic desync root cause suggestions based on report patterns
- HTML report viewer for standalone analysis
- Server-side diagnostics collector for input relay timing analysis
- Integrate diagnostics into other games (circle-sumo, sync-test, roblox-like) and the create tool template
