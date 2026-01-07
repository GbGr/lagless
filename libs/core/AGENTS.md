# AGENTS.md - @lagless/core

AI coding guide for the core ECS module.

## Module Purpose

Central ECS engine providing:
- Entity-Component-System architecture
- Memory management (single ArrayBuffer)
- Simulation loop with rollback
- Dependency injection for systems
- Input/RPC processing
- Signal system (Predicted/Verified/Cancelled)

## Directory Structure

```
libs/core/src/lib/
├── ecs-config.ts        # Configuration class
├── ecs-runner.ts        # Main runner base class
├── ecs-simulation.ts    # Simulation loop
├── di/
│   ├── di-container.ts  # DI container
│   └── di-decorators.ts # @ECSSystem, @ECSSignal
├── mem/
│   ├── mem.ts           # Memory orchestrator
│   └── managers/
│       ├── components-manager.ts
│       ├── entities-manager.ts
│       ├── filters-manager.ts
│       ├── singletons-manager.ts
│       ├── player-resources-manager.ts
│       ├── tick-manager.ts
│       └── prng-manager.ts
├── input/
│   ├── abstract-input-provider.ts
│   ├── local-input-provider.ts
│   ├── replay-input-provider.ts
│   ├── input-registry.ts
│   ├── rpc.ts
│   └── rpc-history.ts
├── signals/
│   ├── signal.ts
│   ├── signals.registry.ts
│   └── event-emitter.ts
└── types/
    ├── ecs-types.ts
    └── abstract-filter.ts
```

## Key Classes

### ECSConfig

```typescript
class ECSConfig {
  seed: RawSeed;           // 128-bit (16 uint8s)
  maxEntities: number;     // Default: 1000
  maxPlayers: number;      // Default: 6
  fps: number;             // Default: 60
  frameLength: number;     // Computed: 1000/fps
  initialInputDelayTick: number;  // Default: 2
  minInputDelayTick: number;      // Default: 1
  maxInputDelayTick: number;      // Default: 8
  snapshotRate: number;           // Default: 1
  snapshotHistorySize: number;    // Default: 100
  maxNudgePerFrame: number;       // Default: frameLength/4
}
```

### ECSRunner

Base class for game runners:

```typescript
abstract class ECSRunner {
  readonly DIContainer: Container;
  readonly Simulation: ECSSimulation;

  constructor(
    Config: ECSConfig,
    InputProviderInstance: AbstractInputProvider,
    Systems: Array<IECSSystemConstructor>,
    Signals: Array<ISignalConstructor>,
    Deps: ECSDeps,  // Generated Core class
  );

  start(): void;
  update(dt: number): void;
  dispose(): void;
}
```

### ECSSimulation

```typescript
class ECSSimulation {
  readonly mem: Mem;
  readonly clock: SimulationClock;

  get tick(): number;
  get interpolationFactor(): number;

  registerSystems(systems: IECSSystem[]): void;
  start(): void;
  update(dt: number): void;
  addTickHandler(handler: (tick: number) => void): () => void;
}
```

### Mem

Memory orchestrator:

```typescript
class Mem {
  readonly tickManager: TickManager;
  readonly prngManager: PRNGManager;
  readonly componentsManager: ComponentsManager;
  readonly singletonsManager: SingletonsManager;
  readonly filtersManager: FiltersManager;
  readonly entitiesManager: EntitiesManager;
  readonly playerResourcesManager: PlayerResourcesManager;

  exportSnapshot(): ArrayBuffer;
  applySnapshot(buffer: ArrayBuffer): void;
  getHash(): number;
}
```

### EntitiesManager

```typescript
class EntitiesManager {
  createEntity(prefab?: Prefab): number;
  destroyEntity(entity: number): void;
  hasComponent(entity: number, Component: ComponentConstructor): boolean;
  addComponent(entity: number, Component: ComponentConstructor): void;
  removeComponent(entity: number, Component: ComponentConstructor): void;
}
```

### AbstractInputProvider

```typescript
abstract class AbstractInputProvider {
  abstract playerSlot: number;
  abstract getInvalidateRollbackTick(): void | number;

  drainInputs(fn: (addRpc) => void): () => void;
  getTickRPCs<T>(tick: number, InputCtor: T): Array<RPC<T>>;
  update(): void;
  dispose(): void;
}
```

