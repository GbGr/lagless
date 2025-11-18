# `@lagless/animate`

> Deterministic-friendly animation helpers for UI layers sitting on top of Lagless ECS simulations.

## 1. Responsibility & Context

- **Primary responsibility**: Provide simple easing functions and `requestAnimationFrame` wrappers (`animate`, `animatePromise`) to animate UI transitions or overlays.
- **Upstream dependencies**: Browser runtime APIs (`performance.now`, `requestAnimationFrame`).
- **Downstream consumers**: Frontend apps (e.g., `@lagless/circle-sumo-frontend`) rendering deterministic states between ECS ticks.
- **ECS lifecycle role**: `Render / Utility`

## 2. Architecture Role

| Aspect | Details |
| --- | --- |
| Simulation tick source | None; animations are decoupled from ECS clocks though they can use tick deltas for duration |
| Authority | Purely client-side; must not mutate authoritative ECS state |
| Persistence strategy | None; animations run and resolve promises/callbacks |
| Network boundary | None |

### 2.1 Simulation / Rollback / Resimulate

- Animations should be cancelled/restarted whenever rollback/resimulation occurs to avoid displaying stale states.
- Consumers should base animation durations on deterministic tick lengths (e.g., `SimulationClock` leftover) for smoother interpolation.

### 2.2 Networking Interaction

- None; ensure animations never trigger network side effects.

## 3. Public API

| Export | Type | Description | Stability |
| --- | --- | --- | --- |
| `animate(draw, duration, onDone, timing?)` | function | Core loop calling `draw(progress)` per RAF frame. | Stable |
| `animatePromise(draw, duration, timing?)` | function | Promise wrapper around `animate`. | Stable |
| `easing`, `easingInOut`, `linear`, `makeEaseInOut` | functions | Timing utilities for animation curves. | Stable |

## 4. Preconditions

- Must run in an environment with `performance.now` + `requestAnimationFrame` (browser). For SSR/unit tests, mock these functions.
- Callers should own cancellation logic (e.g., ignore results if component unmounts).

## 5. Postconditions

- `draw` receives normalized progress (0→1); after completion, `onAnimationDone` or promise resolver fires exactly once.
- Timing function outputs are clamped to `[0,1]`.

## 6. Invariants & Constraints

- Animations are purely visual; never mutate ECS memory or dispatch commands.
- Keep timing functions pure; do not capture external state.

## 7. Safety Notes & Implementation Notes for AI Agents

- When adding new timing functions, document intended use cases and ensure they remain deterministic for identical inputs.
- Provide cancellation patterns (e.g., return handle with `cancel()`).
- Avoid direct DOM manipulation; integrate with React/Pixi layers only.

## 8. Example Usage

```ts
import { animatePromise, easingInOut } from '@lagless/animate';

await animatePromise((progress) => {
  sprite.alpha = progress;
}, 300, easingInOut);
```

## 9. Testing Guidance

- In Vitest or Jest, stub `performance.now`/`requestAnimationFrame` to deterministic values and assert `draw` is called expected number of times.
- Add unit tests when introducing new timing curves.

## 10. Change Checklist

- [ ] Document new timing functions or animation helpers.
- [ ] Update consumer READMEs if API surface changes.
- [ ] Ensure tests/mocks cover added functionality.

## 11. Integration Notes (Optional)

- Pair with ECS interpolation logic by using leftover time from `SimulationClock` to drive progress.

## 12. Appendix (Optional)

- Consider adding cancellation handles or ties into `AbortSignal` if future requirements demand.
