# `@lagless/misc`

## What it is
`@lagless/misc` is a grab bag of deterministic utilities used by Lagless simulations and renderers: clocks, snapshot history, ring buffers, UUIDs, and transform interpolation helpers.

## Why it exists / when to use it
Use it for timekeeping, rollback history, and render interpolation that must stay aligned with ECS ticks. It is shared infrastructure for `@lagless/core` and for UI layers that present ECS state.

## Public API
- `SimulationClock`, `PhaseNudger`: fixed-step clock with bounded jitter correction
- `SnapshotHistory`: fixed-size snapshot storage for rollback
- `RingBuffer<T>`: deterministic FIFO buffer for time-series data
- `UUID`: UUID helpers (including masked UUIDs for bots)
- `now()`: monotonic time helper
- `interpolateTransform2d*`: transform interpolation helpers for render space

## Typical usage
Circle Sumo interpolates ECS transforms into render space each frame:

```ts
import { interpolateTransform2dCursorToRef } from '@lagless/misc';

const cursor = transform2d.getCursor(entity);
interpolateTransform2dCursorToRef(cursor, simulation.interpolationFactor, containerRef.current);
```

## Key concepts & data flow
- `SimulationClock` accumulates elapsed time and hands out fixed-step updates.
- `SnapshotHistory` stores snapshots by tick and provides nearest-tick lookup for rollback.
- Transform interpolation helpers convert ECS cursors into render-space positions and rotations.

## Configuration and environment assumptions
- `SimulationClock.start()` must be called before reading elapsed time.
- `now()` uses `performance.now` when available; tests can mock it.
- UUID helpers use platform crypto when available and fall back to Math.random.

## Pitfalls / common mistakes
- Forgetting to call `SimulationClock.start()` before `update()`.
- Setting snapshot history smaller than the maximum rollback window.
- Using transform interpolation outputs as authoritative simulation data.

## Related modules
- `libs/core` consumes `SimulationClock` and `SnapshotHistory`.
- `circle-sumo/circle-sumo-game` uses transform interpolation helpers.
- `circle-sumo/circle-sumo-backend` uses `UUID` for bot IDs.
