# Common Mistakes

## Determinism

### Using Math.sin/cos/atan2/sqrt

**Wrong:**
```typescript
const angle = Math.atan2(dy, dx);
const dist = Math.sqrt(dx * dx + dy * dy);
```
**Correct:**
```typescript
const angle = MathOps.atan2(dy, dx);
const dist = MathOps.sqrt(dx * dx + dy * dy);
```
**Why:** `Math.*` trig/sqrt results differ between browsers and platforms. MathOps uses WASM for cross-platform determinism.

### Using Math.random()

**Wrong:** `const r = Math.random();`
**Correct:** `const r = this._prng.getFloat();`
**Why:** Math.random() produces different values on each client. PRNG state is in the ArrayBuffer and deterministic.

### Forgetting prevPosition on Spawn

**Wrong:**
```typescript
this._transform.set(entity, { positionX: 100, positionY: 200 });
```
**Correct:**
```typescript
this._transform.set(entity, {
  positionX: 100, positionY: 200,
  prevPositionX: 100, prevPositionY: 200,
});
```
**Why:** prevPosition defaults to 0. Interpolation between (0,0) and (100,200) causes a one-frame visual jump.

### Array.sort() without Comparator

**Wrong:** `entities.sort();`
**Correct:** `entities.sort((a, b) => a - b);`
**Why:** Default sort is lexicographic and engine-dependent. Explicit comparator ensures deterministic order.

### Using Date.now() in Simulation

**Wrong:** `if (Date.now() > deadline) { ... }`
**Correct:** `if (tick > deadlineTick) { ... }`
**Why:** Date.now() differs between clients. Use tick count for all time-based logic.

## Input

### Not Sanitizing RPC Data

**Wrong:**
```typescript
const dirX = rpc.data.directionX;  // Could be NaN, Infinity
this._velocity.unsafe.velocityX[entity] = dirX * speed;
```
**Correct:**
```typescript
const finite = (v: number): number => Number.isFinite(v) ? v : 0;
let dirX = MathOps.clamp(finite(rpc.data.directionX), -1, 1);
this._velocity.unsafe.velocityX[entity] = dirX * speed;
```
**Why:** Network messages can contain NaN/Infinity. NaN propagates through all math and corrupts state permanently.

### Clamping Before Finite Check

**Wrong:** `MathOps.clamp(rpc.data.value, -1, 1)` — clamp(NaN) returns NaN
**Correct:** `MathOps.clamp(finite(rpc.data.value), -1, 1)`
**Why:** MathOps.clamp does NOT handle NaN. Always check `Number.isFinite()` first.

## Schema

### Editing Generated Code

**Wrong:** Editing files in `code-gen/` directory
**Correct:** Edit `ecs.yaml` and run `pnpm codegen`
**Why:** Generated files are overwritten on every codegen run. Changes will be lost.

### Declaring Transform2d with simulationType

**Wrong:**
```yaml
simulationType: physics2d
components:
  Transform2d:         # Already auto-prepended!
    positionX: float32
```
**Correct:**
```yaml
simulationType: physics2d
components:
  PlayerBody:          # Only declare your own components
    playerSlot: uint8
```
**Why:** `simulationType: physics2d` auto-prepends Transform2d + PhysicsRefs. Declaring them manually causes conflicts.

## Systems

### Wrong System Order

**Wrong:** HashVerificationSystem before game logic systems
**Correct:** HashVerificationSystem always last
**Why:** Hash verification must check state after all game logic has run.

### Storing State Outside ArrayBuffer

**Wrong:**
```typescript
class MySystem {
  private _cache = new Map();  // Lost on rollback!
}
```
**Correct:** Store all state in ECS components, singletons, or player resources.
**Why:** Rollback restores the ArrayBuffer but NOT JavaScript variables. External state causes desync.

### Modifying State in View Layer

**Wrong:**
```typescript
// In filterView onUpdate:
runner.Core.Transform2d.unsafe.positionX[entity] = smoothedX;
```
**Correct:** View layer is read-only. Only systems modify ECS state.
**Why:** View modifications bypass deterministic simulation, causing desync.

## Rendering

### Not Using VisualSmoother2d

**Wrong:**
```typescript
container.position.set(
  transform.unsafe.positionX[entity],
  transform.unsafe.positionY[entity],
);
```
**Better:**
```typescript
smoother.update(prevX, prevY, currX, currY, 0, 0, factor);
container.position.set(smoother.x, smoother.y);
```
**Why:** Without smoothing, entities teleport on rollback. VisualSmoother2d absorbs position jumps and decays smoothly.

### Using getCursor in Hot Path

**Wrong:**
```typescript
onUpdate: ({ entity }, container) => {
  const cursor = transform.getCursor(entity);  // Object allocation every frame
  container.x = cursor.positionX;
}
```
**Correct:**
```typescript
onUpdate: ({ entity }, container) => {
  container.x = transform.unsafe.positionX[entity];  // Direct typed array access
}
```
**Why:** getCursor creates an object per call. In onUpdate (called every frame per entity), use unsafe arrays.

## Physics

### Using handle | 0 for Rapier Handles

**Wrong:** `const index = handle | 0;`
**Correct:** Use `handleToIndex()` from `@lagless/physics-shared`
**Why:** Rapier handles are Float64 where low values are denormalized floats. Bitwise OR gives 0 for all of them.

### Setting Dynamic Body Position Directly

**Wrong:**
```typescript
this._transform.unsafe.positionX[entity] = newX; // Physics will overwrite!
```
**Correct:**
```typescript
const body = this._physics.getBody(this._physicsRefs.unsafe.bodyHandle[entity]);
body.setLinvel({ x: vx, y: vy }, true);
// or
body.applyImpulse({ x: fx, y: fy }, true);
```
**Why:** PhysicsStep syncs Rapier→ECS, overwriting manual position changes. Move dynamic bodies via forces/velocity on the Rapier body.

## Multiplayer

### Keeping State in Frontend Variables

**Wrong:**
```typescript
const [score, setScore] = useState(0);
// Updated in signal handler, lost on page refresh
```
**Better:** Read score from `PlayerResource.score[slot]` in the ArrayBuffer.
**Why:** React state is not synchronized across clients. ECS state in the ArrayBuffer is.

### Not Testing with Two Players

Always test multiplayer with at least 2 browser tabs or dev-player instances. Single-player testing misses:
- Rollback behavior
- Input delay effects
- State transfer
- Determinism bugs

## Error Message Solutions

| Error | Cause | Solution |
|-------|-------|---------|
| `MathOps not initialized` | MathOps.init() not called | Add `await MathOps.init()` before simulation starts |
| `Entity X has no component Y` | Component not added before access | Call `addComponent(entity, Y)` first |
| `Filter overflow` | More entities than maxEntities | Increase `maxEntities` in ECSConfig |
| `Cannot read property of undefined` in system | DI injection failed | Check constructor parameter type matches imported class |
| `reflect-metadata` error | Missing import | Add `import '@abraham/reflection'` in main entry point |
| Hash mismatch in debug panel | Determinism violation | See [03-determinism.md](03-determinism.md) debugging section |
| `WASM module not found` | MathOps WASM not loaded | Ensure `await MathOps.init()` completes before any math |
| State transfer failed | No quorum on snapshot hash | Check for determinism bugs — clients diverged before state transfer |
