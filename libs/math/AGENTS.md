# AGENTS.md - @lagless/math

AI coding guide for the math module.

## Module Purpose

Deterministic math operations for game physics and vector calculations. Critical for multiplayer synchronization where identical inputs must produce identical outputs.

## Key Exports

```typescript
// Vector2 class
export class Vector2;

// Static buffers (avoid allocations)
export const VECTOR2_BUFFER_1: Vector2;
export const VECTOR2_BUFFER_2: Vector2;

// Math operations
export const MathOps: {
  sin, cos, atan2, sqrt,
  clamp, clamp01, lerp,
  normalizeAngle, smoothRotate,
  PI, PI_2, PI_HALF
};

// Bulk operations
export const Vector2Buffers: {
  addInPlace, scaleInPlace, ...
};
```

## Vector2 Operation Patterns

Every operation has three variants:

| Suffix | Returns | Mutates |
|--------|---------|---------|
| `InPlace` | `this` | Yes (self) |
| `ToRef` | `ref` | Yes (ref) |
| `ToNew` | new Vector2 | No |

### Performance Priority

```typescript
// FASTEST - No allocation, reuses existing
v.addToRef(other, VECTOR2_BUFFER_1);

// FAST - Minimal allocation, reuses self
v.addInPlace(other);

// SLOW - Allocates new object
const result = v.addToNew(other);
```

## Common Patterns

### Direction from Angle

```typescript
import { Vector2, VECTOR2_BUFFER_1 } from '@lagless/math';

// In systems - use static buffer
Vector2.fromAngleToRef(direction, VECTOR2_BUFFER_1, speed);
velocity.x = VECTOR2_BUFFER_1.x;
velocity.y = VECTOR2_BUFFER_1.y;
```

### Distance Check

```typescript
// Use squared distance to avoid sqrt
const distSq = a.distanceSquaredTo(b);
if (distSq < radius * radius) {
  // Within radius
}
```

### Angle Between Vectors

```typescript
const angle = a.angleTo(b); // Signed, shortest path
```

### Normalize Safely

```typescript
// Handles zero-length vectors
v.normalizeInPlace(); // Returns (0,0) if v was (0,0)
```

### Interpolation

```typescript
// Position interpolation
const renderX = MathOps.lerp(prevX, currX, t);

// Direction interpolation (normalized)
const dir = prevDir.nlerpToNew(currDir, t);

// Angle interpolation
const angle = MathOps.smoothRotate(currentAngle, targetAngle, maxDelta);
```

## MathOps Reference

### Constants

```typescript
MathOps.PI       // 3.141592653589793
MathOps.PI_2     // 6.283185307179586 (2π)
MathOps.PI_HALF  // 1.5707963267948966 (π/2)
```

### Clamping

```typescript
MathOps.clamp(value, min, max);  // Clamp to [min, max]
MathOps.clamp01(value);          // Clamp to [0, 1]
```

### Interpolation

```typescript
MathOps.lerp(a, b, t);  // Linear interpolation, t in [0,1]
```

### Angle Operations

```typescript
// Normalize to (-PI, PI]
MathOps.normalizeAngle(angle);

// Rotate current towards target by at most maxDelta
MathOps.smoothRotate(current, target, maxDelta);
```

## Usage in Systems

### Movement System Example

```typescript
import { MathOps, Vector2, VECTOR2_BUFFER_1 } from '@lagless/math';

@ECSSystem()
export class ApplyMoveInputSystem implements IECSSystem {
  constructor(
    private readonly _Input: InputProvider,
    private readonly _Velocity: Velocity2d,
    private readonly _Filter: MovableFilter,
  ) {}

  public update(tick: number): void {
    const moves = this._Input.getTickRPCs(tick, Move);

    for (const rpc of moves) {
      const { direction, speed } = rpc.data;
      const entity = this.getEntity(rpc.meta.playerSlot);

      // Convert angle to velocity vector
      Vector2.fromAngleToRef(direction, VECTOR2_BUFFER_1, speed);

      this._Velocity.unsafe.velocityX[entity] = VECTOR2_BUFFER_1.x;
      this._Velocity.unsafe.velocityY[entity] = VECTOR2_BUFFER_1.y;
    }
  }
}
```

### Physics Integration

```typescript
// Update positions
for (const entity of this._Filter) {
  this._Transform.unsafe.positionX[entity] +=
    this._Velocity.unsafe.velocityX[entity];
  this._Transform.unsafe.positionY[entity] +=
    this._Velocity.unsafe.velocityY[entity];
}
```

### Collision Detection

```typescript
const dx = posX[b] - posX[a];
const dy = posY[b] - posY[a];
const distSq = dx * dx + dy * dy;
const sumRadius = radiusA + radiusB;

if (distSq < sumRadius * sumRadius) {
  // Collision!
  const dist = MathOps.sqrt(distSq);
  const nx = dx / dist;  // Normal X
  const ny = dy / dist;  // Normal Y
}
```

### Rendering Interpolation

```typescript
// In render code (not systems)
const t = simulation.interpolationFactor;

const renderX = MathOps.lerp(
  transform.unsafe.prevPositionX[entity],
  transform.unsafe.positionX[entity],
  t
);
```

## Vector2Buffers (SoA Operations)

For bulk operations on typed arrays:

```typescript
import { Vector2Buffers } from '@lagless/math';

// Apply damping to all velocities
Vector2Buffers.scaleInPlace(
  velocityX,     // Float32Array
  velocityY,     // Float32Array
  0.99,          // Damping factor
  entityCount    // How many to process
);
```

## DO's and DON'Ts

### DO

- Use static buffers in hot paths
- Use squared distance for comparisons
- Use `MathOps` functions for determinism
- Use `ToRef` pattern in systems

### DON'T

- Use `Math.random()` (not deterministic)
- Create Vector2 instances in loops
- Use `ToNew` in hot paths
- Mutate static constants (`Vector2.ZERO`, etc.)
- Use native `Math.sin/cos` (may differ across platforms)

## File Structure

```
libs/math/src/lib/
├── vector2.ts         # Vector2 class
├── vector2-buffers.ts # Bulk SoA operations
└── math-ops.ts        # MathOps (wraps deterministic-math)
```

## Dependencies

- `@lagless/deterministic-math`: Cross-platform deterministic math
