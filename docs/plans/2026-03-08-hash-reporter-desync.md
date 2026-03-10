# Hash Reporter Desync Fix Plan

Created: 2026-03-08
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Bugfix

## Summary
**Symptom:** Multiplayer desync — clients diverge at ticks where ReportHash RPCs are present on one client but absent on another.
**Trigger:** Rollback during multiplayer session. Client A's rollback handler removes ReportHash RPCs from its RPCHistory, but Client B already received them via TickInputFanout and retains them.
**Root Cause:** `libs/core/src/lib/hash-verification/create-hash-reporter.ts:26-35` — rollback handler calls `rpcHistory.removeByInputIdForPlayer()` to remove ReportHash RPCs locally, but other clients already received them through server broadcast (fanout). Additionally, `AbstractHashVerificationSystem` writes hash data to `PlayerResource` during simulation, compounding the desync since different clients have different RPCs → different PlayerResource state → different simulation hash.

## Investigation
- **Data evidence**: Analysis of desync report showed 13 phantom slot-0 inputs visible on slot 1 but absent on slot 0, first divergence at tick 975. All mismatched inputs were ReportHash RPCs.
- **Fundamental design flaw**: Hash reports (meta/diagnostic data) flow through the same RPC pipeline as gameplay inputs (MoveInput, PlayerJoined, etc.). Since RPCHistory must be identical across all clients for determinism, any mechanism that modifies RPCHistory asymmetrically (like the rollback handler) breaks determinism.
- **Rollback handler flow**: On rollback, `createHashReporter` removes all ReportHash RPCs from local history. But the server already accepted and broadcast them. CancelInput is only sent for server-rejected inputs (TooOld), not for client-initiated rollback removals.
- **Double impact**: `AbstractHashVerificationSystem.update()` reads ReportHash from `collectTickRPCs()` and writes to `PlayerResource.lastReportedHash/lastReportedHashTick/hashMismatchCount`. Since different clients have different ReportHash RPCs, PlayerResource state diverges, which is then included in the ECS hash → desync.
- **Working comparison**: Gameplay RPCs (MoveInput) don't have this problem because they're never removed by rollback handlers — only by CancelInput from the server, which is deterministic.

## Fix Approach
**Strategy:** Move hash reporting out of the RPC pipeline entirely. Hash reports become a separate protocol message that doesn't enter RPCHistory and doesn't participate in simulation.

**Architecture:**
1. New protocol messages: `HashReport` (client→server) and `HashMismatch` (server→client)
2. Server-side hash comparison: server stores per-player hash reports, compares when all connected players report for same tick, sends `HashMismatch` on divergence
3. `createHashReporter` rewritten: hooks into tick handler (not `drainInputs`), sends via connection callback (not `addRPC`), no rollback handler needed
4. Remove all hash-related code from ECS simulation: `AbstractHashVerificationSystem` deleted, `ReportHash` removed from inputs, hash fields removed from `PlayerResource`, `DivergenceSignal` removed from signals arrays
5. Debug panel: replace `hashVerification` prop with `onDivergence` callback, remove per-player hash table (unreliable anyway due to the bug)
6. `RPCHistory.removeByInputIdForPlayer()` removed (was only used by the old rollback handler)

**Files:**
- **net-wire**: `protocol.ts` (new message types, schemas, pack/unpack)
- **relay-server**: `relay-room.ts` (handle HashReport, compare hashes, send HashMismatch)
- **core**: `create-hash-reporter.ts` (rewrite), `abstract-hash-verification.system.ts` (delete), `divergence.signal.ts` (keep type, remove class), `rpc-history.ts` (remove `removeByInputIdForPlayer`), `index.ts` (update exports)
- **relay-client**: `relay-connection.ts` (send/receive new messages), `types.ts` (new event)
- **react**: `debug-panel.tsx`, `use-net-stats.ts`, `types.ts` (update hash display)
- **Games** (2d-map-test, sync-test, roblox-like): `ecs.yaml`, codegen, remove `hash-verification.system.ts`, update `systems/index.ts`, `signals/index.ts`, `runner-provider.tsx`, game debug panels
- **Template** (tools/create/templates/pixi-react): same changes

