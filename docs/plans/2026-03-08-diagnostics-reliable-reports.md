# Reliable Diagnostics Reports Implementation Plan

Created: 2026-03-08
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Make desync-diagnostics reliably collect complete reports from ALL clients, add Rapier physics state hashing to every tick, and auto-generate cross-client divergence analysis in combined reports.

**Architecture:** Three changes: (1) `DiagnosticsCollector` gains an optional `physicsHashFn` callback and records `physicsHash` per tick. (2) Dev-player's "Download All" gets retry logic, 30s timeout, and per-client progress. (3) `CombinedDiagnosticsReport` gains an auto-generated `divergenceAnalysis` section computed at report assembly time.

**Tech Stack:** TypeScript, React, postMessage API

## Scope

### In Scope
- Add `physicsHash` per tick to DiagnosticsCollector and report types
- Reliable report collection with retry and progress in dev-player
- Auto-generated divergence analysis in combined reports
- Hash utility function for Uint8Array (reusable for Rapier snapshots)
- Update useDesyncDiagnostics to accept physicsHashFn
- Update all tests

### Out of Scope
- Per-entity state dump at divergence point (future enhancement)
- Server-side report collection routing
- Offline report analysis CLI tool
- Changes to the hash verification system in core (ReportHash RPC)

## Context for Implementer

> Write for an implementer who has never seen the codebase.

- **Patterns to follow:**
  - `libs/desync-diagnostics/src/lib/diagnostics-collector.ts` — ring buffer pattern for per-tick data
  - `libs/desync-diagnostics/src/lib/report-generator.ts` — report assembly from collector
  - `tools/dev-player/src/app/components/diagnostics-panel.tsx` — postMessage request/response for reports

- **Conventions:**
  - Source-only package: no build step, `main` → `./src/index.ts`
  - Types in `types.ts`, protocol messages in `diagnostics-protocol.ts`
  - Ring buffer uses pre-allocated typed arrays (Uint32Array/Int32Array/Uint8Array)
  - postMessage protocol uses `dev-bridge:` prefix for message types

- **Key files:**
  - `libs/desync-diagnostics/src/lib/diagnostics-collector.ts` — core collector (ring buffer, tick/rollback handlers)
  - `libs/desync-diagnostics/src/lib/types.ts` — TickRecord, DiagnosticsConfig, DiagnosticsStats
  - `libs/desync-diagnostics/src/lib/report-generator.ts` — DiagnosticsReport, CombinedDiagnosticsReport, generateReport()
  - `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts` — React hook, postMessage bridge
  - `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts` — postMessage message types
  - `libs/desync-diagnostics/src/lib/attach.ts` — `attachDesyncDiagnostics(runner, config?)` — passes config to DiagnosticsCollector constructor
  - `tools/dev-player/src/app/components/diagnostics-panel.tsx` — UI panel with Download/Download All buttons
  - `tools/dev-player/src/app/hooks/use-bridge-messages.ts` — maps postMessage data to `DiagnosticsSummary` type (line 49-60)
  - `tools/dev-player/src/app/types.ts` — `DiagnosticsSummary` interface
  - `libs/physics2d/src/lib/physics-world-manager-2d.ts` — `takeSnapshot()` returns Rapier world as Uint8Array
  - `libs/core/src/lib/mem/mem.ts:81` — `getHash()` — current ECS hash (polynomial hash, byte-by-byte)

