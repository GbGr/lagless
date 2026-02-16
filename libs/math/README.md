# @lagless/math

## 1. Responsibility & Context

Provides deterministic mathematical operations and 2D vector algebra for the Lagless ECS framework. Wraps the `@lagless/deterministic-math` WASM module to guarantee identical floating-point results across all platforms (browsers, Node.js, operating systems), which is essential for rollback netcode where clients must simulate identically. All trigonometric functions (`sin`, `cos`, `atan2`) and square root operations use the WASM implementation to avoid platform-specific IEEE 754 edge cases.

## 2. Architecture Role

**Foundation layer** — sits directly above `@lagless/deterministic-math` and provides math primitives used throughout the stack. No dependencies on other Lagless libraries.

**Downstream consumers:**
- `@lagless/core` — ECS systems use `MathOps` and `Vector2` for physics, movement, and collision calculations
- `circle-sumo-simulation` — game logic relies on deterministic vector operations for player movement and collisions

**Upstream dependencies:**
- `@lagless/deterministic-math` — WASM module providing `dm_sin`, `dm_cos`, `dm_atan2`, `dm_sqrt`

## 3. Public API

### MathOps

Static utility class wrapping WASM-based deterministic math operations:

- `MathOps.init(): Promise<void>` — **MUST be called before any other operations.** Initializes the WASM module asynchronously.
- `MathOps.PI`, `MathOps.PI_2`, `MathOps.PI_HALF` — Mathematical constants (π, 2π, π/2)
- `MathOps.Deg2Rad`, `MathOps.Rad2Deg` — Angle conversion constants
- `MathOps.sin(angle: number): number` — Deterministic sine (radians)
- `MathOps.cos(angle: number): number` — Deterministic cosine (radians)
- `MathOps.atan2(y: number, x: number): number` — Deterministic arctangent2 (radians)
- `MathOps.sqrt(value: number): number` — Deterministic square root
- `MathOps.clamp(value: number, min: number, max: number): number` — Clamp value to range
- `MathOps.clamp01(value: number): number` — Clamp to [0, 1]
- `MathOps.lerp(a: number, b: number, t: number): number` — Linear interpolation
- `MathOps.lerpAngle(a: number, b: number, t: number): number` — Angle interpolation (shortest path around circle)
- `MathOps.normalizeAngle(angle: number): number` — Normalize angle to (-π, π]
- `MathOps.smoothRotate(rotation: number, targetRotation: number, rotationSpeed: number): number` — Smooth rotation with speed limit
- `MathOps.repeat(t: number, length: number): number` — Wrap value to [0, length)

### Vector2

2D vector class with comprehensive algebra operations. All operations come in three flavors:

- **`...InPlace()`** — Mutates `this` and returns it (zero allocation)
- **`...ToRef(ref)`** — Writes result to `ref` parameter and returns it (zero allocation)
- **`...ToNew()`** — Allocates and returns a new `Vector2` instance

**Constructor & Constants:**
- `new Vector2(x?: number, y?: number)` — Create vector (defaults to 0, 0)
- `Vector2.ZERO`, `Vector2.ONE`, `Vector2.UNIT_X`, `Vector2.UNIT_Y` — Static readonly constants
- `Vector2.UP`, `Vector2.DOWN`, `Vector2.LEFT`, `Vector2.RIGHT` — Directional constants
- `Vector2.EPSILON = 1e-8` — Epsilon for safe normalization/comparisons

**Basic Operations:**
- `setInPlace(x, y)`, `copyFrom(other)`, `copyToRef(ref)`, `clone()` — Setters and copying
- `addToNew(other)`, `addToRef(other, ref)`, `addInPlace(other)` — Addition
- `subToNew(other)`, `subToRef(other, ref)`, `subInPlace(other)` — Subtraction
- `mulToNew(other)`, `mulToRef(other, ref)`, `mulInPlace(other)` — Component-wise multiply
- `divToNew(other)`, `divToRef(other, ref)`, `divInPlace(other)` — Component-wise divide
- `scaleToNew(s)`, `scaleToRef(s, ref)`, `scaleInPlace(s)` — Scalar multiplication
- `negateToNew()`, `negateToRef(ref)`, `negateInPlace()` — Negate
- `absToNew()`, `absToRef(ref)`, `absInPlace()` — Absolute value (component-wise)

**Min/Max/Clamp:**
- `minToRef(other, ref)`, `minInPlace(other)` — Component-wise minimum
- `maxToRef(other, ref)`, `maxInPlace(other)` — Component-wise maximum
- `clampToNew(min, max)`, `clampToRef(min, max, ref)`, `clampInPlace(min, max)` — Component-wise clamp

