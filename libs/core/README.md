# @lagless/core

The core ECS (Entity Component System) engine for Lagless. Provides memory management, simulation loop, dependency injection, input handling, and signal system.

## Installation

```bash
pnpm add @lagless/core @lagless/binary @lagless/math @lagless/misc
```

## Overview

This module is the heart of the Lagless framework, providing:

- **ECS Architecture**: Entity-Component-System pattern with filters
- **Memory Management**: All state in a single ArrayBuffer for snapshots
- **Simulation Loop**: Fixed timestep with rollback support
- **Dependency Injection**: Decorator-based DI for systems
- **Input System**: RPC-based input handling with input delay
- **Signal System**: Predicted/Verified/Cancelled event lifecycle

## Core Concepts

### ECSConfig

Configuration for the simulation:

```typescript
import { ECSConfig } from '@lagless/core';

const config = new ECSConfig({
  // 128-bit seed for deterministic PRNG (16 numbers, each 0-255)
  seed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],

  // Entity pool size
  maxEntities: 1000,

  // Player slots
  maxPlayers: 6,

  // Simulation rate
  fps: 60,

  // Input delay (for network prediction)
  initialInputDelayTick: 2,
  minInputDelayTick: 1,
  maxInputDelayTick: 8,

  // Snapshot storage for rollback
  snapshotRate: 1,           // Store every N ticks
  snapshotHistorySize: 100,  // Keep N snapshots

  // Clock smoothing
  maxNudgePerFrame: 4.17,    // ~1/4 frame at 60fps
});
```

### ECSRunner

The main entry point that wires everything together:

```typescript
import { ECSRunner, AbstractInputProvider, ECSConfig } from '@lagless/core';

// Your generated runner extends ECSRunner
class MyGameRunner extends ECSRunner {
  constructor(
    config: ECSConfig,
    inputProvider: AbstractInputProvider,
    systems: IECSSystemConstructor[],
    signals: ISignalConstructor[],
  ) {
    super(config, inputProvider, systems, signals, MyGameCore);
  }
}

// Usage
const runner = new MyGameRunner(config, inputProvider, [
  MovementSystem,
  PhysicsSystem,
  CollisionSystem,
], [
  GameOverSignal,
  ImpactSignal,
]);

runner.start();

// Game loop
function update(dt: number) {
  runner.update(dt);
  requestAnimationFrame(() => update(performance.now() - lastTime));
}
```

### ECSSimulation

Manages the simulation state and tick processing:

```typescript
// Access via runner
const simulation = runner.Simulation;

// Current tick
const tick = simulation.tick;

// Interpolation factor for rendering (0.0 - 1.0)
const t = simulation.interpolationFactor;

// Access memory manager
const mem = simulation.mem;

// Add tick handler
const unsub = simulation.addTickHandler((tick) => {
  console.log(`Tick ${tick} completed`);
});
```

## Memory Management (Mem)

All game state lives in a single ArrayBuffer:

```typescript
const mem = simulation.mem;

// Export snapshot
const snapshot = mem.exportSnapshot(); // ArrayBuffer copy

// Apply snapshot (for rollback)
mem.applySnapshot(snapshot);

// Get state hash (for determinism verification)
const hash = mem.getHash();

// Access managers
mem.tickManager;          // Current tick
mem.prngManager;          // Deterministic RNG
mem.componentsManager;    // Component data
mem.singletonsManager;    // Global state
mem.filtersManager;       // Entity queries
mem.entitiesManager;      // Entity lifecycle
mem.playerResourcesManager; // Per-player data
```

### EntitiesManager

Create and manage entities:

```typescript
import { EntitiesManager, Prefab } from '@lagless/core';

// Define a prefab
const enemyPrefab = Prefab.create()
  .with(Transform2d)
  .with(Velocity2d)
  .with(Health, { current: 50, max: 50 })
  .with(Enemy);

// In a system
@ECSSystem()
class SpawnSystem implements IECSSystem {
  constructor(private readonly _Entities: EntitiesManager) {}

  update(tick: number) {
    // Create entity from prefab
    const entity = this._Entities.createEntity(enemyPrefab);

    // Check component
    if (this._Entities.hasComponent(entity, Health)) {
      // Add component
      this._Entities.addComponent(entity, Armor);

      // Remove component
      this._Entities.removeComponent(entity, Shield);
    }

    // Destroy entity
    this._Entities.destroyEntity(entity);
  }
}
```

### PRNG

Deterministic random number generator:

```typescript
import { PRNG } from '@lagless/core';

@ECSSystem()
class RandomSystem implements IECSSystem {
  constructor(private readonly _PRNG: PRNG) {}

  update(tick: number) {
    // Float in [0, 1)
    const random = this._PRNG.getFloat53();

    // Integer in [min, max] inclusive
    const roll = this._PRNG.getRandomIntInclusive(1, 6);
  }
}
```

## Systems

### Writing a System

```typescript
import { ECSSystem, IECSSystem, InputProvider, EntitiesManager } from '@lagless/core';

@ECSSystem()
export class MySystem implements IECSSystem {
  constructor(
    // Dependencies are injected automatically
    private readonly _InputProvider: InputProvider,
    private readonly _Entities: EntitiesManager,
    private readonly _Transform: Transform2d,
    private readonly _MyFilter: MyFilter,
  ) {}

  public update(tick: number): void {
    // Process inputs
    const inputs = this._InputProvider.getTickRPCs(tick, MoveInput);

    // Iterate filtered entities
    for (const entity of this._MyFilter) {
      // Update components
    }
  }
}
```

