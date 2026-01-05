# `@lagless/animate`

## What it is
`@lagless/animate` is a tiny set of requestAnimationFrame helpers and easing curves for UI layers. It is intentionally small and deterministic-friendly, but it does not run inside the ECS simulation.

## Why it exists / when to use it
Use it for UI transitions, HUD effects, or short-lived visuals that sit on top of authoritative ECS state. Do not use it to drive simulation state or network decisions.

## Public API
- `animate(draw, duration, onDone, timing?)`: core RAF loop that calls `draw(progress)`
- `animatePromise(draw, duration, timing?)`: Promise wrapper for `animate`
- `AnimationCancelToken`: allows canceling an in-flight animation
- `easing`, `easingInOut`, `linear`, `TimingFunction`

## Typical usage
Circle Sumo uses it to pulse the local player outline when a round starts:

```ts
import { animatePromise } from '@lagless/animate';

await animatePromise((progress) => {
  playerOutline.scale = 1 - progress;
}, 1000);
```

## Key concepts & data flow
- `animate` computes a 0..1 progress value on each `requestAnimationFrame`.
- `TimingFunction` maps the linear time fraction to an easing curve.
- The caller owns cancellation and must stop any visuals when a component unmounts.

## Configuration and environment assumptions
- Requires `performance.now` and `requestAnimationFrame` (browser environment).
- Duration is in milliseconds.
- Tests or SSR need mocks for RAF and performance.

## Pitfalls / common mistakes
- Using animation callbacks to mutate ECS memory or send network input.
- Forgetting to cancel or ignore completion after unmount.
- Treating `duration` as frames instead of milliseconds.

## Related modules
- `libs/core` for simulation and ECS timing.
- `libs/misc` for interpolation helpers used alongside animations.
- `circle-sumo/circle-sumo-game` for real usage.
