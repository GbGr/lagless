# Signals — Rollback-Aware Events

## Overview

Signals are the bridge between deterministic simulation and non-deterministic view layer. They handle the complexity of rollback by providing three event streams:

- **Predicted** — fired immediately when the signal is emitted (may be rolled back later)
- **Verified** — fired when the signal survives all rollbacks (guaranteed permanent)
- **Cancelled** — fired when a previously predicted signal is rolled back (undo)

## Why Three Streams?

In a rollback-based multiplayer game:
1. Player shoots → system emits signal → **Predicted**: play gunshot sound
2. Network delivers remote player's dodge input → rollback to before the shot
3. Re-simulation: shot never happened → **Cancelled**: stop gunshot sound
4. OR: re-simulation confirms the shot → **Verified**: add score, show hit marker

## Defining a Signal

Signals are classes decorated with `@ECSSignal()` that extend `Signal<TData>`:

```typescript
// In signals/index.ts:
import { ECSSignal, Signal } from '@lagless/core';

@ECSSignal()
export class ScoreSignal extends Signal<{ slot: number; points: number }> {}

@ECSSignal()
export class DeathSignal extends Signal<{ entityId: number; killerSlot: number }> {}

@ECSSignal()
export class ExplosionSignal extends Signal<{ x: number; y: number; radius: number }> {}
```

The generic type `TData` defines the event payload. It must be a plain object with primitive values (for shallow comparison during rollback verification).

## Emitting Signals in Systems

```typescript
@ECSSystem()
export class CombatSystem implements IECSSystem {
  constructor(
    private readonly _scoreSignal: ScoreSignal,
    private readonly _deathSignal: DeathSignal,
  ) {}

  update(tick: number): void {
    // When something happens:
    if (playerDied) {
      this._deathSignal.emit(tick, { entityId: entity, killerSlot: killerSlot });
      this._scoreSignal.emit(tick, { slot: killerSlot, points: 100 });
    }
  }
}
```

**Key:** `emit(tick, data)` — the tick is used for rollback tracking.

## Subscribing in View Layer

```typescript
// In a React component or game-view setup:
useEffect(() => {
  const sub1 = scoreSignal.Predicted.subscribe(event => {
    // Instant feedback — may be rolled back
    showFloatingText(`+${event.data.points}`);
  });

  const sub2 = scoreSignal.Verified.subscribe(event => {
    // Permanent — survived all rollbacks
    updateScoreboard(event.data.slot, event.data.points);
  });

  const sub3 = scoreSignal.Cancelled.subscribe(event => {
    // Undo the prediction
    removeFloatingText();
  });

  return () => {
    sub1.unsubscribe();
    sub2.unsubscribe();
    sub3.unsubscribe();
  };
}, []);
```

## Verification Mechanism

Signals are verified via `verifiedTick` — the latest tick guaranteed to never be rolled back.

| Input Provider | verifiedTick | Meaning |
|---------------|-------------|---------|
| `LocalInputProvider` | `= simulation.tick` | Immediate — no rollback possible in single-player |
| `ReplayInputProvider` | `= simulation.tick` | Immediate — replaying recorded inputs |
| `RelayInputProvider` | `= max(serverTick) - 1` | Server-confirmed, hard guarantee |

Each tick, `SignalsRegistry.onTick(verifiedTick)` processes:
1. All ticks from `_lastVerifiedTick + 1` to `verifiedTick`
2. Compares `_awaitingVerification` (predicted) against `_pending` (actual after re-simulation)
3. Matching signals → **Verified** stream
4. Missing signals (were predicted but not re-emitted) → **Cancelled** stream

## Use Case Guide

| Scenario | Predicted | Verified | Cancelled |
|----------|----------|---------|-----------|
| Sound effects | Play sound | — | Stop/fade sound |
| Score display | Show floating +100 | Update scoreboard | Remove floating text |
| Particle effects | Spawn particles | — | Fade particles early |
| Death/respawn | Play death animation | Remove entity from UI | Reverse death animation |
| Chat/notifications | — | Show message | — |
| Achievement | — | Award achievement | — |

**Rule of thumb:**
- Use **Predicted** for immediate sensory feedback (sounds, particles, animations)
- Use **Verified** for permanent game state changes (score, achievements, chat)
- Use **Cancelled** to undo Predicted effects when rollback happens

## Signal Registration

Signals must be registered in the arena config alongside systems:

```typescript
// In arena.ts:
import { ScoreSignal, DeathSignal } from './signals/index.js';

export const arenaConfig = {
  // ...
  signals: [ScoreSignal, DeathSignal],
};
```

## Deduplication

Signals use shallow object comparison (`_dataEquals`) for deduplication. If the same signal with identical data is emitted at the same tick across prediction and re-simulation, it's treated as the same event (Verified, not double-emitted).

This means signal data should contain only primitive values, not references. Object identity is compared field-by-field.

## Common Patterns

### Sound Effect with Rollback Protection

```typescript
// Predicted: play sound immediately
explosionSignal.Predicted.subscribe(e => {
  const sound = playExplosionSound(e.data.x, e.data.y);
  pendingSounds.set(e.tick, sound);
});

// Cancelled: stop sound if rolled back
explosionSignal.Cancelled.subscribe(e => {
  const sound = pendingSounds.get(e.tick);
  if (sound) sound.stop();
  pendingSounds.delete(e.tick);
});

// Verified: cleanup tracking (sound already playing)
explosionSignal.Verified.subscribe(e => {
  pendingSounds.delete(e.tick);
});
```

### Score with Verified-Only Update

```typescript
// Only update scoreboard on verified events
scoreSignal.Verified.subscribe(e => {
  setScores(prev => ({
    ...prev,
    [e.data.slot]: (prev[e.data.slot] ?? 0) + e.data.points,
  }));
});
```