### Signal

```typescript
abstract class Signal<TData> {
  readonly Predicted: EventEmitter<SignalEvent<TData>>;
  readonly Verified: EventEmitter<SignalEvent<TData>>;
  readonly Cancelled: EventEmitter<SignalEvent<TData>>;

  emit(tick: number, data: TData): void;
  dispose(): void;
}
```

## System Implementation

### Template

```typescript
import {
  ECSSystem,
  IECSSystem,
  InputProvider,
  EntitiesManager,
  ECSConfig,
  PRNG,
  PlayerResources,
} from '@lagless/core';
import {
  Transform2d,
  Velocity2d,
  MyFilter,
  MoveInput,
  GameState,
  PlayerData,
} from '../schema/code-gen/index.js';

@ECSSystem()
export class MySystem implements IECSSystem {
  constructor(
    private readonly _Config: ECSConfig,
    private readonly _Input: InputProvider,
    private readonly _Entities: EntitiesManager,
    private readonly _PRNG: PRNG,
    private readonly _PlayerResources: PlayerResources,
    private readonly _Transform: Transform2d,
    private readonly _Velocity: Velocity2d,
    private readonly _GameState: GameState,
    private readonly _Filter: MyFilter,
  ) {}

  public update(tick: number): void {
    // Implementation
  }
}
```

### Accessing Components

#### Unsafe (Fast) - Direct Typed Array

```typescript
// Get typed arrays
const posX = this._Transform.unsafe.positionX;
const posY = this._Transform.unsafe.positionY;

// Iterate and modify
for (const entity of this._Filter) {
  posX[entity] += this._Velocity.unsafe.velocityX[entity];
  posY[entity] += this._Velocity.unsafe.velocityY[entity];
}
```

#### Cursor (Safe) - Object-like Access

```typescript
for (const entity of this._Filter) {
  const cursor = this._Transform.getCursor(entity);
  cursor.positionX += cursor.velocityX;
  cursor.positionY += cursor.velocityY;
}
```

### Accessing Singletons

```typescript
// Via .safe property
const phase = this._GameState.safe.phase;
this._GameState.safe.startedAtTick = tick;
```

### Accessing Player Resources

```typescript
const playerData = this._PlayerResources.get(PlayerData, playerSlot);
const entity = playerData.safe.entity;
playerData.safe.score += 10;
```

### Processing Inputs

```typescript
public update(tick: number): void {
  const moves = this._Input.getTickRPCs(tick, MoveInput);

  for (const rpc of moves) {
    const { playerSlot } = rpc.meta;
    const { direction, speed } = rpc.data;

    const playerData = this._PlayerResources.get(PlayerData, playerSlot);
    const entity = playerData.safe.entity;

    // Apply input to entity
    this._Velocity.unsafe.velocityX[entity] = Math.cos(direction) * speed;
    this._Velocity.unsafe.velocityY[entity] = Math.sin(direction) * speed;
  }
}
```

### Emitting Signals

```typescript
@ECSSystem()
export class CollisionSystem implements IECSSystem {
  constructor(
    private readonly _ImpactSignal: ImpactSignal,
  ) {}

  public update(tick: number): void {
    // On collision detected
    this._ImpactSignal.emit(tick, {
      x: collisionX,
      y: collisionY,
      power: impulseMagnitude,
    });
  }
}
```

## Prefabs

```typescript
import { Prefab } from '@lagless/core';

// Define prefab with components
const bulletPrefab = Prefab.create()
  .with(Transform2d)
  .with(Velocity2d)
  .with(Bullet);

// With default values
const playerPrefab = Prefab.create()
  .with(Transform2d)
  .with(Health, { current: 100, max: 100 })
  .with(CircleBody, { radius: 20, mass: 1 });

// Create entity
const entity = this._Entities.createEntity(playerPrefab);
```

## Simulation Loop Flow

