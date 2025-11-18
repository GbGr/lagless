# `@lagless/misc`

> Deterministic utilities shared across Lagless simulations: clocks, snapshot history, ring buffers, UUIDs, time helpers, and transforms.

## 1. Responsibility & Context

- **Primary responsibility**: Supply deterministic infrastructure (`SimulationClock`, `SnapshotHistory`, `RingBuffer`, `uuid`, etc.) used by `@lagless/core` and supporting modules.
- **Upstream dependencies**: None outside native timers (`performance.now` shimmed via `now.ts`).
- **Downstream consumers**: `@lagless/core`, animation packages, input relays, testing harnesses.
- **ECS lifecycle role**: `Utility / Simulate / Rollback`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | `SimulationClock` with `PhaseNudger` to absorb drift. |
| Authority | Works inside authoritative simulations (server or trusted client). |
| Persistence strategy | `SnapshotHistory` stores fixed-length history for rollback/resimulate. |
| Network boundary | None directly; utilities influence how authoritative state is advanced and stored. |

### 2.1 Simulation / Rollback / Resimulate

- `SimulationClock` exposes `start`, `update`, and `phaseNudger` to keep fixed frame length while allowing bounded nudges (for jitter correction).
- `SnapshotHistory` maintains deterministic storage of snapshots keyed by tick; rollback consumers fetch nearest previous snapshot.
- `RingBuffer` and `transform2d-utils` enable deterministic interpolation and component history during resimulate.

### 2.2 Networking Interaction

- No network code, but the bounded nudging and timekeeping must be consistent across authoritative and predictive nodes to keep inputs aligned.

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `SimulationClock` | class | Drives accumulated time and exposes deterministic elapsed time. | Stable |
| `PhaseNudger` | class | Accumulates micro corrections applied each frame. | Stable |
| `SnapshotHistory` | class | Fixed-size history for rollback snapshots, with nearest-tick lookup. | Stable |
| `RingBuffer<T>` | class | Deterministic queue for history or streaming samples. | Stable |
| `now()` | function | Monotonic time helper used by clock (mockable in tests). | Stable |
| `uuid()` | function | Deterministic/seeded-friendly UUID helper for ECS resources. | Experimental |
| `transform2d` utilities | functions | Translate/rotate/scale helpers used by renderers/animations. | Stable |

## 4. Preconditions

- Call `SimulationClock.start()` once before invoking `update`; calling `getElapsedTime` before start throws by design.
- `SnapshotHistory` consumers must configure capacity >= max rollback window; using a smaller size can result in fallback to initial snapshots only.

## 5. Postconditions

- After each `SimulationClock.update(dt)`, `accumulatedTime` grows deterministically and `phaseNudger` returns any consumed nudges.
- `SnapshotHistory` evicts oldest entries deterministically once capacity is exceeded.

## 6. Invariants & Constraints

- `PhaseNudger` cannot adjust beyond `maxNudgePerFrame`; exceeding this indicates upstream scheduling issues that must be documented.
- `RingBuffer` operations are FIFO; avoid peeking/mutating internal arrays directly.
- `uuid()` implementation must remain deterministic/seed-aware; avoid switching to random UUID unless constitution changes.

## 7. Safety Notes & Implementation Notes for AI Agents

- Do not reintroduce non-deterministic timers; wrap platform APIs via `now.ts` for easier mocking.
- When adjusting clock behavior, update both `@lagless/core` docs and networking assumptions (clients/servers must match).
- Ensure `SnapshotHistory` clones buffers rather than mutating shared references; always call `.set` with copies.
- Avoid leaking references from `RingBuffer` without copying if callers might mutate entries.

## 8. Example Usage

```ts
import { SimulationClock, SnapshotHistory } from '@lagless/misc';

const clock = new SimulationClock(16, 1); // 16 ms frame, 1 ms max nudge
clock.start();

const snapshots = new SnapshotHistory<ArrayBuffer>(128);

function tickLoop(dt: number) {
  clock.update(dt);
  // ... run ECS simulation
  if (tick % 2 === 0) {
    snapshots.set(tick, world.mem.exportSnapshot());
  }
}
```

## 9. Testing Guidance

- Run `nx test @lagless/misc`.
- Add tests for:
  - Clock start/update error cases (double start, elapsed before start).
  - SnapshotHistory nearest-tick logic and eviction policy.
  - RingBuffer wraparound and deterministic iteration.
  - UUID/time helpers with mocked `now`.

## 10. Change Checklist

- [ ] Timekeeping and snapshot invariants documented and enforced.
- [ ] Any changes to `now()` or UUID helpers accompanied by deterministic tests.
- [ ] Downstream READMEs updated if APIs change (core, animation, relay).
- [ ] Property-based/edge-case tests cover new utilities.

## 11. Integration Notes (Optional)

- Pair with `@lagless/core` to drive simulation/rollback.
- Animation modules can use `PhaseNudger` outputs to smooth between predicted frames.

## 12. Appendix (Optional)

- `phase-nudger.ts` documents the exact formula for distributing nudges; review before altering network jitter handling.
