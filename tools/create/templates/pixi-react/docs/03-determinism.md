# Determinism — THE MOST CRITICAL DOCUMENT

## Why Determinism Matters

Lagless uses **deterministic lockstep with rollback**. Every client runs the same simulation independently. If any client produces a different result from the same inputs, the simulations **permanently diverge** — players see different game states and the game is unplayable. There is no automatic recovery without a full state reset.

## The Golden Rule

**Same inputs + same initial state + same PRNG seed = byte-identical simulation state on every client, every platform, every time.**

## ALWAYS Do These

### Use MathOps for Trigonometry and Square Root

```typescript
import { MathOps } from '@lagless/math';

// CORRECT — WASM-backed, identical on all platforms
const s = MathOps.sin(angle);
const c = MathOps.cos(angle);
const a = MathOps.atan2(dy, dx);
const d = MathOps.sqrt(dx * dx + dy * dy);
const v = MathOps.clamp(value, min, max);
```

### Use PRNG for Randomness

```typescript
// CORRECT — deterministic, state stored in ArrayBuffer
const random = this._prng.getFloat();           // [0, 1)
const roll = this._prng.getRandomInt(1, 7);     // [1, 7) = 1-6
```

### Set prevPosition on Entity Spawn

```typescript
// CORRECT — prevents one-frame interpolation jump from (0,0)
this._transform.set(entity, {
  positionX: spawnX,
  positionY: spawnY,
  prevPositionX: spawnX,
  prevPositionY: spawnY,
});
```

### Initialize MathOps Before Simulation

```typescript
// In app startup (main.tsx or runner-provider.tsx):
await MathOps.init();
```

## NEVER Do These in Simulation Code

### Platform-Dependent Math

```typescript
// WRONG — results differ between browsers/platforms
Math.sin(x);     // Use MathOps.sin(x)
Math.cos(x);     // Use MathOps.cos(x)
Math.tan(x);     // Use MathOps.tan(x)
Math.atan2(y,x); // Use MathOps.atan2(y, x)
Math.sqrt(x);    // Use MathOps.sqrt(x)
Math.pow(x, y);  // Use MathOps.pow(x, y) or x ** y for integer powers
Math.log(x);     // Use MathOps.log(x)
Math.exp(x);     // Use MathOps.exp(x)
```

### Non-Deterministic Sources

```typescript
// WRONG — different on every client
Math.random();           // Use PRNG.getFloat()
Date.now();              // Use tick number instead
performance.now();       // Use tick number instead
new Date();              // Use tick number instead
crypto.getRandomValues(); // Use PRNG
```

### Unstable Iteration

```typescript
// WRONG — sort is not stable without comparator, may differ between engines
array.sort();
// CORRECT
array.sort((a, b) => a - b);

// WRONG — key order is not guaranteed
for (const key in obj) { ... }
// CORRECT — use arrays or Maps with deterministic insertion order

// CAUTION — Map/Set iteration order depends on insertion order
// Only safe if insertions happen in deterministic order (e.g., by entity ID)
```

## SAFE Math Functions

These JavaScript Math functions are **safe** — they produce identical results on all platforms because they operate on exact integer or bit-level operations:

```typescript
Math.abs(x)      // absolute value
Math.min(a, b)   // minimum
Math.max(a, b)   // maximum
Math.floor(x)    // round down
Math.ceil(x)     // round up
Math.round(x)    // round to nearest
Math.trunc(x)    // truncate decimal
Math.sign(x)     // sign (-1, 0, 1)
Math.fround(x)   // round to float32
Math.hypot(a, b) // safe — but prefer MathOps.sqrt(a*a + b*b) for consistency
```

## NaN Propagation — Silent Killer

NaN is the most dangerous desync source because it propagates silently through all operations:

```
NaN + 5 = NaN
MathOps.clamp(NaN, 0, 1) = NaN     // clamp does NOT fix NaN!
MathOps.sin(NaN) = NaN
Rapier body.setTranslation({x: NaN, y: NaN}) → corrupted physics state
```

**The chain:** Malicious/buggy RPC → `NaN` in field → `MathOps.clamp(NaN, -1, 1)` → still `NaN` → entity position → physics engine → **permanent divergence across all clients**

**The fix:** Always check `Number.isFinite()` BEFORE any math:

```typescript
const finite = (v: number): number => Number.isFinite(v) ? v : 0;

// In system:
let dirX = finite(rpc.data.directionX);  // NaN → 0, Infinity → 0
dirX = MathOps.clamp(dirX, -1, 1);       // Now safe to clamp
```

## Float32 Precision

The framework stores most values as `float32`. TypedArray access automatically truncates `float64` → `float32`. Do NOT manually cast with `Math.fround()` — the framework handles it.

However, **intermediate calculations** in JavaScript are always `float64`. This is fine as long as you write results back through typed arrays (which truncate) and don't compare intermediate float64 values across clients.

## Debugging Divergence

### Step 1: Detect

Open the F3 debug panel → hash verification table. Red entries = divergence detected at that tick.

### Step 2: Reproduce

Use dev-player (`pnpm dev:player`) with 2+ instances. Perform the same actions. Watch for hash mismatch.

### Step 3: Narrow Down

Binary search by adding temporary hash checks between systems:

```typescript
// In systems/index.ts — temporarily split execution to find diverging system
export const systems = [
  SavePrevTransformSystem,
  PlayerConnectionSystem,     // check hash after this
  ApplyMoveInputSystem,       // check hash after this
  IntegrateSystem,            // check hash after this — if diverges here, problem is in IntegrateSystem
  // ...
];
```

### Step 4: Common Causes

1. **`Math.sin/cos` instead of `MathOps.sin/cos`** — most common
2. **Missing `prevPosition` initialization** — causes one-frame desync on spawn
3. **`Math.random()` in simulation code** — each client gets different values
4. **Unsorted array iteration** — `Array.sort()` without comparator
5. **NaN from unsanitized RPC data** — corrupts physics state
6. **Reading `Date.now()` or `performance.now()`** — differs per client

## Determinism Code Review Checklist

Before merging any simulation code:

- [ ] No `Math.sin/cos/tan/atan2/sqrt/pow/log/exp` — all use `MathOps.*`
- [ ] No `Math.random()` — uses `PRNG`
- [ ] No `Date.now()`, `performance.now()`, `new Date()` — uses tick number
- [ ] All `Array.sort()` calls have explicit comparator
- [ ] All RPC fields validated with `Number.isFinite()` before use
- [ ] All spawned entities have `prevPosition = position`
- [ ] No `for...in` loops on objects with variable key order
- [ ] No external state (DOM, global variables, closures over non-deterministic data)
- [ ] PRNG calls are in deterministic order (same code path every tick)

## Testing Determinism

The simplest test: run the same inputs twice and compare final state hashes.

```typescript
// Run simulation with recorded inputs
const hash1 = computeStateHash(simulation1.mem.buffer);

// Reset, run same inputs again
const hash2 = computeStateHash(simulation2.mem.buffer);

assert(hash1 === hash2, 'Simulation is not deterministic!');
```

The framework's hash verification system does this automatically in multiplayer — each client reports state hashes and they're compared. Use the F3 debug panel to monitor.
