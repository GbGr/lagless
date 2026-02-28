# Plan: Add `verifiedTick` to InputProviders and Use It for Signal Verification + Hash Reporting

## Context

Currently, `Signal.Verified` uses a fixed heuristic delay (`maxInputDelayTick`, default 12 ticks) to decide when events are "safe" from rollback. This is a guess — rollback can still happen for a "verified" tick if network conditions are worse than expected. Hash reporting (`createHashReporter`) computes hashes at the current tick, which may be on a pre-rollback timeline, causing false-positive divergence in dev-tools.

**The server already provides confirmation**: every `TickInputFanout` includes `serverTick`, and every `Pong` includes `sTick`. The server rejects inputs where `tick < serverTick` (TooOld). WebSocket guarantees message ordering. So when the client receives a message with `serverTick = S`, all inputs for ticks `< S` have already been received — those ticks can never be rolled back to. `verifiedTick = max(all received serverTick/sTick) - 1` is a **hard guarantee**.

## Changes

### 1. Add `verifiedTick` to `AbstractInputProvider`

**File:** `libs/core/src/lib/input/abstract-input-provider.ts`

Add abstract getter:
```typescript
public abstract get verifiedTick(): number;
```

### 2. Implement `verifiedTick` in each InputProvider

**File:** `libs/core/src/lib/input/local-input-provider.ts`
```typescript
public get verifiedTick(): number {
  return this._simulation?.tick ?? -1;
}
```
No rollback — every tick is immediately verified.

**File:** `libs/core/src/lib/input/replay-input-provider.ts`
```typescript
public get verifiedTick(): number {
  return this._simulation?.tick ?? -1;
}
```
Same as Local — replay is deterministic, no rollback.

**File:** `libs/relay-client/src/lib/relay-input-provider.ts`
- Add `private _maxReceivedServerTick = 0;`
- Add getter:
  ```typescript
  public get verifiedTick(): number {
    return this._maxReceivedServerTick > 0 ? this._maxReceivedServerTick - 1 : -1;
  }
  ```
- In `handleTickInputFanout`: update `_maxReceivedServerTick = Math.max(this._maxReceivedServerTick, data.serverTick)`
- In `handlePong`: update `_maxReceivedServerTick = Math.max(this._maxReceivedServerTick, data.sTick)`
- In `handleStateResponse`: reset `_maxReceivedServerTick = 0`

### 3. Change Signal verification to use `verifiedTick`

**File:** `libs/core/src/lib/signals/signal.ts`
- Remove `_maxInputDelayTick` field (keep `_ECSConfig` injection for subclasses)
- Add `private _lastVerifiedTick = -1;`
- Change `_onTick(currentTick)` → `_onTick(verifiedTick)`:
  ```typescript
  public _onTick(verifiedTick: number): void {
    while (this._lastVerifiedTick < verifiedTick) {
      const nextTick = this._lastVerifiedTick + 1;

      const awaiting = this._awaitingVerification.get(nextTick);
      if (awaiting && awaiting.length > 0) {
        const pending = this._pending.get(nextTick) ?? [];
        const pendingMatched = new Array(pending.length).fill(false);

        for (const awaitingData of awaiting) {
          let matchIdx = -1;
          for (let i = 0; i < pending.length; i++) {
            if (!pendingMatched[i] && this._dataEquals(pending[i], awaitingData)) {
              matchIdx = i;
              break;
            }
          }
          if (matchIdx >= 0) {
            pendingMatched[matchIdx] = true;
            this.Verified.emit({ tick: nextTick, data: awaitingData });
          } else {
            this.Cancelled.emit({ tick: nextTick, data: awaitingData });
          }
        }
      }
      this._cleanupTick(nextTick);
      this._lastVerifiedTick = nextTick;
    }
  }
  ```
- In `dispose()`: add `this._lastVerifiedTick = -1;`

**File:** `libs/core/src/lib/signals/signals.registry.ts`
- Change `onTick(currentTick)` → `onTick(verifiedTick)`, pass through to signals

### 4. Change ECSSimulation to pass `verifiedTick` to signals

**File:** `libs/core/src/lib/ecs-simulation.ts`
- In `simulationTicks`, change:
  ```typescript
  // Before:
  this._signalsRegistry.onTick(currentTick);
  // After:
  this._signalsRegistry.onTick(this._inputProvider.verifiedTick);
  ```
- Expose `inputProvider` getter (for hash reporter and dev-bridge):
  ```typescript
  public get inputProvider(): AbstractInputProvider { return this._inputProvider; }
  ```

### 5. Add hash tracking to ECSSimulation

**File:** `libs/core/src/lib/ecs-simulation.ts`
- Add:
  ```typescript
  private _hashTrackingInterval = 0;
  private _hashHistory = new Map<number, number>();

  public enableHashTracking(interval: number): void {
    this._hashTrackingInterval = interval;
  }

  public getHashAtTick(tick: number): number | undefined {
    return this._hashHistory.get(tick);
  }
  ```
- In `simulationTicks`, after `simulate(currentTick)` and before snapshot:
  ```typescript
  if (this._hashTrackingInterval > 0 && currentTick % this._hashTrackingInterval === 0) {
    this._hashHistory.set(currentTick, this.mem.getHash());
  }
  ```
  Note: `getHash()` iterates byte-by-byte (O(N) on ArrayBuffer size), so only call at intervals, not every tick.
- In `applyExternalState`: clear `_hashHistory`
- Prune old entries periodically (e.g., delete ticks < verifiedTick - buffer)

