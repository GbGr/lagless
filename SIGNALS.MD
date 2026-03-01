# Signals — Rollback-Aware Events

## Overview

Signals bridge the gap between deterministic ECS simulation and non-deterministic view/audio layers. They solve a fundamental problem: the simulation may roll back and re-simulate ticks, but you can't "un-play" a sound or "un-show" a VFX.

Signals provide three event streams:
- **Predicted** — fires immediately when the event first occurs during simulation. Use for instant feedback (play sound, show VFX).
- **Verified** — fires when `verifiedTick` reaches the event's tick, confirming the event survived all rollbacks. Use for permanent effects (update score UI, trigger analytics).
- **Cancelled** — fires when `verifiedTick` reaches the event's tick but the event is no longer present (it was rolled back). Use to undo predicted effects (stop sound, hide VFX).

## verifiedTick

`verifiedTick` is a property on `AbstractInputProvider` that represents the latest tick guaranteed to never be rolled back.

| Provider | verifiedTick | Rationale |
|---|---|---|
| `LocalInputProvider` | `simulation.tick` | No rollback possible — every tick is immediately verified |
| `ReplayInputProvider` | `simulation.tick` | Pre-recorded, deterministic, no rollback |
| `RelayInputProvider` | `max(serverTick, sTick) - 1` | Server rejects inputs where `tick < serverTick`. WebSocket ordering guarantees all inputs for ticks `< serverTick` have been received. Subtracting 1 because inputs *at* `serverTick` may still be in flight |

**RelayInputProvider** updates `_maxReceivedServerTick` from two sources:
- `handleTickInputFanout(data)` — `data.serverTick`
- `handlePong(data)` — `data.sTick`

Both are reset to 0 on `handleStateResponse` (state transfer / reconnect).

## Signal Lifecycle

### 1. Emit (in ECS system)

```typescript
@ECSSystem()
class CollisionSystem implements IECSSystem {
  constructor(private readonly _hitSignal: HitSignal) {}

  update(tick: number) {
    // When a collision is detected:
    this._hitSignal.emit(tick, { entityA: 5, entityB: 12, damage: 10 });
  }
}
```

On `emit(tick, data)`:
1. Data is added to `_pending[tick]`
2. If this `(tick, data)` pair hasn't been predicted before (checked via `_dataEquals` against `_awaitingVerification[tick]`):
   - `Predicted` fires
   - Data is added to `_awaitingVerification[tick]`
3. If the pair was already predicted (e.g., re-emit after rollback with same data): no-op — no duplicate Predicted

### 2. Verification (in simulation loop)

After each tick's systems run, `ECSSimulation` calls `signalsRegistry.onTick(inputProvider.verifiedTick)`.

`Signal._onTick(verifiedTick)` processes all ticks from `_lastVerifiedTick + 1` up to `verifiedTick`:

For each tick in the range:
- For each event in `_awaitingVerification[tick]`:
  - If a matching entry exists in `_pending[tick]` → **Verified**
  - If no match → **Cancelled**
- Tick data is cleaned up, `_lastVerifiedTick` advances

**Key behaviors:**
- **Local/Replay:** `verifiedTick = simulation.tick`, so verification happens on the same tick as emit — instant Verified, no delay.
- **Multiplayer:** `verifiedTick` lags behind `simulation.tick` by ~inputDelay ticks. Verification happens in batches as the server confirms ticks.
- **Jump-forward:** When `verifiedTick` jumps forward (burst of fanouts, or first server confirmation), all ticks in the range are processed at once.

### 3. Rollback

Before rollback, `_onBeforeRollback(toTick)` clears `_pending` for all ticks > `toTick`. `_awaitingVerification` is NOT cleared — it preserves what was predicted so verification can compare against re-simulation results.

After rollback, systems re-simulate and may re-emit the same events. If the data matches, no duplicate Predicted fires. If the data differs or the event doesn't re-emit, that difference is resolved at verification time.

## Defining a Signal

```typescript
import { Signal, ECSSignal } from '@lagless/core';

interface HitData {
  entityA: number;
  entityB: number;
  damage: number;
}

@ECSSignal()
class HitSignal extends Signal<HitData> {}
```

Register in your game's signals array:

```typescript
export const MyGameSignals = [HitSignal, GameOverSignal, CollectSignal];
```

Signals are resolved via DI — inject them into systems by constructor parameter:

```typescript
@ECSSystem()
class DamageSystem implements IECSSystem {
  constructor(private readonly _hitSignal: HitSignal) {}
  // ...
}
```

## Subscribing (View Layer)

```typescript
const hitSignal = runner.DIContainer.resolve(HitSignal);

hitSignal.Predicted.subscribe((e) => {
  playSound('hit', e.data.entityA);  // instant feedback
});

hitSignal.Verified.subscribe((e) => {
  updateScoreboard(e.data.damage);   // permanent effect
});

hitSignal.Cancelled.subscribe((e) => {
  stopSound('hit', e.data.entityA);  // undo predicted effect
});
```

## Data Comparison

Signal deduplication uses shallow object comparison (`_dataEquals`). Two data objects match if they have the same keys with the same values (`===`). Override `_dataEquals` in your signal subclass for custom comparison logic.

## Integration with Hash Verification

Hash verification also uses `verifiedTick` to avoid false-positive divergence:

1. `ECSSimulation.enableHashTracking(interval)` — stores state hashes at the given interval during simulation
2. `createHashReporter` — reports only hashes for verified ticks (looked up from hash history)
3. `AbstractHashVerificationSystem` — compares hashes only after both players' reports are for verified ticks

This ensures hash comparisons are always based on post-rollback (finalized) state, never on speculative pre-rollback state.

**Game setup:**
```typescript
// In runner-provider, after creating the runner:
runner.Simulation.enableHashTracking(hashReportInterval);

// In drainInputs callback:
const reportHash = createHashReporter(runner, {
  reportInterval: hashReportInterval,
  reportHashRpc: ReportHash,
});
inputProvider.drainInputs((addRPC) => {
  // ... game inputs ...
  reportHash(addRPC);
});
```

## Dispose

`signal.dispose()` clears all internal state (`_pending`, `_awaitingVerification`, `_lastVerifiedTick`) and removes all listeners. Called automatically by `SignalsRegistry.dispose()` during `ECSSimulation.applyExternalState` (state transfer) and `ECSRunner.dispose()`.

## Internals

**Files:**
- `libs/core/src/lib/signals/signal.ts` — `Signal<TData>` base class
- `libs/core/src/lib/signals/signals.registry.ts` — `SignalsRegistry` (forwards `verifiedTick` / rollback to all signals)
- `libs/core/src/lib/signals/event-emitter.ts` — Simple typed pub/sub
- `libs/core/src/lib/signals/signal.spec.ts` — Tests (39 tests covering local, multiplayer, rollback, edge cases)