**Tests:**
- `protocol.spec.ts`: pack/unpack roundtrip for HashReport and HashMismatch
- `rpc-history.spec.ts`: remove `removeByInputIdForPlayer` tests
- `create-hash-reporter.spec.ts`: new test verifying hash reports don't enter RPCHistory
- Existing test suites must continue passing

**Defense-in-depth:** Not applicable — this is a design-level fix that removes the problematic code path entirely rather than adding validation layers.

## Progress
- [x] Task 1: Protocol & Server — new message types + server-side hash comparison
- [x] Task 2: Core & Client — rewrite createHashReporter, remove ECS hash verification, update RelayConnection
- [x] Task 3: Games & UI — update all games/templates, ecs.yaml cleanup, codegen, debug panel
- [x] Task 4: Verify
**Tasks:** 4 | **Done:** 4

## Tasks

### Task 1: Protocol & Server
**Objective:** Add HashReport and HashMismatch protocol messages to net-wire. Implement server-side hash comparison in RelayRoom.
**Files:**
- Modify: `libs/net-wire/src/lib/protocol.ts` — add `MsgType.HashReport = 10`, `MsgType.HashMismatch = 11`, schemas (`HashReportSchema`: hash uint32 + atTick uint32; `HashMismatchSchema`: slotA uint8 + slotB uint8 + hashA uint32 + hashB uint32 + atTick uint32), data types, pack/unpack functions
- Modify: `libs/net-wire/src/index.ts` — export new types and functions
- Modify: `libs/net-wire/src/lib/protocol.spec.ts` — pack/unpack roundtrip tests for both message types
- Modify: `libs/relay-server/src/lib/relay-room.ts` — add `handleHashReport()` (store in `Map<tick, Map<slot, hash>>`; when all connected players reported for same tick → compare; on mismatch → pack and send `HashMismatch` to all; prune old entries). Add `case 10` in `handleMessage` switch.
**TDD:** Write protocol pack/unpack tests first → verify FAIL → implement → verify PASS
**Verify:** `npx vitest run --project=@lagless/net-wire`

### Task 2: Core & Client Refactor
**Objective:** Rewrite createHashReporter to use the new protocol channel. Remove all hash-related ECS simulation code. Update RelayConnection to send/receive new messages.
**Files:**
- Modify: `libs/core/src/lib/hash-verification/create-hash-reporter.ts` — complete rewrite. New API:
  ```typescript
  export interface HashReporterConfig {
    reportInterval: number;
    send: (data: { hash: number; atTick: number }) => void;
  }
  export interface HashMismatchData {
    slotA: number; slotB: number;
    hashA: number; hashB: number;
    atTick: number;
  }
  export interface HashReporter {
    dispose(): void;
    subscribeDivergence(fn: (data: HashMismatchData) => void): () => void;
    reportMismatch(data: HashMismatchData): void;
  }
  export function createHashReporter(runner: ECSRunner, config: HashReporterConfig): HashReporter;
  ```
  Implementation: hooks into `runner.Simulation.addTickHandler()`, checks verified tick, sends hash via `config.send()`. No `addRPC`, no rollback handler, no RPCHistory involvement. Stores internal subscriber list for divergence callbacks.