### 6. Change `createHashReporter` to report only verified hashes

**File:** `libs/core/src/lib/hash-verification/create-hash-reporter.ts`
- Instead of computing hash at currentTick, look up verified tick's hash from simulation:
  ```typescript
  return (addRPC: AddRPCFn) => {
    const verifiedTick = runner.Simulation.inputProvider.verifiedTick;
    const latestReportTick = Math.floor(verifiedTick / config.reportInterval) * config.reportInterval;
    if (latestReportTick > lastReportedTick && latestReportTick > 0) {
      const hash = runner.Simulation.getHashAtTick(latestReportTick);
      if (hash !== undefined) {
        lastReportedTick = latestReportTick;
        addRPC(config.reportHashRpc, { hash, atTick: latestReportTick });
      }
    }
  };
  ```
- Game code needs to call `runner.Simulation.enableHashTracking(reportInterval)` before simulation starts

### 7. Change AbstractHashVerificationSystem to use `verifiedTick`

**File:** `libs/core/src/lib/hash-verification/abstract-hash-verification.system.ts`
- Replace `maxInputDelayTick * 2` delay with `verifiedTick`:
  ```typescript
  // Before:
  const confirmationDelay = this._ECSConfig.maxInputDelayTick * 2;
  if (tick - safeA.lastReportedHashTick < confirmationDelay) continue;

  // After:
  if (safeA.lastReportedHashTick > this._InputProvider.verifiedTick) continue;
  ```

### 8. Update dev-bridge to send `verifiedTick`

**File:** `libs/react/src/lib/dev-bridge/protocol.ts`
- Add `verifiedTick: number` to `DevBridgeStatsMessage`

**File:** `libs/react/src/lib/dev-bridge/use-dev-bridge.ts`
- Send `verifiedTick` in stats:
  ```typescript
  verifiedTick: relayProvider?.verifiedTick ?? sim.tick,
  ```

**File:** `tools/dev-player/src/app/components/dashboard.tsx`
- Use `verifiedTick` in hash timeline — only show green/red dots for ticks where all instances have verifiedTick >= that tick

### 9. Update game integration

**Files:**
- `sync-test/sync-test-game/src/app/game-view/runner-provider.tsx`
- `roblox-like/roblox-like-game/src/app/game-view/runner-provider.tsx`
- `circle-sumo/circle-sumo-game/src/app/game-view/runner-provider.tsx`

Add `runner.Simulation.enableHashTracking(hashReportInterval)` after creating the runner.

### 10. Update exports

**File:** `libs/core/src/index.ts` (or relevant barrel)
- Ensure `verifiedTick` is accessible from the public API

## Key Design Decisions

1. **`verifiedTick` is abstract on `AbstractInputProvider`** — each provider implements it. Local/Replay = `simulation.tick` (immediate). Relay = `maxServerTick - 1` (server-confirmed).

2. **Signal._onTick processes ranges** — when verifiedTick jumps forward (burst of fanouts, or Local provider), all ticks in the range are processed. This replaces the fixed 1-tick-per-call behavior.

3. **Hash history lives outside ArrayBuffer** — stored as a JS Map on ECSSimulation, not in the deterministic buffer. Rollback re-simulates and overwrites stale hashes naturally. Only computed at report intervals to avoid performance impact.

4. **Behavioral improvement for Local/Replay**: signals verify immediately instead of waiting 12 ticks. Better UX for single-player.

## Files to Modify (summary)

| File | Change |
|------|--------|
| `libs/core/src/lib/input/abstract-input-provider.ts` | Add `abstract get verifiedTick()` |
| `libs/core/src/lib/input/local-input-provider.ts` | Implement `verifiedTick = simulation.tick` |
| `libs/core/src/lib/input/replay-input-provider.ts` | Implement `verifiedTick = simulation.tick` |
| `libs/relay-client/src/lib/relay-input-provider.ts` | Track maxServerTick, implement `verifiedTick` |
| `libs/core/src/lib/signals/signal.ts` | Use verifiedTick in `_onTick`, add `_lastVerifiedTick` |
| `libs/core/src/lib/signals/signals.registry.ts` | Pass `verifiedTick` to signals |
| `libs/core/src/lib/ecs-simulation.ts` | Pass verifiedTick to signals, add hash tracking, expose inputProvider |
| `libs/core/src/lib/hash-verification/create-hash-reporter.ts` | Report hashes for verified ticks only |
| `libs/core/src/lib/hash-verification/abstract-hash-verification.system.ts` | Use verifiedTick for comparison |
| `libs/react/src/lib/dev-bridge/protocol.ts` | Add `verifiedTick` field |
| `libs/react/src/lib/dev-bridge/use-dev-bridge.ts` | Send `verifiedTick` in stats |
| `tools/dev-player/src/app/components/dashboard.tsx` | Use verifiedTick for hash timeline |
| Game runner-providers (3 files) | Call `enableHashTracking()` |

## Verification

1. **Unit tests**: Run existing signal tests — `npx vitest run --project=@lagless/core`. Update any tests that mock `_onTick(currentTick)` to pass `verifiedTick`.
2. **Relay tests**: If relay-client has tests, verify RelayInputProvider.verifiedTick updates correctly on fanout/pong.
3. **Manual test**: Run sync-test (server + 2 clients). Open dev-player. Verify:
   - Hash timeline shows only verified hashes
   - No false-positive divergence
   - Signals still fire correctly (Predicted immediately, Verified after server confirmation)
4. **Local test**: Run circle-sumo single-player. Verify signals verify immediately (no 12-tick delay).
