# Fix Hash Timeline in Dev Player

## Context

Dev Player's hash timeline shows false red dots (divergence) under latency because `useDevBridge` sends `sim.mem.getHash()` at the current tick, which can change after rollback but is never re-sent. Additionally, all dots turn grey after 3 seconds due to `HASH_TIMEOUT_MS = 3000` — the timestamp is set on entry creation and never updated, causing verified entries to incorrectly show as timed out.

## Changes

### 1. Add `verifiedHashTick` / `verifiedHash` to protocol
**File:** `libs/react/src/lib/dev-bridge/protocol.ts`

Add two optional fields to `DevBridgeStatsMessage`:
```typescript
verifiedHashTick?: number;  // floor(verifiedTick / interval) * interval
verifiedHash?: number;      // hash from _hashHistory at that tick
```

### 2. Update `useDevBridge` to send verified hashes
**File:** `libs/react/src/lib/dev-bridge/use-dev-bridge.ts`

- Change signature: `useDevBridge(runner, options?: { hashTrackingInterval?: number })`
- When `hashTrackingInterval` is set, compute verified hash using same pattern as `createHashReporter`:
  ```typescript
  const verifiedTick = relayProvider.verifiedTick; // or sim.tick for local
  const latestReportTick = Math.floor(verifiedTick / interval) * interval;
  const verifiedHash = latestReportTick > 0 ? sim.getHashAtTick(latestReportTick) : undefined;
  ```
- Include `verifiedHashTick` and `verifiedHash` in the stats message (both relay and local paths)

### 3. Add fields to dev-player types
**File:** `tools/dev-player/src/app/types.ts`

Add to `InstanceStats`:
```typescript
verifiedHashTick?: number;
verifiedHash?: number;
```

### 4. Pass through in bridge messages hook
**File:** `tools/dev-player/src/app/hooks/use-bridge-messages.ts`

Add `verifiedHashTick: data.verifiedHashTick` and `verifiedHash: data.verifiedHash` to the stats object.

### 5. Fix dashboard timeline
**File:** `tools/dev-player/src/app/components/dashboard.tsx`

- Remove `HASH_TIMEOUT_MS` constant
- Change hash buffer to group by `verifiedHashTick` instead of `tick`:
  - Skip instances that don't have `verifiedHashTick`/`verifiedHash` (hashTrackingInterval not configured)
  - Use `entry.hashes.set(inst.id, inst.stats.verifiedHash)` instead of `inst.stats.hash`
- Remove `timedOut` logic from canvas rendering
- Simplify color logic:
  - Green (`#3fb950`): `complete && verified && allSame`
  - Red (`#f85149`): `complete && verified && !allSame`
  - Grey (`#8b949e`): `!complete || !verified`
- Keep `minVerifiedTick` check: `verified = entry.tick <= minVerifiedTick`

### 6. Update game call sites
**Files:**
- `sync-test/sync-test-game/src/app/game-view/runner-provider.tsx` — `useDevBridge(runner, { hashTrackingInterval: SyncTestArena.hashReportInterval })`
- `roblox-like/roblox-like-game/src/app/game-view/runner-provider.tsx` — `useDevBridge(ctx?.runner ?? null, { hashTrackingInterval: ROBLOX_LIKE_CONFIG.hashReportInterval })`
- `circle-sumo/circle-sumo-game/src/app/game-view/runner-provider.tsx` — leave as `useDevBridge(runner)` (no hash tracking enabled in circle-sumo)

## Verification

1. `pnpm exec nx typecheck @lagless/react` — ensure protocol/hook types are correct
2. Start sync-test: server (`nx serve @lagless/sync-test-server`) + game (`nx serve @lagless/sync-test-game`) + dev-player (`nx serve @lagless/dev-player`)
3. Open dev-player, start 2 instances
4. Without latency: timeline should be green
5. With 200ms global latency: timeline should be green (no false red dots), grey dots at the trailing edge (pending verification)
6. After >3s: green dots stay green (no timeout-to-grey regression)
