# @lagless/math

Deterministic math utilities for the Lagless framework. Provides Vector2 operations and math functions that produce consistent results across all platforms.

## Installation

```bash
pnpm add @lagless/math
```

## Overview

This module provides:

- **Vector2**: Comprehensive 2D vector class with allocation-free operations
- **MathOps**: Deterministic math operations
- **Vector2Buffers**: Bulk operations on typed arrays

## Vector2

A full-featured 2D vector class with three operation patterns:

1. **InPlace**: Modifies the vector itself
2. **ToRef**: Writes result to a provided reference
3. **ToNew**: Creates and returns a new Vector2

### Creating Vectors

```typescript
import { Vector2 } from '@lagless/math';

// Constructor
const v1 = new Vector2(10, 20);

// From angle (radians)
const v2 = Vector2.fromAngle(Math.PI / 4); // 45 degrees, length 1
const v3 = Vector2.fromAngle(Math.PI / 4, 5); // 45 degrees, length 5

// Constants (read-only!)
Vector2.ZERO;    // (0, 0)
Vector2.ONE;     // (1, 1)
Vector2.UNIT_X;  // (1, 0)
Vector2.UNIT_Y;  // (0, 1)
Vector2.UP;      // (0, 1)
Vector2.DOWN;    // (0, -1)
Vector2.LEFT;    // (-1, 0)
Vector2.RIGHT;   // (1, 0)
```

### Basic Operations

```typescript
const a = new Vector2(3, 4);
const b = new Vector2(1, 2);

// Addition
const sum = a.addToNew(b);      // New vector
a.addInPlace(b);                // Modify a
a.addToRef(b, result);          // Write to result

// Subtraction
const diff = a.subToNew(b);

// Scaling
const scaled = a.scaleToNew(2);

// Negation
const neg = a.negateToNew();

// Component-wise multiply/divide
const mul = a.mulToNew(b);
const div = a.divToNew(b);
```

### Metrics

```typescript
const v = new Vector2(3, 4);

v.length();           // 5
v.lengthSquared();    // 25 (faster, no sqrt)

const dist = v.distanceTo(other);
const distSq = v.distanceSquaredTo(other); // Faster
```

### Normalization

```typescript
const v = new Vector2(3, 4);

// Normalize to unit length
v.normalizeInPlace();           // Modifies v
const unit = v.normalizedToNew(); // New vector
v.normalizeToRef(result);       // Write to result
```

### Dot and Cross Products

```typescript
const a = new Vector2(1, 0);
const b = new Vector2(0, 1);

const dot = a.dot(b);      // 0 (perpendicular)
const cross = a.crossZ(b); // 1 (2D cross product Z component)
```

### Rotation

```typescript
const v = new Vector2(1, 0);

// Rotate around origin
v.rotateInPlace(Math.PI / 2);  // Now (0, 1)

// Rotate around pivot
v.rotateAroundInPlace(pivot, angle);

// Rotate towards target
v.rotateTowardsInPlace(target, maxDelta);
```

### Angles

```typescript
const v = new Vector2(1, 1);

// Angle from +X axis (-PI to PI)
const angle = v.angle(); // ~0.785 (45 degrees)

// Signed angle to another vector
const angleTo = v.angleTo(other);
```

### Projection and Reflection

```typescript
// Project onto axis
const projection = v.projectOntoToNew(axis);

// Reflect across normal
const reflected = v.reflectToNew(normal);
```

### Interpolation

```typescript
// Linear interpolation
const mid = a.lerpToNew(b, 0.5);

// Normalized linear interpolation (for directions)
const dir = a.nlerpToNew(b, 0.5);
```

### Perpendiculars

```typescript
// Left perpendicular (+90 degrees)
const left = v.perpLeftToNew();

// Right perpendicular (-90 degrees)
const right = v.perpRightToNew();
```

### Clamping

```typescript
// Clamp components
v.clampInPlace(min, max);

// Clamp length
v.clampLengthInPlace(minLen, maxLen);
```

### Serialization

```typescript
// To array
const arr = v.toArray(); // [x, y]

// From array
const v = Vector2.fromArray([10, 20]);
Vector2.fromArrayToRef([10, 20], result);
```

## Static Buffers (Allocation-Free)

For performance-critical code, use pre-allocated buffers:

```typescript
import { VECTOR2_BUFFER_1, VECTOR2_BUFFER_2 } from '@lagless/math';

// Use buffers instead of creating new vectors
Vector2.fromAngleToRef(angle, VECTOR2_BUFFER_1, length);
a.addToRef(b, VECTOR2_BUFFER_2);

// Access results
const x = VECTOR2_BUFFER_1.x;
const y = VECTOR2_BUFFER_1.y;
```

## MathOps

Deterministic math functions:

```typescript
import { MathOps } from '@lagless/math';

// Trigonometry
MathOps.sin(angle);
MathOps.cos(angle);
MathOps.atan2(y, x);

// Constants
MathOps.PI;      // 3.141592653589793
MathOps.PI_2;    // 2 * PI
MathOps.PI_HALF; // PI / 2

// Clamping
MathOps.clamp(value, min, max);
MathOps.clamp01(value); // Clamp to [0, 1]

// Interpolation
MathOps.lerp(a, b, t);

// Angle normalization
MathOps.normalizeAngle(angle); // To (-PI, PI]

// Smooth rotation
MathOps.smoothRotate(current, target, maxDelta);

// Square root
MathOps.sqrt(value);
```

## Vector2Buffers

Bulk operations on typed arrays (SoA pattern):

```typescript
import { Vector2Buffers } from '@lagless/math';

// Add velocity to position for all entities
Vector2Buffers.addInPlace(
  positionX, positionY,  // Target arrays
  velocityX, velocityY,  // Source arrays
  count                  // Number of elements
);

// Scale all velocities
Vector2Buffers.scaleInPlace(velocityX, velocityY, dampingFactor, count);
```

## Determinism

All operations use `@lagless/deterministic-math` internally to ensure consistent floating-point results across:

- Different JavaScript engines (V8, SpiderMonkey, etc.)
- Different platforms (x86, ARM)
- Different optimization levels

This is critical for multiplayer synchronization.