- **Gotchas:**
  - `ECSRunner` does NOT know about physics — `PhysicsWorldManager` is only on `PhysicsRunner2d` subclass. That's why we use a callback (`physicsHashFn`) rather than direct import.
  - `desync-diagnostics` must NOT depend on `@lagless/physics-shared` or `@lagless/physics2d`
  - The hash in the ring buffer is stored as `Uint32Array` — physics hash needs a separate `Uint32Array`
  - The 5s timeout in diagnostics-panel.tsx is the root cause of partial reports — one iframe may take seconds to respond to postMessage
  - `attachDesyncDiagnostics(runner, config?)` passes config directly to `new DiagnosticsCollector(runner, config)` — adding `physicsHashFn` to `DiagnosticsConfig` in Task 1 means `attach.ts` needs NO changes (it's a transparent passthrough)
  - `use-bridge-messages.ts` maps postMessage `dev-bridge:diagnostics-summary` data to `DiagnosticsSummary` type — must be updated when adding `latestPhysicsHash` to both
  - The timeline contains MULTIPLE entries for the same tick (original + resimulations after rollback). To get the "final" hash for a tick, take the LAST occurrence in the timeline — not just records with `wasRollback=false`
  - `physicsHashFn` is called on every tick INCLUDING during rollback re-simulation. The callback owner (game code) is responsible for performance; since `takeSnapshot()` + `hashBytes()` on 100-200KB is ~O(200K) per call, at 60fps this is ~12MB/s — acceptable for dev-only use

- **Domain context:**
  - ECS hash covers the shared ArrayBuffer (tick, PRNG, components, entities, filters, player resources)
  - Rapier physics state is stored separately in `Uint8Array` snapshots — NOT included in ECS hash
  - When clients desync, comparing BOTH hashes tells you if divergence is in ECS state, physics state, or both
  - `verifiedTick` = the latest tick that's guaranteed to never be rolled back. Hash comparisons should focus on verified ticks.
  - Rollback resimulation produces different hashes by design (new inputs), but the FINAL hash at a given tick (after all rollbacks) should match across clients

## Progress Tracking
- [x] Task 1: Add physicsHash to DiagnosticsCollector
- [x] Task 2: Add physicsHash to report types and generator
- [x] Task 3: Add divergence analysis to CombinedDiagnosticsReport
- [x] Task 4: Update useDesyncDiagnostics hook
- [x] Task 5: Reliable report collection in dev-player
**Total Tasks:** 5 | **Completed:** 5 | **Remaining:** 0

## Implementation Tasks

### Task 1: Add physicsHash to DiagnosticsCollector

**Objective:** Add optional `physicsHashFn` callback to DiagnosticsConfig and record physics hash every tick in the ring buffer.

**Dependencies:** None

**Files:**
- Create: `libs/desync-diagnostics/src/lib/hash-bytes.ts`
- Modify: `libs/desync-diagnostics/src/lib/types.ts`
- Modify: `libs/desync-diagnostics/src/lib/diagnostics-collector.ts`
- Modify: `libs/desync-diagnostics/src/lib/diagnostics-collector.spec.ts`
- Modify: `libs/desync-diagnostics/src/index.ts`

**Key Decisions / Notes:**
- Add `physicsHashFn?: () => number` to `DiagnosticsConfig`
- Add `physicsHash: number` field to `TickRecord` interface
- Add `_physicsHashes: Uint32Array` ring buffer parallel to `_hashes` in DiagnosticsCollector
- In `_onTick()`, call `this._physicsHashFn()` if provided, store result. If not provided, store 0.
- Store `_physicsHashFn` as a private field on the collector (from config)
- Add a reusable `hashBytes(data: Uint8Array): number` function in new `libs/desync-diagnostics/src/lib/hash-bytes.ts`
  - Use direct Uint8Array indexing: `for (let i = 0; i < data.length; i++) hash = (hash * 31 + data[i]) >>> 0` (faster than DataView)
- Export `hashBytes` from index.ts
- Add `latestPhysicsHash: number` to `DiagnosticsStats`
- `getTimeline()` must include `physicsHash` from `_physicsHashes` ring buffer
- `getStats()` must include `latestPhysicsHash`

**Definition of Done:**
- [ ] All existing tests still pass
- [ ] New test: physicsHash recorded when physicsHashFn provided
- [ ] New test: physicsHash is 0 when physicsHashFn not provided
- [ ] New test: hashBytes produces consistent hash for same input
- [ ] New test: hashBytes returns 0 for empty input
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/desync-diagnostics`

---

### Task 2: Add physicsHash to report types and generator

**Objective:** Include physicsHash in DiagnosticsReportTickRecord and generate it in the report.

**Dependencies:** Task 1

**Files:**
- Modify: `libs/desync-diagnostics/src/lib/report-generator.ts`
- Modify: `libs/desync-diagnostics/src/lib/report-generator.spec.ts`

**Key Decisions / Notes:**
- Add `physicsHash: number` to `DiagnosticsReportTickRecord`
- In `generateReport()`, map `r.physicsHash` from TickRecord to DiagnosticsReportTickRecord
- Bump `REPORT_VERSION` to 2
- Add `latestPhysicsHash: number` to `DiagnosticsReportSummary`
- Populate `summary.latestPhysicsHash` from `stats.latestPhysicsHash`

**Definition of Done:**
- [ ] All tests pass
- [ ] Report includes physicsHash per tick record
- [ ] Report version is 2
- [ ] Summary includes latestPhysicsHash
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/desync-diagnostics`

---

### Task 3: Add divergence analysis to CombinedDiagnosticsReport

**Objective:** When assembling a CombinedDiagnosticsReport, auto-generate a `divergenceAnalysis` section that compares hashes across clients.

**Dependencies:** Task 2

**Files:**
- Create: `libs/desync-diagnostics/src/lib/divergence-analysis.ts`
- Create: `libs/desync-diagnostics/src/lib/divergence-analysis.spec.ts`
- Modify: `libs/desync-diagnostics/src/lib/report-generator.ts`
- Modify: `libs/desync-diagnostics/src/index.ts`

**Key Decisions / Notes:**
- New types:
  ```typescript
  interface DivergenceAnalysis {
    firstEcsDivergenceTick: number | null;
    firstPhysicsDivergenceTick: number | null;
    checkpointComparison: CheckpointComparison[];
    rollbackOverlapWindows: RollbackOverlapWindow[];
  }
  interface CheckpointComparison {
    tick: number;
    ecsHashes: Record<number, number>;    // playerSlot → hash
    physicsHashes: Record<number, number>; // playerSlot → hash
    ecsMatch: boolean;
    physicsMatch: boolean;
  }
  interface RollbackOverlapWindow {
    startTick: number;
    endTick: number;
    affectedSlots: number[];
  }
  ```
- New function `analyzeDivergence(clients: DiagnosticsReport[], checkpointInterval?: number): DivergenceAnalysis`
  - `checkpointInterval` defaults to 60 ticks. Used to sample ticks for the comparison table.
  - **CRITICAL: "final hash per tick" extraction:** For each client's timeline, build a map of `tick → { hash, physicsHash }` by iterating the timeline in order. If a tick appears multiple times (due to rollback resimulation), the LAST occurrence overwrites previous ones. This gives the final hash after all rollbacks. Do NOT filter by `wasRollback=false` — resimulated ticks ARE the correct final state.
  - Find first tick where final ECS hashes differ across clients
  - Find first tick where final physics hashes differ
  - Build checkpoint comparison table at `checkpointInterval` intervals for ticks present in ALL clients
  - Find rollback overlap windows: ticks that appear as rollback events in 2+ clients' rollback arrays with overlapping `[rollbackToTick, atSimTick]` ranges
- Add `divergenceAnalysis?: DivergenceAnalysis` to `CombinedDiagnosticsReport`
- Export `analyzeDivergence`, `DivergenceAnalysis`, `CheckpointComparison`, `RollbackOverlapWindow` types from index.ts

**Definition of Done:**
- [ ] All tests pass
- [ ] New test: analyzeDivergence finds first divergence tick correctly
- [ ] New test: last occurrence of a tick in timeline is used (not first)
- [ ] New test: checkpoint comparison built at specified interval
- [ ] New test: rollback overlap windows detected
- [ ] New test: no divergence returns nulls
- [ ] New test: single client returns no divergence (nothing to compare)
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/desync-diagnostics`

---

### Task 4: Update useDesyncDiagnostics hook

**Objective:** Accept physicsHashFn parameter and pass it through to the collector. Update summary message to include physics hash.

**Dependencies:** Task 1

**Files:**
- Modify: `libs/desync-diagnostics/src/lib/use-desync-diagnostics.ts`
- Modify: `libs/desync-diagnostics/src/lib/diagnostics-protocol.ts`

**Key Decisions / Notes:**
- Change `useDesyncDiagnostics(runner)` signature to `useDesyncDiagnostics(runner, options?: { physicsHashFn?: () => number })`
- Pass `physicsHashFn` through to `attachDesyncDiagnostics(runner, { physicsHashFn })` — this works because Task 1 added `physicsHashFn` to `DiagnosticsConfig`, and `attachDesyncDiagnostics` passes config transparently to `new DiagnosticsCollector(runner, config)`. No changes needed to `attach.ts`.
- Add `latestPhysicsHash: number` to `DiagnosticsSummaryMessage`
- Update summary posting (line ~28-37) to include `latestPhysicsHash: stats.latestPhysicsHash`

**Definition of Done:**
- [ ] physicsHashFn passed through to collector via attach
- [ ] Summary messages include latestPhysicsHash
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/desync-diagnostics`

---

### Task 5: Reliable report collection in dev-player

**Objective:** Fix the unreliable 5s timeout for Download All. Add retry logic, 30s total timeout, per-client progress indicator. Show physics hash.

**Dependencies:** Task 3, Task 4

**Files:**
- Modify: `tools/dev-player/src/app/types.ts`
- Modify: `tools/dev-player/src/app/hooks/use-bridge-messages.ts`
- Modify: `tools/dev-player/src/app/components/diagnostics-panel.tsx`

**Key Decisions / Notes:**
- **types.ts:** Add `latestPhysicsHash: number` to `DiagnosticsSummary` interface
- **use-bridge-messages.ts:** Add `latestPhysicsHash: data.latestPhysicsHash ?? 0` to the summary mapping at line 53-59. Without this, the physics hash posted from iframes would be silently dropped.
- **diagnostics-panel.tsx:**
  - Increase overall timeout from 5s to 30s
  - Add per-client retry: if a client hasn't responded after 10s, re-send request (up to 2 retries per client)
  - Track per-client status: `'waiting' | 'received' | 'timeout'`
  - Show per-client status in the table: checkmark (received), spinner (waiting), X (timeout)
  - When all collected or final timeout: run `analyzeDivergence()` on collected reports, attach to combined report
  - Combined report `version` should be derived from collected client reports (use `clients[0]?.version ?? 2`)
  - Show physics hash column in diagnostics table alongside ECS hash
  - Individual "Download" button timeout: increase from 5s to 15s
  - Extract retry/collection logic into a pure function `collectAllReports(...)` for testability
  - Add `requestId` (a unique counter per Download All click) to prevent cross-request contamination when retries from a stale request arrive

**Definition of Done:**
- [ ] Download All waits up to 30s total
- [ ] Retry sent after 10s for non-responding clients
- [ ] Per-client progress shown (checkmark/spinner/X)
- [ ] Combined report includes divergenceAnalysis
- [ ] Physics hash shown in diagnostics table
- [ ] latestPhysicsHash flows from iframe → use-bridge-messages → DiagnosticsSummary → table
- [ ] No diagnostics errors

**Verify:**
- Manual: run dev-player with 2+ instances, click Download All, verify all clients respond
- Manual: verify combined report has divergenceAnalysis section
- Manual: verify physics hash column visible in diagnostics table

## Testing Strategy

- **Unit tests:** DiagnosticsCollector physics hash recording, hashBytes utility, divergence analysis logic (final-hash-per-tick extraction, checkpoint comparison, rollback overlap)
- **Integration:** Report generation with physics hash data
- **Manual:** Dev-player Download All with multiple game instances

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `takeSnapshot()` is expensive per tick | Medium | Performance degradation in dev mode | User confirmed dev-tool only — acceptable cost. hashBytes is O(n) on snapshot bytes. |
| Rapier snapshot size varies → hash time varies | Low | Inconsistent frame times | Dev-tool only, not production. Callback owner is responsible for caching/throttling if needed. |
| postMessage retries cause duplicate report collection | Medium | Confusing UI state | Track received reports by instanceId in a Set, ignore duplicates. Use requestId to isolate Download All invocations. |
| Divergence analysis wrong if timelines don't overlap | Medium | Misleading analysis | Only compare ticks present in ALL clients' final-hash maps |
| physicsHashFn called during rollback re-simulation (many ticks per frame) | Medium | Frame drops during rollback | Dev-tool only. Document that callback owner can throttle if needed. |

## Goal Verification

### Truths
1. DiagnosticsCollector records a separate physics hash alongside ECS hash every tick
2. hashBytes utility consistently hashes Uint8Array data
3. Combined report Download All collects from ALL clients (no partial reports within 30s)
4. CombinedDiagnosticsReport includes auto-generated divergence analysis with first divergence tick and checkpoint comparison
5. Dev-player shows per-client collection progress (checkmark/spinner/X)
6. Dev-player shows physics hash alongside ECS hash in the table

### Artifacts
1. `libs/desync-diagnostics/src/lib/hash-bytes.ts` — reusable hash utility
2. `libs/desync-diagnostics/src/lib/divergence-analysis.ts` — cross-client analysis
3. `libs/desync-diagnostics/src/lib/types.ts` — physicsHash in TickRecord, physicsHashFn in DiagnosticsConfig
4. `libs/desync-diagnostics/src/lib/report-generator.ts` — physicsHash in report, version 2
5. `tools/dev-player/src/app/components/diagnostics-panel.tsx` — retry logic, progress UI, physics hash column
6. `tools/dev-player/src/app/hooks/use-bridge-messages.ts` — latestPhysicsHash passthrough

### Key Links
1. DiagnosticsConfig.physicsHashFn → DiagnosticsCollector._onTick → TickRecord.physicsHash
2. hashBytes() ← game code wraps takeSnapshot() → physicsHashFn callback
3. generateReport() → DiagnosticsReportTickRecord.physicsHash
4. analyzeDivergence(clients) → CombinedDiagnosticsReport.divergenceAnalysis
5. diagnostics-panel.tsx requestReport() → retry timer → postMessage → iframe response
6. use-desync-diagnostics.ts → postMessage(summary with latestPhysicsHash) → use-bridge-messages.ts → DiagnosticsSummary → diagnostics table
