# AGENTS.md - AI Coding Guide for Lagless Framework

This document provides structured guidance for AI agents working with the Lagless game framework.

## Framework Overview

Lagless is a **deterministic ECS (Entity Component System) framework** for multiplayer games. Key architectural principles:

1. **Single ArrayBuffer State**: All game state lives in one `ArrayBuffer` for instant snapshots/rollback
2. **Code Generation**: Game schema defined in YAML, TypeScript classes generated
3. **Structure of Arrays (SoA)**: Components store each field as a separate typed array
4. **Dependency Injection**: Systems receive dependencies via constructor (decorator-based DI)
5. **Input-Driven Simulation**: Player inputs are RPCs processed at specific ticks

## Critical Paths and Files

### Code Generation Pipeline

```
Schema (YAML) → Codegen → Generated Classes → Systems → Runner
```

**Key files:**
- Schema definition: `<project>/src/lib/schema/ecs.yaml`
- Generated output: `<project>/src/lib/schema/code-gen/`
- Generator: `tools/codegen/src/generator.ts`
- Parser: `tools/codegen/src/parser.ts`

### Running Code Generation

```bash
# Via Nx generator
nx g @lagless/codegen:ecs --configPath <path-to-schema.yaml>

# Via CLI
npx lagless-codegen -c <path-to-schema.yaml> -o <output-dir>
```

## Schema Definition Guide

### YAML Schema Structure

```yaml
projectName: MyGame  # PascalCase, used for generated class names

components:
  <ComponentName>:
    <fieldName>: <type>

singletons:
  <SingletonName>:
    <fieldName>: <type>

playerResources:
  <ResourceName>:
    <fieldName>: <type>

inputs:
  <InputName>:
    <fieldName>: <type>

filters:
  <FilterName>:
    include:
      - <ComponentName>
    exclude:
      - <ComponentName>  # optional
```

### Supported Field Types

| Type | Size | TypedArray | Range |
|------|------|------------|-------|
| `int8` | 1 byte | Int8Array | -128 to 127 |
| `uint8` | 1 byte | Uint8Array | 0 to 255 |
| `int16` | 2 bytes | Int16Array | -32768 to 32767 |
| `uint16` | 2 bytes | Uint16Array | 0 to 65535 |
| `int32` | 4 bytes | Int32Array | -2^31 to 2^31-1 |
| `uint32` | 4 bytes | Uint32Array | 0 to 2^32-1 |
| `float32` | 4 bytes | Float32Array | IEEE 754 single |
| `float64` | 8 bytes | Float64Array | IEEE 754 double |

**Arrays:** Use `type[length]` syntax, e.g., `uint8[16]` for 16-byte ID.

## Writing Systems

### System Template

```typescript
import { ECSSystem, IECSSystem, EntitiesManager, InputProvider } from '@lagless/core';
import { ComponentA, ComponentB, FilterAB, InputX } from '../schema/code-gen/index.js';

@ECSSystem()
export class MySystem implements IECSSystem {
  constructor(
    // Inject components, filters, singletons, and core services
    private readonly _ComponentA: ComponentA,
    private readonly _ComponentB: ComponentB,
    private readonly _FilterAB: FilterAB,
    private readonly _InputProvider: InputProvider,
    private readonly _EntitiesManager: EntitiesManager,
  ) {}

  public update(tick: number): void {
    // Process inputs for this tick
    const rpcs = this._InputProvider.getTickRPCs(tick, InputX);
    for (const rpc of rpcs) {
      // rpc.meta.playerSlot - which player sent this
      // rpc.meta.tick - scheduled tick
      // rpc.data.* - input payload fields
    }

    // Iterate entities matching the filter
    for (const entity of this._FilterAB) {
      // Use unsafe accessors for direct typed array access
      const x = this._ComponentA.unsafe.fieldX[entity];
      this._ComponentA.unsafe.fieldX[entity] = x + 1;

      // Or use cursor for object-like access (slower but safer)
      const cursor = this._ComponentA.getCursor(entity);
      cursor.fieldX = cursor.fieldX + 1;
    }
  }
}
```

### Injectable Dependencies

These can be injected into system constructors:

| Class | Purpose |
|-------|---------|
| `ECSConfig` | Configuration (fps, maxEntities, seed, etc.) |
| `InputProvider` | Access player inputs via `getTickRPCs()` |
| `ECSSimulation` | Current simulation state |
| `EntitiesManager` | Create/destroy entities, add/remove components |
| `PRNG` | Deterministic random number generator |
| `PlayerResources` | Access per-player data |
| Generated Components | Direct component data access |
| Generated Singletons | Global state access |
| Generated Filters | Entity iteration |
| Generated Signals | Event emission |