**Metrics:**
- `lengthSquared(): number`, `length(): number` — Magnitude (uses `MathOps.sqrt`)
- `distanceSquaredTo(other): number`, `distanceTo(other): number` — Distance to another vector
- `dot(other): number` — Dot product
- `crossZ(other): number` — 2D cross product (Z component)

**Normalization:**
- `normalizedToNew()`, `normalizeToRef(ref)`, `normalizeInPlace()` — Normalize to unit length (returns zero vector if length < EPSILON)

**Angles & Rotation:**
- `angle(): number` — Angle from +X axis in radians (-π, π]
- `angleTo(other): number` — Smallest signed angle to another vector
- `rotatedToNew(angle)`, `rotateToRef(angle, ref)`, `rotateInPlace(angle)` — Rotate around origin
- `rotatedAroundToNew(pivot, angle)`, `rotateAroundToRef(pivot, angle, ref)`, `rotateAroundInPlace(pivot, angle)` — Rotate around pivot
- `rotateTowardsInPlace(target, maxDelta)` — Rotate towards target by at most maxDelta radians

**Projection & Reflection:**
- `projectOntoToNew(normal)`, `projectOntoToRef(normal, ref)`, `projectOntoInPlace(normal)` — Project onto normal
- `reflectToNew(normal)`, `reflectToRef(normal, ref)`, `reflectInPlace(normal)` — Reflect across normal

**Interpolation:**
- `lerpToNew(to, t)`, `lerpToRef(to, t, ref)`, `lerpInPlace(to, t)` — Linear interpolation
- `nlerpToNew(to, t)`, `nlerpToRef(to, t, ref)`, `nlerpInPlace(to, t)` — Normalized lerp (useful for directions)

**Perpendiculars:**
- `perpLeftToNew()`, `perpLeftToRef(ref)`, `perpLeftInPlace()` — Left perpendicular (+90° rotation)
- `perpRightToNew()`, `perpRightToRef(ref)`, `perpRightInPlace()` — Right perpendicular (-90° rotation)

**Length Clamping:**
- `clampLengthToNew(minLen, maxLen)`, `clampLengthToRef(minLen, maxLen, ref)`, `clampLengthInPlace(minLen, maxLen)` — Clamp vector length

**Equality:**
- `equals(other): boolean` — Exact equality
- `approxEquals(other, eps?): boolean` — Approximate equality (default epsilon = 1e-8)

**Serialization:**
- `toArray(out?, offset?): number[]` — Convert to array `[x, y]`
- `Vector2.fromArray(arr, offset?): Vector2` — Create from array
- `Vector2.fromArrayToRef(arr, ref, offset?): Vector2` — Read from array into ref

**Construction Helpers:**
- `Vector2.fromAngle(angle, length?): Vector2` — Create vector from angle and length
- `Vector2.fromAngleToRef(angle, ref, length?): Vector2` — Create from angle into ref
- `Vector2.minToRef(a, b, ref)` — Component-wise min of two vectors
- `Vector2.maxToRef(a, b, ref)` — Component-wise max of two vectors

### IVector2Like

Interface for objects with `x` and `y` number properties. Used for duck-typed vector compatibility.

### Vector2 Buffers

Pre-allocated `Vector2` instances for temporary calculations (avoids allocation in hot loops):

- `VECTOR2_BUFFER_1` through `VECTOR2_BUFFER_10` — Reusable vector instances

## 4. Preconditions

- **`MathOps.init()` MUST be called before using any `MathOps` functions or `Vector2` operations that depend on trigonometry/sqrt.** This initializes the WASM module. Failure to call this results in undefined behavior or crashes.
- Async initialization: Call `await MathOps.init()` during application startup before the ECS runner starts.

## 5. Postconditions

- After `MathOps.init()` completes, all math operations produce deterministic results across platforms.
- `Vector2` operations using `InPlace` and `ToRef` variants produce zero garbage (no allocations).
- All angle operations work in radians (not degrees).

## 6. Invariants & Constraints

