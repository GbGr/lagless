# Lagless

A deterministic ECS (Entity Component System) game framework for TypeScript with built-in snapshot/rollback support, designed for multiplayer games.

## Overview

Lagless is built around a core principle: **write your game logic once, get multiplayer support automatically**. The framework handles all the complexity of state synchronization, rollback netcode, and deterministic simulation behind the scenes.

### Key Features

- **Deterministic Simulation**: All game state lives in a single `ArrayBuffer`, enabling perfect reproducibility across clients
- **Snapshot/Rollback Architecture**: Built-in support for client-side prediction and server reconciliation
- **Code Generation**: Define your game schema in YAML, generate type-safe TypeScript classes
- **Memory-Efficient ECS**: Components use typed arrays for cache-friendly data access
- **Dependency Injection**: Systems receive their dependencies automatically via decorators
- **Signal System**: Predicted/Verified/Cancelled event lifecycle for UI feedback

## Quick Start

### 1. Install Dependencies

```bash
pnpm add @lagless/core @lagless/binary @lagless/math @lagless/misc
```

### 2. Define Your Schema

Create a YAML schema file (`src/schema/ecs.yaml`):

```yaml
projectName: MyGame

components:
  Transform2d:
    positionX: float32
    positionY: float32
    rotation: float32

  Velocity2d:
    velocityX: float32
    velocityY: float32

  Health:
    current: uint16
    max: uint16

singletons:
  GameState:
    phase: uint8
    startedAtTick: uint32

playerResources:
  PlayerData:
    id: uint8[16]
    score: uint32
    entity: uint32

inputs:
  Move:
    direction: float32
    speed: float32

  Attack:
    targetEntity: uint32

filters:
  MovableFilter:
    include:
      - Transform2d
      - Velocity2d

  HealthFilter:
    include:
      - Health
```

### 3. Generate Code

```bash
nx g @lagless/codegen:ecs --configPath src/schema/ecs.yaml
```

This generates:
- Component classes (`Transform2d.ts`, `Velocity2d.ts`, `Health.ts`)
- Singleton classes (`GameState.ts`)
- Player resource classes (`PlayerData.ts`)
- Input classes (`Move.ts`, `Attack.ts`)
- Filter classes (`MovableFilter.ts`, `HealthFilter.ts`)
- Input registry (`MyGameInputRegistry.ts`)
- Core setup (`MyGame.core.ts`)
- Runner (`MyGame.runner.ts`)

### 4. Write Systems

```typescript
import { ECSSystem, IECSSystem, InputProvider, EntitiesManager } from '@lagless/core';
import { MathOps, Vector2, VECTOR2_BUFFER_1 } from '@lagless/math';
import { Transform2d, Velocity2d, Move, MovableFilter } from './schema/code-gen/index.js';

@ECSSystem()
export class MovementSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _Transform2d: Transform2d,
    private readonly _Velocity2d: Velocity2d,
    private readonly _MovableFilter: MovableFilter,
  ) {}

  public update(tick: number): void {
    // Process move inputs for this tick
    const moveRpcs = this._InputProvider.getTickRPCs(tick, Move);

    for (const rpc of moveRpcs) {
      const entity = this.getPlayerEntity(rpc.meta.playerSlot);
      Vector2.fromAngleToRef(rpc.data.direction, VECTOR2_BUFFER_1, rpc.data.speed);
      this._Velocity2d.unsafe.velocityX[entity] = VECTOR2_BUFFER_1.x;
      this._Velocity2d.unsafe.velocityY[entity] = VECTOR2_BUFFER_1.y;
    }

    // Update positions for all movable entities
    for (const entity of this._MovableFilter) {
      this._Transform2d.unsafe.positionX[entity] += this._Velocity2d.unsafe.velocityX[entity];
      this._Transform2d.unsafe.positionY[entity] += this._Velocity2d.unsafe.velocityY[entity];
    }
  }
}
```

### 5. Create and Run the Simulation

```typescript
import { ECSConfig, LocalInputProvider } from '@lagless/core';
import { MyGameRunner } from './schema/code-gen/index.js';
import { MyGameInputRegistry } from './schema/code-gen/index.js';
import { MovementSystem, PhysicsSystem, CollisionSystem } from './systems/index.js';
import { MyGameSignals } from './signals/index.js';

// Configuration
const config = new ECSConfig({
  maxEntities: 1000,
  maxPlayers: 6,
  fps: 60,
  seed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
});

// Input provider (local for single player, network for multiplayer)
const inputRegistry = new MyGameInputRegistry();
const inputProvider = new LocalInputProvider(config, inputRegistry);
inputProvider.playerSlot = 0;

// Create runner with systems in execution order
const runner = new MyGameRunner(
  config,
  inputProvider,
  [MovementSystem, PhysicsSystem, CollisionSystem],
  MyGameSignals,
);

// Game loop
runner.start();
let lastTime = performance.now();

function gameLoop() {
  const now = performance.now();
  const dt = now - lastTime;
  lastTime = now;

  runner.update(dt);
  requestAnimationFrame(gameLoop);
}

gameLoop();
```

