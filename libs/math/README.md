# `@lagless/math`

## What it is
`@lagless/math` wraps deterministic math operations and vector utilities used across Lagless simulations and renderers. It provides a consistent math surface that avoids non-deterministic browser math where needed.

## Why it exists / when to use it
Use it for any math that affects simulation or visualization tied to ECS state. It ensures consistent results across clients and servers.

## Public API
- `MathOps`: deterministic math helpers (`sin`, `cos`, `atan2`, `sqrt`, `lerp`, `clamp`, `normalizeAngle`)
- `Vector2` and `IVector2Like`: 2D vector operations
- `VECTOR2_BUFFER_1..10`: reusable buffers to avoid allocations

## Typical usage
Circle Sumo computes a movement direction using deterministic math helpers:

```ts
import { MathOps, Vector2 } from '@lagless/math';

const from = new Vector2();
const to = new Vector2();
const angle = MathOps.atan2(to.y - from.y, to.x - from.x);
```

## Key concepts & data flow
- `MathOps.init()` loads deterministic math primitives; it must be called before using `sin`, `cos`, or `atan2`.
- `Vector2` methods are allocation-friendly and designed for reuse with buffers.
- Vector buffers are mutable and intended for temporary calculations only.

## Configuration and environment assumptions
- Deterministic math depends on `@lagless/deterministic-math` initialization.
- Consumers should await `MathOps.init()` during app or server startup.

## Pitfalls / common mistakes
- Using `Math.sin` or `Math.cos` in simulation code instead of `MathOps`.
- Mutating `Vector2.ZERO` or other static constants.
- Allocating new vectors in tight loops instead of reusing buffers.

## Related modules
- `libs/core` for deterministic ECS simulation.
- `libs/misc` for interpolation helpers that use `MathOps`.
- `circle-sumo/circle-sumo-simulation` and `circle-sumo/circle-sumo-game` for real usage.