- Delete: `libs/core/src/lib/hash-verification/abstract-hash-verification.system.ts`
- Modify: `libs/core/src/lib/hash-verification/divergence.signal.ts` — remove the Signal class, keep only `DivergenceData` as type alias for `HashMismatchData` (backward compat re-export)
- Modify: `libs/core/src/lib/hash-verification/index.ts` — update exports (remove `AbstractHashVerificationSystem`, `DivergenceSignal`; add `HashReporter`, `HashMismatchData`, `HashReporterConfig`)
- Modify: `libs/core/src/lib/input/rpc-history.ts` — remove `removeByInputIdForPlayer()` method
- Modify: `libs/core/src/lib/input/rpc-history.spec.ts` — remove tests for `removeByInputIdForPlayer`
- Modify: `libs/core/src/index.ts` — update exports
- Modify: `libs/relay-client/src/lib/relay-connection.ts` — add `sendHashReport()` method (packs and sends `HashReport`), add `MsgType.HashMismatch` case in `handleBinaryMessage` that calls `_events.onHashMismatch()`
- Modify: `libs/relay-client/src/lib/relay-connection.ts` — add `onHashMismatch` to `RelayConnectionEvents` interface
- Modify: `libs/relay-client/src/lib/relay-input-provider.ts` — add `handleHashMismatch()` (no-op placeholder; actual handling done via HashReporter callback in runner-provider)
- Modify: `libs/react/src/lib/debug-panel/types.ts` — replace `hashVerification` prop with optional `onDivergence` callback `((fn: (data: HashMismatchData) => void) => () => void)`; remove `HashTableEntry`
- Modify: `libs/react/src/lib/debug-panel/debug-panel.tsx` — use `onDivergence` instead of `hashVerification.divergenceSignalClass`; remove hash table rendering
- Modify: `libs/react/src/lib/debug-panel/use-net-stats.ts` — remove hash table logic and `playerResourceClass` parameter
**TDD:** Write test for createHashReporter verifying no RPCHistory involvement → FAIL → implement → PASS. Run existing rpc-history tests after removal → PASS.
**Verify:** `npx vitest run --project=@lagless/core && npx vitest run --project=@lagless/relay-client`

### Task 3: Games & UI Integration
**Objective:** Update all games and templates to use the new hash reporting mechanism. Remove ReportHash from ECS schemas, re-run codegen, update runner-providers and debug panels.
**Files per game (2d-map-test, sync-test, roblox-like):**
- Modify: `<game>-simulation/src/lib/schema/ecs.yaml` — remove `ReportHash` from inputs section; remove `lastReportedHash`, `lastReportedHashTick`, `hashMismatchCount` from PlayerResource
- Re-run codegen: `pnpm exec nx g @lagless/codegen:ecs --configPath <path>/ecs.yaml`
- Delete: `<game>-simulation/src/lib/systems/hash-verification.system.ts`
- Modify: `<game>-simulation/src/lib/systems/index.ts` — remove `HashVerificationSystem` import and from systems array
- Modify: `<game>-simulation/src/lib/signals/index.ts` — remove `DivergenceSignal` from imports and signals array
- Modify: `<game>-game/src/app/game-view/runner-provider.tsx` — replace `createHashReporter(runner, { reportHashRpc: ReportHash, ... })` / `reportHash(addRPC)` pattern with new `createHashReporter(runner, { reportInterval, send: (data) => connection.sendHashReport(data) })`. Wire `onHashMismatch` from connection to `hashReporter.reportMismatch()`. Remove `reportHash(addRPC)` from drainInputs. Pass `hashReporter.subscribeDivergence` to debug panel.
- Modify: `<game>-game/src/app/game-view/components/debug-panel.tsx` (where applicable) — pass `onDivergence` prop instead of `hashVerification`

**Template (tools/create/templates/pixi-react):**
- Same changes as games:
  - `__packageName__-simulation/src/lib/schema/ecs.yaml` — remove ReportHash input, remove hash PlayerResource fields
  - `__packageName__-simulation/src/lib/systems/hash-verification.system.ts` — delete
  - `__packageName__-simulation/src/lib/systems/index.ts` — remove HashVerificationSystem
  - `__packageName__-simulation/src/lib/signals/index.ts` — remove DivergenceSignal
  - `__packageName__-frontend/src/app/game-view/runner-provider.tsx` — new hash reporter pattern
  - `__packageName__-frontend/src/app/components/debug-panel.tsx` — new props
  - Template docs referencing HashVerificationSystem or ReportHash

**TDD:** After codegen, verify existing simulation tests still pass. No new tests needed — Task 1 covers protocol, Task 2 covers core logic.
**Verify:** `npx vitest run` (all projects), `pnpm exec nx run-many -t typecheck -p @lagless/core @lagless/net-wire @lagless/relay-client @lagless/relay-server`

### Task 4: Verify
**Objective:** Full suite + quality checks
**Verify:** `npx vitest run && pnpm exec nx run-many -t lint typecheck build`