### System Execution Order

Systems run in the **exact order** they're passed to the runner:

```typescript
const runner = new MyGameRunner(config, inputProvider, [
  // Input processing
  ApplyMoveInputSystem,
  ApplyAttackInputSystem,

  // Physics
  ApplyImpulseSystem,
  IntegrateSystem,
  CollisionSystem,

  // Game logic
  DamageSystem,
  DeathSystem,
  ScoreSystem,

  // Cleanup/Events
  GameEventsSystem,
], signals);
```

## Entity Management

### Creating Entities with Prefabs

```typescript
import { Prefab, EntitiesManager } from '@lagless/core';
import { Transform2d, Velocity2d, Health } from '../schema/code-gen/index.js';

// Define prefab with default values
const playerPrefab = Prefab.create()
  .with(Transform2d)
  .with(Velocity2d)
  .with(Health, { current: 100, max: 100 });

// In system
const entity = this._EntitiesManager.createEntity(playerPrefab);
```

### Component Operations

```typescript
// Check if entity has component
if (this._EntitiesManager.hasComponent(entity, Health)) {
  // Remove component
  this._EntitiesManager.removeComponent(entity, Health);
}

// Add component to existing entity
this._EntitiesManager.addComponent(entity, Health);

// Destroy entity
this._EntitiesManager.destroyEntity(entity);
```

## Data Access Patterns

### Unsafe (Fast) - Use for Performance-Critical Code

```typescript
// Direct typed array access - fastest
const posX = this._Transform2d.unsafe.positionX;
const posY = this._Transform2d.unsafe.positionY;

for (const entity of this._Filter) {
  posX[entity] += velX[entity] * dt;
  posY[entity] += velY[entity] * dt;
}
```

### Cursor (Safe) - Use for Clarity

```typescript
// Object-like access via cursor
for (const entity of this._Filter) {
  const transform = this._Transform2d.getCursor(entity);
  transform.positionX += transform.velocityX;
  transform.positionY += transform.velocityY;
}
```

### Singleton Access

```typescript
// Via .safe property (singleton has single value, not per-entity)
const gamePhase = this._GameState.safe.phase;
this._GameState.safe.startedAtTick = currentTick;
```

### Player Resources

```typescript
// Get specific player's resource
const playerData = this._PlayerResources.get(PlayerData, playerSlot);
const entity = playerData.safe.entity;
const score = playerData.safe.score;
playerData.safe.score += 10;
```

## Signal System

Signals handle events with prediction support:

```typescript
// Define a signal
import { Signal, ECSSignal } from '@lagless/core';

export interface HighImpactData {
  x: number;
  y: number;
  power: number;
}

@ECSSignal()
export class HighImpactSignal extends Signal<HighImpactData> {}

// Emit in system
this._HighImpactSignal.emit(tick, { x: 100, y: 200, power: 0.8 });

// Subscribe in UI (React component)
useEffect(() => {
  const unsub = highImpactSignal.Predicted.on((event) => {
    // Show immediate visual feedback
    playImpactVFX(event.data.x, event.data.y, event.data.power);
  });

  const unsubVerified = highImpactSignal.Verified.on((event) => {
    // Event confirmed by server
  });

  const unsubCancelled = highImpactSignal.Cancelled.on((event) => {
    // Event was rolled back - hide/revert visual
  });

  return () => { unsub(); unsubVerified(); unsubCancelled(); };
}, []);
```

## Input System

### Sending Inputs (Client Side)

```typescript
// In React/UI code
const sendMove = (direction: number, speed: number) => {
  inputProvider.drainInputs((addRpc) => {
    addRpc(Move, { direction, speed });
  });
};
```

### Processing Inputs (System Side)

```typescript
public update(tick: number): void {
  // Get all Move inputs scheduled for this tick
  const moves = this._InputProvider.getTickRPCs(tick, Move);

  for (const rpc of moves) {
    const { playerSlot } = rpc.meta;
    const { direction, speed } = rpc.data;

    // Process input...
  }
}
```

## Common Patterns

### Transform Interpolation (for Rendering)

```typescript
// In system - store previous values before update
public update(tick: number): void {
  for (const entity of this._Filter) {
    // Store previous for interpolation
    this._Transform2d.unsafe.prevPositionX[entity] = this._Transform2d.unsafe.positionX[entity];
    this._Transform2d.unsafe.prevPositionY[entity] = this._Transform2d.unsafe.positionY[entity];

    // Update current
    this._Transform2d.unsafe.positionX[entity] += velocity;
  }
}

// In render code
const t = simulation.interpolationFactor;
const renderX = MathOps.lerp(prevX, currX, t);
const renderY = MathOps.lerp(prevY, currY, t);
```

