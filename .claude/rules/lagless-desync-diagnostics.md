# Lagless: Desync Diagnostics

**Last Updated:** 2026-03-09

## Overview

`@lagless/desync-diagnostics` — records per-tick state hashes, rollback events, and performance timing. Streams data to dev-player via postMessage. Only active when running inside dev-player iframe (`?devBridge=true`).

## React Hook (primary integration point)

```typescript
import { useDesyncDiagnostics } from '@lagless/desync-diagnostics';

// In runner-provider — place after runner is created:
const diagnosticsOptions = useMemo(() => {
  if (!runner) return undefined;
  const wm = runner.PhysicsWorldManager;
  return {
    physicsHashFn: () => {
      const snap = wm.takeSnapshot();          // Rapier world snapshot → hash
      return getFastHash(snap.buffer);
    },
    velocityHashFn: () => {
      // hash all body velocities (FNV-like mix)
      return velocityHash;
    },
  };
}, [runner]);

useDesyncDiagnostics(runner, { ...diagnosticsOptions, enabled: diagnosticsEnabled });
```

**Options:**
- `physicsHashFn?: () => number` — called every tick. Use `wm.takeSnapshot()` + hash for physics state.
- `velocityHashFn?: () => number` — called every tick. Hash all body linvel + angvel.
- `enabled?: boolean` — gate on UI toggle (default: true). Pass `false` to disable entirely.

**When `enabled: false`:** No collector, no profiler, no postMessage overhead. Drops tick time from ~2.5ms to ~0.02ms.

## Manual Attach (non-React)

```typescript
import { attachDesyncDiagnostics } from '@lagless/desync-diagnostics';

const collector = attachDesyncDiagnostics(runner, {
  physicsHashFn: () => myPhysicsHash(),
  velocityHashFn: () => myVelocityHash(),
  bufferSize: 18000,      // default: 18000 ticks (~5min at 60fps)
  maxRollbackEvents: 1000,
});

// Later:
const stats = collector.getStats();  // DiagnosticsStats
collector.dispose();
```

## PerformanceProfiler (standalone)

```typescript
import { PerformanceProfiler } from '@lagless/desync-diagnostics';

const profiler = new PerformanceProfiler();
profiler.attach(runner);   // monkey-patches simulate(), saveSnapshot(), system.update()

const stats = profiler.getStats(); // PerformanceStats
// stats.tickTime      — total tick time (TimingStats: latest/min/max/avg)
// stats.snapshotTime  — saveSnapshot() time
// stats.overheadTime  — tickTime - simulateTime - snapshotTime (hash+signals+handlers)
// stats.systems       — per-system timing (SystemTimingStats[])

profiler.dispose();        // removes all monkey-patches
```

**Ring buffer:** 600-tick window. All stats computed from the window (not session average).

## Protocol (dev-player messages)

`useDesyncDiagnostics` automatically streams two postMessages every 30 ticks:

| Message type | Contents |
|---|---|
| `dev-bridge:diagnostics-summary` | rollbackCount, latestHash, latestPhysicsHash, latestVelocityHash, verifiedTickGapCount |
| `dev-bridge:performance-stats` | tickTime, snapshotTime, overheadTime, systems[] |

Dev-player displays these in the Diagnostics Panel (Overhead + Total (net) rows).

## Divergence Analysis

```typescript
import { analyzeDivergence, generateReport } from '@lagless/desync-diagnostics';

// Compare two collector datasets for divergence:
const analysis = analyzeDivergence(collectorA.export(), collectorB.export());

// Generate human-readable report:
const report = generateReport(collector);
```

## Key Types

```typescript
interface DiagnosticsStats {
  ticksRecorded: number;
  totalRollbacks: number;
  lastRollbackTick: number;
  verifiedTickGapCount: number;  // gaps in verifiedTick progression (desync indicator)
  latestHash: number;            // ECS mem hash
  latestPhysicsHash: number;
  latestVelocityHash: number;
}

interface TimingStats { latest: number; min: number; max: number; avg: number; }
interface PerformanceStats {
  tickTime: TimingStats;
  snapshotTime: TimingStats;
  overheadTime: TimingStats;  // diagnostics cost — subtract from tickTime for "net" time
  systems: SystemTimingStats[];
}
```

## Gotchas

- **`wm.takeSnapshot()` is expensive** (~1.7ms for a physics world). The `physicsHashFn` is called every tick — if diagnostics are enabled, this dominates tick time. Always gate with `enabled`.
- **`collectort.dispose()` is mandatory** — it removes tick handlers. `useDesyncDiagnostics` calls it automatically in the effect cleanup.
- **Not for production** — only streams when `DevBridge.isActive()` returns true. Tree-shakes safely.