## Architecture

### Memory Model

All game state is stored in a single `ArrayBuffer`:

```
┌─────────────────────────────────────────────────────────────────┐
│                        ArrayBuffer                               │
├─────────┬─────────┬────────────┬──────────┬─────────┬───────────┤
│  Tick   │  PRNG   │ Components │ Singletons│ Filters │ Players   │
│ Manager │ State   │  (SoA)     │           │         │ Resources │
└─────────┴─────────┴────────────┴──────────┴─────────┴───────────┘
```

This enables:
- **Instant snapshots**: `mem.exportSnapshot()` just copies the buffer
- **Fast rollback**: `mem.applySnapshot(buffer)` restores state immediately
- **Determinism**: Same seed + same inputs = same state

### Component Data Layout (SoA)

Components use Structure of Arrays for cache efficiency:

```typescript
// Generated Transform2d component
class Transform2d {
  unsafe = {
    positionX: Float32Array,  // [entity0, entity1, entity2, ...]
    positionY: Float32Array,  // [entity0, entity1, entity2, ...]
    rotation: Float32Array,   // [entity0, entity1, entity2, ...]
  };
}

// Access in systems
for (const entity of filter) {
  // Cache-friendly sequential access
  transform.unsafe.positionX[entity] += velocity.unsafe.velocityX[entity];
}
```

### Simulation Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                     Each Frame (update)                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Update clock with delta time                                 │
│  2. Check if rollback needed (new authoritative input received) │
│  3. If rollback: restore snapshot, re-simulate forward          │
│  4. Simulate ticks until caught up:                              │
│     ├─ Increment tick                                            │
│     ├─ Run all systems in order                                  │
│     ├─ Process signals (Predicted/Verified/Cancelled)           │
│     └─ Store snapshot (if snapshotRate interval)                │
│  5. Calculate interpolation factor for rendering                │
└─────────────────────────────────────────────────────────────────┘
```

## Modules

| Module | Description |
|--------|-------------|
| [@lagless/core](./libs/core/README.md) | ECS engine, memory management, DI, input system, signals |
| [@lagless/binary](./libs/binary/README.md) | Binary serialization, typed array utilities |
| [@lagless/math](./libs/math/README.md) | Deterministic math operations, Vector2 |
| [@lagless/misc](./libs/misc/README.md) | Ring buffers, snapshot history, simulation clock |
| [@lagless/animate](./libs/animate/README.md) | Animation utilities with easing functions |
| [@lagless/net-wire](./libs/net-wire/README.md) | Network protocol, clock sync (planned) |
| [@lagless/pixi-react](./libs/pixi-react/README.md) | Pixi.js React integration, virtual joystick |
| [@lagless/react](./libs/react/README.md) | React utilities, authentication |
| [tools/codegen](./tools/codegen/README.md) | YAML schema to TypeScript code generator |

## Demo: Circle Sumo

The `circle-sumo` directory contains a complete example game demonstrating all framework features:

- **circle-sumo-simulation**: Game logic, physics, bot AI
- **circle-sumo-game**: React/Pixi.js client with rendering and UI

See [circle-sumo/README.md](./circle-sumo/README.md) for details.

## Multiplayer (Planned)

The framework is designed for multiplayer from the ground up. Future additions:

- **Server module**: Authoritative simulation, input broadcasting
- **Network input providers**: Extends `AbstractInputProvider` for network transport
- **Lag compensation**: Built into the snapshot/rollback architecture

## Development

### Building

```bash
pnpm install
pnpm nx build @lagless/core
pnpm nx build @lagless/codegen
```

### Running Tests

```bash
pnpm nx test @lagless/core
```

### Running Circle Sumo Demo

```bash
pnpm nx serve circle-sumo-game
```

## Configuration Options

```typescript
const config = new ECSConfig({
  // 128-bit seed for deterministic PRNG
  seed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

  // Maximum entities that can exist simultaneously
  maxEntities: 1000,

  // Maximum players (affects player resources allocation)
  maxPlayers: 6,

  // Simulation rate
  fps: 60,

  // Input delay in ticks (for network prediction)
  initialInputDelayTick: 2,
  minInputDelayTick: 1,
  maxInputDelayTick: 8,

  // Snapshot storage for rollback
  snapshotRate: 1,           // Store snapshot every N ticks
  snapshotHistorySize: 100,  // Keep last N snapshots

  // Clock smoothing
  maxNudgePerFrame: 4.17,    // Max ms to adjust per frame
});
```

## License

MIT