- **Determinism guarantee:** `MathOps` functions produce bit-identical results on all platforms (Windows/Mac/Linux, Chrome/Firefox/Safari/Node.js). This is critical for rollback netcode.
- **Radians-only:** All angle parameters and return values are in radians. Use `MathOps.Deg2Rad` / `MathOps.Rad2Deg` for conversion.
- **Epsilon safety:** `Vector2` normalization and division operations check for near-zero lengths using `Vector2.EPSILON = 1e-8` to avoid NaN/Infinity.
- **Static readonly constants:** `Vector2.ZERO`, `Vector2.ONE`, etc. are readonly and MUST NOT be mutated. They are shared instances.
- **InPlace/ToRef/ToNew pattern:** Methods ending in `InPlace` mutate `this`, methods ending in `ToRef` mutate a reference parameter, methods ending in `ToNew` allocate a new instance. Never mix expectations.

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT use `Math.sin`, `Math.cos`, `Math.atan2`, `Math.sqrt` directly** — These produce platform-dependent results. Always use `MathOps.sin`, `MathOps.cos`, `MathOps.atan2`, `MathOps.sqrt`.
- **DO NOT mutate static readonly constants** (`Vector2.ZERO`, `Vector2.ONE`, etc.) — These are shared instances. Clone before mutating.
- **DO NOT forget to call `MathOps.init()`** — Calling WASM functions before initialization causes crashes.
- **DO NOT mix radians and degrees** — All angle operations use radians. Convert explicitly if needed.
- **DO NOT allocate `Vector2` in hot loops** — Use `VECTOR2_BUFFER_*` constants or `...ToRef()` methods for zero-allocation operations.
- **DO NOT use `Vector2` operations inside ECS systems without understanding allocation** — Systems run every tick (60 FPS). Prefer `InPlace` and `ToRef` variants.

### Common Mistakes

- Using `Math.sqrt()` instead of `MathOps.sqrt()` in vector normalization → platform-specific desyncs
- Forgetting `await MathOps.init()` during startup → WASM module not loaded, crashes at first trig call
- Mutating `Vector2.ZERO.x = 5` → breaks all future uses of `Vector2.ZERO` (shared instance)
- Mixing degrees and radians → rotation by 90 instead of `MathOps.PI_HALF` rotates by ~5157 degrees

## 8. Usage Examples

### Basic MathOps

```typescript
import { MathOps } from '@lagless/math';

// MUST call init before any usage
await MathOps.init();

// Deterministic trig
const angle = MathOps.PI_HALF;
const s = MathOps.sin(angle); // 1.0 (deterministic)
const c = MathOps.cos(angle); // ~0.0 (deterministic)

// Angle normalization
const normalized = MathOps.normalizeAngle(MathOps.PI * 3); // -π

// Lerp and clamp
const interpolated = MathOps.lerp(0, 100, 0.5); // 50
const clamped = MathOps.clamp(150, 0, 100); // 100
```

### Vector2 Basics

```typescript
import { Vector2, MathOps } from '@lagless/math';

await MathOps.init();

// Create vectors
const a = new Vector2(3, 4);
const b = new Vector2(1, 2);

// Length and distance
console.log(a.length()); // 5.0 (uses MathOps.sqrt)
console.log(a.distanceTo(b)); // 2.828...

// Addition (three flavors)
const sum1 = a.addToNew(b);        // New instance: (4, 6)
const sum2 = a.addInPlace(b);      // Mutates a, returns a: (4, 6)
const sum3 = Vector2.ZERO.clone();
a.addToRef(b, sum3);                // Writes to sum3: (4, 6)

// Normalization
const dir = new Vector2(3, 4).normalizeInPlace(); // (0.6, 0.8)
```

### Zero-Allocation Pattern (Hot Loops)

```typescript
import { Vector2, VECTOR2_BUFFER_1, VECTOR2_BUFFER_2 } from '@lagless/math';

// Inside an ECS system (runs 60 times per second)
function updateVelocity(position: Vector2, target: Vector2, speed: number) {
  // Use pre-allocated buffers to avoid GC pressure
  const direction = VECTOR2_BUFFER_1;
  const delta = VECTOR2_BUFFER_2;

  target.subToRef(position, delta);          // delta = target - position
  delta.normalizeToRef(direction);           // direction = normalize(delta)
  direction.scaleToRef(speed, delta);        // delta = direction * speed
  position.addInPlace(delta);                // position += delta

  // No allocations! VECTOR2_BUFFER_* are reused every frame.
}
```

### Angle and Rotation

```typescript
import { Vector2, MathOps } from '@lagless/math';

await MathOps.init();

const v = new Vector2(1, 0);
console.log(v.angle()); // 0 (pointing right)

v.rotateInPlace(MathOps.PI_HALF);
console.log(v.angle()); // π/2 (pointing up)

// Rotate towards target
const target = new Vector2(-1, 0);
v.rotateTowardsInPlace(target, MathOps.Deg2Rad * 45); // Rotate by at most 45°
```

## 9. Testing Guidance

**Framework:** Vitest