### Deterministic Random Numbers

```typescript
// In system constructor
constructor(private readonly _PRNG: PRNG) {}

// In update - deterministic results!
const randomValue = this._PRNG.getFloat53(); // 0.0 to 1.0
const randomInt = this._PRNG.getRandomIntInclusive(1, 6); // dice roll
```

### Vector Operations (Avoid Allocations)

```typescript
import { Vector2, VECTOR2_BUFFER_1, VECTOR2_BUFFER_2 } from '@lagless/math';

// Use static buffers instead of creating new Vector2 instances
Vector2.fromAngleToRef(angle, VECTOR2_BUFFER_1, length);
// Now VECTOR2_BUFFER_1.x and VECTOR2_BUFFER_1.y contain the result
```

## File Structure Convention

```
<game-project>/
├── src/
│   └── lib/
│       ├── schema/
│       │   ├── ecs.yaml           # Schema definition
│       │   └── code-gen/          # Generated files (do not edit)
│       │       ├── index.ts
│       │       ├── Transform2d.ts
│       │       ├── Move.ts
│       │       ├── <Project>InputRegistry.ts
│       │       ├── <Project>.core.ts
│       │       └── <Project>.runner.ts
│       ├── systems/
│       │   ├── index.ts           # Export all systems in order
│       │   ├── movement.system.ts
│       │   └── collision.system.ts
│       └── signals/
│           ├── index.ts
│           └── game-over.signal.ts
```

## Debugging Tips

### Memory Hash Verification

```typescript
// Logged automatically every 200 ticks
// Same hash = same state (determinism verified)
console.log(`Mem Hash at tick ${tick}: ${mem.getHash()}`);
```

### RPC Logging

```typescript
// Automatic logging when RPC is added
// "Added RPC for tick 150 (2), seq 1 slot 0, inputId 3"
```

## DO's and DON'Ts

### DO

- Use `unsafe` accessors in hot paths for performance
- Use static vector buffers (`VECTOR2_BUFFER_1`, etc.) to avoid allocations
- Keep systems focused on single responsibility
- Process inputs via `getTickRPCs()` at the scheduled tick
- Store previous values for interpolation
- Use PRNG for any randomness in simulation

### DON'T

- Create objects in hot paths (causes GC pressure)
- Use `Math.random()` (non-deterministic)
- Mutate state outside of systems
- Access DOM or async APIs in systems
- Edit generated files in `code-gen/` directory
- Use floating point comparisons for equality (use epsilon)

## Module-Specific AGENTS.md Files

For detailed guidance on specific modules, see:

- [libs/core/AGENTS.md](./libs/core/AGENTS.md) - ECS core, memory, DI, signals
- [libs/binary/AGENTS.md](./libs/binary/AGENTS.md) - Binary serialization
- [libs/math/AGENTS.md](./libs/math/AGENTS.md) - Deterministic math
- [libs/misc/AGENTS.md](./libs/misc/AGENTS.md) - Utilities
- [libs/animate/AGENTS.md](./libs/animate/AGENTS.md) - Animation
- [libs/net-wire/AGENTS.md](./libs/net-wire/AGENTS.md) - Networking
- [libs/pixi-react/AGENTS.md](./libs/pixi-react/AGENTS.md) - Pixi.js integration
- [libs/react/AGENTS.md](./libs/react/AGENTS.md) - React utilities
- [tools/codegen/AGENTS.md](./tools/codegen/AGENTS.md) - Code generation
- [circle-sumo/AGENTS.md](./circle-sumo/AGENTS.md) - Demo game reference

## Quick Reference

### Adding a New Component

1. Add to `ecs.yaml`:
   ```yaml
   components:
     NewComponent:
       fieldA: float32
       fieldB: uint8
   ```
2. Run codegen: `nx g @lagless/codegen:ecs --configPath <path>`
3. Import in systems: `import { NewComponent } from '../schema/code-gen/index.js'`

### Adding a New System

1. Create `new-feature.system.ts`
2. Implement `IECSSystem` with `@ECSSystem()` decorator
3. Add to systems array in runner instantiation (order matters!)

### Adding a New Input

1. Add to `ecs.yaml`:
   ```yaml
   inputs:
     NewAction:
       param1: float32
   ```
2. Run codegen
3. Process in system via `this._InputProvider.getTickRPCs(tick, NewAction)`

### Adding a New Filter

1. Add to `ecs.yaml`:
   ```yaml
   filters:
     NewFilter:
       include:
         - ComponentA
         - ComponentB
       exclude:
         - ComponentC  # optional
   ```
2. Run codegen
3. Inject and iterate in system: `for (const entity of this._NewFilter)`