```
update(dt)
│
├─ clock.update(dt)
│   └─ Accumulate time
│
├─ checkAndRollback(currentTick)
│   ├─ Get rollbackTick from inputProvider
│   └─ If rollback needed:
│       ├─ signalsRegistry.onBeforeRollback()
│       ├─ Find nearest snapshot
│       └─ mem.applySnapshot()
│
├─ simulationTicks(currentTick, targetTick)
│   └─ While currentTick < targetTick:
│       ├─ tickManager.setTick(++tick)
│       ├─ simulate(tick) - run all systems
│       ├─ signalsRegistry.onTick() - verify signals
│       ├─ storeSnapshotIfNeeded()
│       └─ Call tick handlers
│
├─ inputProvider.update()
│   └─ Drain and buffer inputs
│
└─ Calculate interpolationFactor
```

## Input Delay Mechanics

```
Current Tick: 100
Input Delay: 2

User presses button at tick 100
 └─ RPC scheduled for tick 102
     └─ Processed in system.update(102)
```

## Signal Lifecycle

```
Tick 100: Signal emitted
 └─ Predicted event fired immediately

Tick 108 (100 + maxInputDelayTick):
 ├─ If signal still in pending → Verified event
 └─ If signal was rolled back → Cancelled event
```

## Dependency Injection

### @ECSSystem Decorator

```typescript
// Auto-infer from constructor params
@ECSSystem()
export class MySystem { ... }

// Manual override
@ECSSystem(ECSConfig, CustomService)
export class MySystem { ... }
```

### @ECSSignal Decorator

```typescript
@ECSSignal()
export class MySignal extends Signal<MyData> {}
```

### Container Registration (automatic in ECSRunner)

```typescript
container.register(ECSConfig, config);
container.register(InputProvider, inputProvider);
container.register(EntitiesManager, mem.entitiesManager);
container.register(PRNG, mem.prngManager.prng);

// All generated components, singletons, filters
for (const [Ctor, instance] of mem.componentsManager) {
  container.register(Ctor, instance);
}
```

## Filter Iteration

Filters are iterable:

```typescript
// Direct iteration
for (const entity of this._MyFilter) {
  // entity is a number (entity ID)
}

// To array
const entities: number[] = [];
for (const entity of this._Filter) {
  entities.push(entity);
}
```

## PRNG Usage

```typescript
// Float in [0, 1)
const f = this._PRNG.getFloat53();

// Integer in [min, max] inclusive
const i = this._PRNG.getRandomIntInclusive(1, 100);

// State is part of snapshot - deterministic across rollbacks
```

## Common Patterns

### Guard by Game Phase

```typescript
public update(tick: number): void {
  // Don't process until game started
  if (tick < this._GameState.safe.startedAtTick) return;

  // Don't process after game ended
  if (this._GameState.safe.finishedAtTick > 0) return;

  // Normal processing
}
```

### Store Previous for Interpolation

```typescript
public update(tick: number): void {
  for (const entity of this._Filter) {
    // Store previous before update
    this._Transform.unsafe.prevPositionX[entity] =
      this._Transform.unsafe.positionX[entity];

    // Update current
    this._Transform.unsafe.positionX[entity] += velocity;
  }
}
```

### Check Entity Validity

```typescript
if (entity !== 0 && this._Entities.hasComponent(entity, Transform2d)) {
  // Entity exists and has component
}
```

## DO's and DON'Ts

### DO

- Use `unsafe` accessors in performance-critical loops
- Keep systems single-responsibility
- Process inputs only at their scheduled tick
- Use PRNG for all randomness
- Store previous values for interpolation
- Check game phase before processing

### DON'T

- Use `Math.random()` (breaks determinism)
- Create objects in hot loops
- Access DOM in systems
- Make async calls in update()
- Edit generated code-gen files
- Assume entity 0 is valid (it's often "null")

## Integration with Generated Code

### Generated Core Class (ECSDeps)

```typescript
// Generated by codegen
export const MyGameCore: ECSDeps = {
  components: [Transform2d, Velocity2d, Health],
  singletons: [GameState],
  filters: [MovableFilter, HealthFilter],
  playerResources: [PlayerData],
  inputRegistry: new MyGameInputRegistry(),
};
```

### Generated Runner

```typescript
// Generated by codegen
export class MyGameRunner extends ECSRunner {
  constructor(
    config: ECSConfig,
    inputProvider: AbstractInputProvider,
    systems: IECSSystemConstructor[],
    signals: ISignalConstructor[] = [],
  ) {
    super(config, inputProvider, systems, signals, MyGameCore);
  }
}
```