**Running tests:**
```bash
# From monorepo root
nx test math

# Or with direct runner
npm test -- libs/math
```

**Existing test patterns:**
- `libs/math/src/lib/math.spec.ts` — Verifies WASM determinism by comparing `MathOps` output to standard `Math` functions (within 10 decimal places)
- Tests call `await MathOps.init()` before assertions
- Uses `toBeCloseTo(expected, precision)` for floating-point comparisons

**When adding tests:**
- Always call `await MathOps.init()` in the test setup or at the start of the test
- Use `toBeCloseTo()` for floating-point assertions (exact equality fails due to rounding)
- Test `InPlace`, `ToRef`, and `ToNew` variants separately to verify allocation behavior

## 10. Change Checklist

When modifying this module:

1. **Verify determinism:** If changing math operations, test on multiple browsers and Node.js
2. **Maintain three-variant pattern:** New `Vector2` operations should provide `InPlace`, `ToRef`, and `ToNew` methods
3. **Update tests:** Add test coverage for new operations
4. **Check allocation:** Profile to ensure `ToRef` and `InPlace` methods don't allocate
5. **Update this README:** Document new APIs in Public API section
6. **Preserve radians-only convention:** Do not add degree-based APIs
7. **DO NOT replace WASM calls with standard Math:** This breaks determinism

## 11. Integration Notes

### Used By

- **`@lagless/core`** — `Vector2` is used extensively for `Transform2d` and `Velocity2d` components. Systems use `MathOps` for deterministic physics calculations.
- **`circle-sumo-simulation`** — All game physics (collision, movement, impulses) rely on `Vector2` and `MathOps` for deterministic simulation.

### Common Integration Patterns

**ECS Component Integration:**
```typescript
// Transform2d component stores position and rotation
// Systems use Vector2 operations for movement
class MovementSystem {
  run(dt: number) {
    for (const entityId of this.filter) {
      const transform = this.transform2d.unsafe.position[entityId]; // Vector2
      const velocity = this.velocity2d.unsafe.velocity[entityId];   // Vector2

      // Zero-allocation update
      velocity.scaleToRef(dt, VECTOR2_BUFFER_1);
      transform.addInPlace(VECTOR2_BUFFER_1);
    }
  }
}
```

**Initialization Order:**
```typescript
// In your ECS runner or app entrypoint:
async function main() {
  await MathOps.init(); // FIRST: Initialize WASM
  const runner = new MyECSRunner(config); // THEN: Start ECS
  runner.start();
}
```

## 12. Appendix

### Vector2 Allocation Patterns

Understanding the three-variant pattern is critical for performance:

| Variant | Allocates? | Use Case |
|---------|-----------|----------|
| `...ToNew()` | **Yes** | One-time calculations, initialization, readable code outside hot loops |
| `...InPlace()` | **No** | Mutate `this` directly. Use when you own the vector and want to update it. |
| `...ToRef(ref)` | **No** | Write to an existing vector. Use in hot loops with pre-allocated buffers. |

**Example comparison:**
```typescript
// ALLOCATES (avoid in 60 FPS loops)
const result1 = a.addToNew(b);

// ZERO ALLOCATION (mutates a)
const result2 = a.addInPlace(b); // a is now (a+b)

// ZERO ALLOCATION (writes to temp)
const temp = new Vector2(); // Allocated ONCE outside loop
for (let i = 0; i < 1000; i++) {
  a.addToRef(b, temp); // Reuses temp, no allocation
}
```

### VECTOR2_BUFFER_* Constants

Ten pre-allocated `Vector2` instances for temporary calculations:

```typescript
import { VECTOR2_BUFFER_1, VECTOR2_BUFFER_2 } from '@lagless/math';

function collisionCheck(a: Vector2, b: Vector2): boolean {
  const delta = VECTOR2_BUFFER_1;
  b.subToRef(a, delta); // delta = b - a
  return delta.lengthSquared() < 4; // collision if distance < 2
}
```

**Safety:** These are module-level singletons. Do NOT use the same buffer recursively (e.g., calling a function that uses `BUFFER_1` while you're also using `BUFFER_1`). Use different buffer indices for nested operations.

### Deterministic Math Implementation

The `@lagless/deterministic-math` WASM module uses C implementations of trigonometric functions and square root to guarantee bit-identical results across platforms. JavaScript's native `Math` functions delegate to platform-specific libm implementations, which differ between browsers and operating systems. For rollback netcode, even a 1-bit difference in float results causes divergence over time.

**Performance:** WASM math functions are ~2-3x slower than native `Math` functions, but this overhead is negligible compared to typical game logic. The determinism guarantee is worth the cost.
