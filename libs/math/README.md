# `@lagless/math`

> Deterministic math helpers and vector utilities used by the Lagless ECS runtime and simulations.

## 1. Responsibility & Context

- **Primary responsibility**: Provide deterministically computed math primitives (trig, lerp, vector ops) backed by shared lookup tables.
- **Upstream dependencies**: `@lagless/deterministic-math` for low-level trig functions.
- **Downstream consumers**: `@lagless/core`, gameplay systems, animation helpers, physics/force calculations.
- **ECS lifecycle role**: `Utility`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | N/A (helpers invoked inside systems) |
| Authority | Not authoritative itself; ensures deterministic math for authoritative systems |
| Persistence strategy | Stateless functions + optional vector buffers (no snapshots) |
| Network boundary | None directly; ensures consistent math on client/server |

### 2.1 Simulation / Rollback / Resimulate

- Deterministic math ensures identical results during rollback/resimulation by replacing `Math.sin/cos/...` with LUT-backed functions.
- Vector buffers avoid allocation churn so state snapshots remain predictable.
- Any system using these helpers must call `MathOps.init()` once before simulation ticks to seed deterministic math tables.

### 2.2 Networking Interaction

- No network IO; its role is to guarantee that client and server predictions use identical math operations so corrections are minimal.

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `MathOps` | class | Static deterministic math utilities (clamp, trig, lerpAngle, smoothRotate). | Stable |
| `Vector2` / `MutableVector2` | classes | Deterministic 2D vector operations for systems. | Stable |
| `vector2Buffers` helpers | functions | Pool/reuse vector instances to avoid GC. | Stable |

## 4. Preconditions

- `MathOps.init()` must be awaited before using trig functions to ensure LUT data is loaded.
- Callers must supply inputs in radians for trig helpers (matching `dm_*` functions) unless otherwise documented.

## 5. Postconditions

- Math helpers always return deterministic values given the same inputs; no hidden global state is mutated.
- Vector buffer helpers return pooled objects that should be released/returned according to their API to keep reuse deterministic.

## 6. Invariants & Constraints

- Never bypass deterministic helpers with native `Math` APIs for gameplay-critical calculations.
- Avoid mutating shared buffers outside their documented lifecycle; stale references can break rollback determinism.
- When extending `MathOps`, implement functions using deterministic primitives only (no randomness).

## 7. Safety Notes & Implementation Notes for AI Agents

- Do not introduce `Date`, `performance`, or `Math.random` usage here.
- When adding vector helpers, keep operations pure and stateless; use pooling utilities if allocations matter.
- Document angle units (radians vs degrees) explicitly to avoid subtle divergence between modules.
- Ensure new helpers can be executed on both client and server runtimes (no DOM APIs).

## 8. Example Usage

```ts
import { MathOps, Vector2 } from '@lagless/math';

await MathOps.init();

const direction = new Vector2(1, 0);
const targetAngle = MathOps.atan2(direction.y, direction.x);
const smoothed = MathOps.smoothRotate(currentAngle, targetAngle, rotationSpeedPerTick);
```

## 9. Testing Guidance

- Run `nx test @lagless/math`.
- Add deterministic tests whenever new helpers are introduced:
  - Property-style: `MathOps.lerp` should equal expected arithmetic interpolation.
  - Edge cases: `smoothRotate` respects wrap-around at ±π.
  - Buffer pooling: ensure borrow/return produces deterministic iteration order.

## 10. Change Checklist

- [ ] New helpers rely exclusively on deterministic primitives.
- [ ] README sections updated with new APIs, invariants, or initialization steps.
- [ ] Tests cover edge cases (angle wrapping, normalization, pooling).
- [ ] Downstream README references updated if APIs change (e.g., core/animation docs).

## 11. Integration Notes (Optional)

- Pair with `@lagless/core` systems for movement/force calculations; document rotation smoothing per system.
- Animation modules can reuse `MathOps.lerp`/`lerpAngle` for deterministic tweening.

## 12. Appendix (Optional)

- Vector buffer helpers live under `libs/math/src/lib/vector2-buffers.ts` and expose typed arrays for deterministic SIMD-like loops.