### System Execution Order

Systems execute in the exact order passed to the runner:

```typescript
const systems = [
  // Input processing first
  ApplyInputSystem,

  // Then physics
  IntegrateSystem,
  CollisionSystem,

  // Then game logic
  DamageSystem,
  ScoreSystem,

  // Events last
  EventsSystem,
];
```

## Input System

### AbstractInputProvider

Base class for input providers:

```typescript
import { AbstractInputProvider } from '@lagless/core';

// Built-in implementations:
// - LocalInputProvider: For local/single-player
// - ReplayInputProvider: For replays
// - (Planned) NetworkInputProvider: For multiplayer
```

### LocalInputProvider

```typescript
import { LocalInputProvider } from '@lagless/core';

const inputProvider = new LocalInputProvider(config, inputRegistry);
inputProvider.playerSlot = 0; // This player's slot

// Send inputs (typically from UI)
inputProvider.drainInputs((addRpc) => {
  addRpc(MoveInput, { direction: 1.57, speed: 1.0 });
});
```

### Processing Inputs in Systems

```typescript
public update(tick: number): void {
  // Get all RPCs of type MoveInput for this tick
  const moves = this._InputProvider.getTickRPCs(tick, MoveInput);

  for (const rpc of moves) {
    const { playerSlot, tick: scheduledTick, seq, ordinal } = rpc.meta;
    const { direction, speed } = rpc.data;

    // Process input...
  }
}
```

## Signal System

Signals provide event handling with prediction support:

### Defining a Signal

```typescript
import { Signal, ECSSignal, ECSConfig } from '@lagless/core';

export interface GameOverData {
  winnerId: number;
  score: number;
}

@ECSSignal()
export class GameOverSignal extends Signal<GameOverData> {}
```

### Emitting Signals

```typescript
@ECSSystem()
class GameOverSystem implements IECSSystem {
  constructor(private readonly _GameOverSignal: GameOverSignal) {}

  update(tick: number) {
    if (gameIsOver) {
      this._GameOverSignal.emit(tick, {
        winnerId: winner,
        score: finalScore,
      });
    }
  }
}
```

### Subscribing to Signals

```typescript
// Three event types for handling prediction
signal.Predicted.on((event) => {
  // Called immediately when event is emitted
  // Use for instant visual feedback
});

signal.Verified.on((event) => {
  // Called after maxInputDelayTick ticks if event still exists
  // Event is confirmed
});

signal.Cancelled.on((event) => {
  // Called if event was rolled back
  // Hide/revert visual feedback
});
```

## Dependency Injection

### @ECSSystem Decorator

Automatically injects dependencies:

```typescript
@ECSSystem()
export class MySystem implements IECSSystem {
  constructor(
    private readonly _Config: ECSConfig,
    private readonly _Input: InputProvider,
    private readonly _Entities: EntitiesManager,
    private readonly _PRNG: PRNG,
    private readonly _Transform: Transform2d,  // Generated
    private readonly _Filter: MyFilter,         // Generated
  ) {}
}
```

### Manual Token Override

```typescript
@ECSSystem(ECSConfig, InputProvider, MyCustomToken)
export class MySystem implements IECSSystem {
  constructor(config: any, input: any, custom: any) {}
}
```

### Available Injectables

| Token | Description |
|-------|-------------|
| `ECSConfig` | Configuration object |
| `InputProvider` | Input handling |
| `ECSSimulation` | Simulation state |
| `EntitiesManager` | Entity operations |
| `PRNG` | Random number generator |
| `PlayerResources` | Per-player data access |
| Generated Components | Component data |
| Generated Singletons | Global state |
| Generated Filters | Entity queries |
| Generated Signals | Event emitters |

## Prefabs

Templates for entity creation:

```typescript
import { Prefab } from '@lagless/core';

// Basic prefab
const bulletPrefab = Prefab.create()
  .with(Transform2d)
  .with(Velocity2d)
  .with(Bullet);

// With default values
const playerPrefab = Prefab.create()
  .with(Transform2d)
  .with(Health, { current: 100, max: 100 })
  .with(Player);

// Create entity
const entity = entitiesManager.createEntity(bulletPrefab);
```

## Types

### IECSSystem

```typescript
interface IECSSystem {
  update(tick: number): void;
}
```

### RPC / InputMeta

```typescript
interface InputMeta {
  tick: number;       // Scheduled tick
  seq: number;        // Sequence number
  ordinal: number;    // Order within frame
  playerSlot: number; // Player who sent it
}

class RPC<TInput> {
  inputId: number;
  meta: InputMeta;
  data: TInput['schema'];
}
```

## Usage with Generated Code

The codegen tool generates classes that integrate with core:

```typescript
// Generated runner
import { MyGameRunner } from './schema/code-gen/index.js';

// Generated components, filters, inputs
import {
  Transform2d,
  Health,
  MyFilter,
  MoveInput,
} from './schema/code-gen/index.js';

const runner = new MyGameRunner(
  config,
  inputProvider,
  [MySystem],
  [MySignal],
);
```

See [tools/codegen](../../tools/codegen/README.md) for code generation details.
